/*
Copyright (C) 2016  Eugene Lockett  gene@noonian.org

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program.  If not, see <http://www.gnu.org/licenses/>.
*/
'use strict';
/*
Auth Web Service
  POST /auth/login
  POST /auth/newUser
*/

var Q = require('q');
var _ = require('lodash');
var querystring = require('querystring');

var express = require('express');
var passport = require('passport');
var LocalStrategy = require('passport-local').Strategy;

var jwt = require('jsonwebtoken');
var expressJwt = require('express-jwt');


var conf = require('../../conf');
var wsUtil = require('../util');

var db = require('../../api/datasource');
var auth = require('../../api/auth');
var configSvc = require('../../api/config');


var tfa;

var controller = {};
var wsRoot = conf.urlBase+'/auth';


var tokenAccessMap = {};
var inactivityDuration = false;
var publicUrl = false;
var anonymousUser = undefined;

var inactivityExemptions = {};
try {
    var whitelist = require('../../tokenWhitelist.json');
    if(whitelist && whitelist instanceof Array) {
        _.forEach(whitelist, function(t) {
            inactivityExemptions[t] = true;
        });
    }
} catch(err) {}

var checkToken = function(token) {
  if(!inactivityDuration || inactivityExemptions[token]) return true;

  var lastAccess = tokenAccessMap[token];
  if(lastAccess === undefined) return false;

  var now = new Date().getTime();

  if((now - lastAccess) > inactivityDuration) {
    delete tokenAccessMap[token];
    return false;
  }
  else {
    tokenAccessMap[token] = now;
    return true;
  }

};

var loginToken = function(token) {
  if(inactivityDuration) {
    tokenAccessMap[token] = new Date().getTime();
  }
}

/**
 * Returns the middleware function that handles authentication headers/cookies
**/
exports.getAuthInterceptor = function(app) {
    //express-jwt examines the JWT token out of the Authorization header and sets req.user
  var jwtValidator = expressJwt({ secret: conf.secrets.session, credentialsRequired:false });

  return function(req, res, next) {
    var suppliedToken = null;


      // allow access_token to be passed through query parameter as well ?
      // if(req.query && req.query.hasOwnProperty('access_token')) {
      //   suppliedToken = req.query.access_token;
      //   req.headers.authorization = 'Bearer ' + suppliedToken;
      // }
      // else 
      if(req.cookies && req.cookies.hasOwnProperty('access_token')) {
        suppliedToken = req.cookies.access_token.replace(/\"/g,'');
        req.headers.authorization = 'Bearer ' + suppliedToken;
      }
      else if(req.headers.authorization && req.headers.authorization.indexOf('Bearer') === 0) {
        suppliedToken = req.headers.authorization.substring(7);
      }

      // var authHeader = req.headers.authorization;
      // if(authHeader && authHeader.indexOf('Bearer') === 0) {
      //   suppliedToken = authHeader.substring(7); //skip bearer
      // }
      if(!checkToken(suppliedToken)) {
        console.log('EXPIRED TOKEN %s', suppliedToken);
        delete req.headers.authorization;
      }

      if(req.headers.authorization) {
        try {
          // var decoded = jwt.verify(suppliedToken, conf.secrets.session);
          // console.log('JWT: %j', decoded);
          jwtValidator(req, res, next);
        }
        catch (err) {
          // console.log('JWT VALIDATOR EXCEPTION!!!!!');
          //Handle unauthrized status:
          wsUtil.handleError(res, err);
        }
      }
      else if(req.originalUrl === conf.urlBase+'/auth/login') {
        console.log('heading to /auth/login');
        next();
      }
      else if(
        (publicUrl && publicUrl.test(req.originalUrl)) ||
        (req.originalUrl.indexOf(conf.urlBase+'/login.html') == 0 ) ||
        (req.originalUrl.indexOf(conf.urlBase+'/public') == 0 ) ||
        (req.originalUrl.indexOf(conf.urlBase+'/ws/public') == 0 ||
          req.originalUrl.indexOf(conf.urlBase+'/favicon') == 0 )
      ) {
        //(no logged-in user required)
        req.user = anonymousUser;
        console.log('heading to public resource: '+req.originalUrl);
        next();
      }
      else {
        var redirectPath = conf.urlBase+'/login.html?originalUrl='+querystring.escape(req.originalUrl);

        console.log('REDIRECTING TO LOGIN: %s', redirectPath);
        res.redirect(redirectPath);

        // var loginPath = app.get('appPath') + '/login.html';
        // res.status(401);
        // wsUtil.sendTemplatedHtml(res, app.get('appPath')+'/login.html', {urlBase:conf.urlBase, message:''});
      }
    };
};

/**
 * init()
**/
exports.init = function(app) {

  //First, set up the routes
  var router = express.Router();
  router.post('/login', wsUtil.wrap(controller.login));
  router.post('/changePassword', wsUtil.wrap(controller.changePassword));

  app.use(wsRoot, router);

  //Set up passport so that when form w/ 'username' and 'password' fields are posted to the endpoint,
  //  the provided function is called to perform the authentication
  passport.use(
    new LocalStrategy({
        usernameField: 'username',
        passwordField: 'password',
        passReqToCallback:true
      },

    function(req, username, password, done) {

      db.User.findOne({name: username},
        function(err, user) {
          if (err) return done(err);

          // console.log('attempting login for %j \n-----', user);
          // console.log('   matches: %s', user.password.matches(password));

          if (!user || user.disabled) {
            return done(null, false, { error: '$invalid_credentials' });
          }
          if (!user.password.matches(password)) {
            return done(null, false, { error: '$invalid_credentials' });
          }
          
          //Password matches for valid user, now check for 2-factor if applicable...
          if(tfa) {              
              var providedCode = req.body.second_factor_code;
              var ip = req.connection.remoteAddress;
              
              //console.log('TFA configured; checking for user %s at IP %s', user.name, ip);
              
              //Do we have a code?
              if(providedCode) {
                  //console.log('...validating code %s', providedCode);
                  tfa.validate2fa(user, ip, providedCode).then(function(validationResult) {
                      if(validationResult.success) {
                          return done(null, user);
                      }
                  });
              }
              else {
                  //none provided... does this user require one?
                  tfa.requires2fa(user, ip).then(function(isRequired) {
                      if(isRequired) {
                          console.log('TWO FACTOR DEEMED REQUIRED');
                          tfa.initiate2fa(user, ip).then(function() {
                              return done(null, false, { user:user._id, twoFactorRequired:true });
                          },
                          function(err) {
                              console.log(err.message);
                              return done(null, false, {error:err.message});
                          });
                      }
                      else {
                          //2fa not requried for this user; login process complete
                          return done(null, user);
                      }
                  });
                  
              }
          }
          else {
              //no two-factor configured; login process complete
              return done(null, user);
          }
        }
      );
    }
  ));

  configSvc.getParameter('sys.inactivityDuration', false).then(function(val) {
    inactivityDuration = val;
  });

  configSvc.getParameter('sys.publicUrl', false).then(function(val) {
    if(val) {
      try {
        publicUrl = new RegExp(val.regex);
        if(val.userId) {
          anonymousUser = {_id:val.userId};
        }
      }
      catch(err) {
        console.err('UNABLE TO LOAD publicUrl regex: %j', err);
      }
    }
  });
  
  if(conf.twoFactorAuth && db.TwoFactorAuthImplementation) {
      console.log('TWO-FACTOR AUTH CONFIGURED: %s', conf.twoFactorAuth.implementation);
      var TwoFactorAuthUtil = require('./twofactor');
      tfa = new TwoFactorAuthUtil(conf.twoFactorAuth);
  }

};


/**
 * Returns a jwt token signed by the app secret
 */
function signToken(id) {
  // return jwt.sign({ _id: id }, conf.secrets.session, { expiresInMinutes: 60*5 });
  return jwt.sign({ _id: id }, conf.secrets.session);
}


/**
 *
**/
controller.login = function(req, res, next) {
  if(!req.params.username && !req.params.password && req.user && req.user._id) {
    console.log("ALREADY LOGGED IN!!! %j", req.user);
    var authHeader = req.headers.authorization;
    var token = authHeader.substring(authHeader.indexOf(' ')+1);

    db.User.findOne({_id:req.user._id}).then(function(user) {
      if(!user) {
        res.clearCookie('access_token');
        return res.redirect(conf.urlBase+'/login.html');
      }

      var userData = {_id:user._id, isAdmin:false};
      for(var k in db.User._bo_meta_data.type_descriptor) {
        if(k.indexOf('_') !== 0 && k !== 'password')
          userData[k] = user[k];
      }
      if(user.roles) {
        for(var i=0; i < user.roles.length; i++) {
          if(user.roles[i] && user.roles[i]._id === 'FnQ_eBYITOSC8kJA4Zul5g') {
            userData.isAdmin = true;
            break;
          }
        }
      }

      return res.json({token:token, user:userData});
    });
  }
  else {
    console.log('ATTEMPTING LOGIN');
    passport.authenticate('local',

      function (err, user, info) {
          
        var error = err || info;

        if (error) return res.status(401).json(error);
        if (!user) return res.status(404).json({message: 'Something went wrong, please try again.'});
        

        //Generate a token to be used for subsequent requests
        var token = signToken(user._id);
        loginToken(token);
        res.cookie('access_token', token, {path:(conf.urlBase+'/')});

        if(req.body.redirectme) {
          res.redirect(req.body.redirectme);
        }
        else {
          res.json({token: token, user:user});
        }
      }

      )(req, res, next);
    }
};

controller.changePassword = function(req, res) {
  var newPw = req.body.password;

  auth.updateUserPassword(req, newPw).then(function() {
      res.json({result:'success'});
    },
    function(err) {
      res.json({result:err});
    }
  );

};
