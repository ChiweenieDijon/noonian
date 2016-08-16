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
var Q = require('q');
var _ = require('lodash');


var db = require('../../api/datasource');
var auth = require('../../api/auth');

var GridFsService = require('../../api/datasource/gridfs');

var conf = require('../../conf');
var wsUtil = require('../util');

var controller = {};



/**
 * init()
**/
exports.init = function(app) {

  app.route(conf.urlBase+'/*')
      .get(wsUtil.wrap(controller.getWebResource));

}


controller.getWebResource = function(req, res) {
  var firstSlash = 1;
  if(conf.urlBase) {
    firstSlash = conf.urlBase.length+1;
  }
  var lastSlash = req.path.lastIndexOf('/');
  var path = req.path.substring(firstSlash, lastSlash);
  var name = req.path.substring(lastSlash+1);

  var qPos = name.indexOf('?');
  if(qPos > -1) {
    name = name.substring(0, qPos);
  }

  console.log('WebResource - path:%s name:%s', path, name);

  //First, look for exact path and name
  // if we don't find it, assume requested path is a child path of another resource (e.g. a URL representation of a state in an angular app)
  // in that case, need to find WebResource w/ path that is a prefix of requested one.

  db.WebResource.find({name:name, path:path}).exec().then(function(result) {

      if(result && result.length) {
        return result;
      }

      //Before returning a 404, let's look for 'parent' resources:
      return db.WebResource.find({},{name:1, path:1}).then(function(fullList) {
          var fullRequestedPath = path+'/'+name;
          console.log('Requested: %s', fullRequestedPath);

          var longestMatch;
          var longestMatchLength = 0;

          _.forEach(fullList, function(wr) {
            var myFullPath = wr.path + '/' + wr.name;
            //Requested path begins w/ path of the resource...
            if(fullRequestedPath.indexOf(myFullPath) === 0 && myFullPath.length > longestMatchLength) {
              longestMatchLength = myFullPath.length;
              longestMatch = wr;
            }
          });

          if(longestMatch) {
            return db.WebResource.find({_id:longestMatch._id}).exec();
          }
          else {
            return [];
          }

      });

  })
  .then(
    function(result) {
      if(!result || result.length === 0) {
        var msg = 'WebResource not found: path='+path+' and name='+name;
        return wsUtil.handleError(res, msg, 404);
      }

      var wr = result[0];

      //Check permissions...
      auth.checkRoles(req, wr.rolespec).then(
        function() {

          if(wr.serveContent) {
            return wr.serveContent(res);
          }
          else {
            console.log('MISSING serveContent for ws '+wr.__t);
          }


          return wsUtil.handleError(res, 'Couldnt serve WebResource '+req.path, 500);
        },
        function(err) {
          //Role check failed... send 401 status
          wsUtil.handleError(res, err, 401);
        }
      );
    },

    function(err) {
      //Failed query against WebResource...
      wsUtil.handleError(res, 'Problem obtaining web resource: '+err, 500);
    }
  );

};
