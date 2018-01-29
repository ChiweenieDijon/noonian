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
/**
 * util.js
 **/
'use strict';
var _ = require('lodash');
var fs = require('fs');

var authWs = require('./auth');
/**
* Utility to handle a web service error by
* 1) logging it to console
* 2) writing standardized error JSON to response object
*/
var handleError =
exports.handleError = function(res, err, status) {
  
  if(err === '$role_check_failure' && res.locals.user && res.locals.user.anonymous) {
    //Want to redirect to login 
    return authWs.redirectToLogin(res);
  }
  
  if(err instanceof Error) {
    console.error(err.message);
    console.error(err.stack);
    err = err.message;
  }
  else {
    console.error(err);
  }

  if(err.status)
    res.status(err.status);
  else if(status)
    res.status(status);

  return res.json({error:""+err});
};

/**
* Wraps a controller function with a try/catch to provide top-level error handling
*  to a web service function
* @param controllerFn
* @return the wrapped function.
*/
exports.wrap = function(controllerFn) {
  //lodash wrap passes the first
  return _.wrap(controllerFn, function(wrappedFn, req, res) {
    try {
      return wrappedFn.apply(this, _.rest(arguments));
    }
    catch(err) {
      return handleError(res, err);
    }
  });
};


/**
 * Grabs/parses all the parameters for a db query from req.query:
 *  select where sort skip limit groupBy
 **/
exports.extractDbQuery = function(req) {
  var result = {
    where:{},
    limit:req.query.limit,
    skip:req.query.skip,
    groupBy:req.query.groupBy
  };

  if(req.query.where) {
    try {
      result.where = JSON.parse(req.query.where);
    } catch(e) {console.log(e)}
  }
  if(req.query.select) {
    try {
      result.select = JSON.parse(req.query.select);
    } catch(e) {console.log(e)}
  }
  if(req.query.sort) {
    try {
      result.sort = JSON.parse(req.query.sort);
    } catch(e) {console.log(e)}
  }

  return result;
}


/**
 * Sends result of a promise as a response.
**/
exports.sendPromiseResult = function(res, promise) {
  promise.then(
    function(result) {
      res.json({result:result});
    },
    function(err) {
      handleError(res, err, 500);
    }
  );
};

exports.sendTemplatedHtml = function(res, filePath, templateValues) {
  var content = fs.readFileSync(filePath).toString();

  for(var key in templateValues) {
    var regex = new RegExp('\\${'+key+'}');
    content = content.replace(regex, templateValues[key]);
  }
  res.send(content);

};
