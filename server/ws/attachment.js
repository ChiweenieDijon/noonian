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
var fs = require('fs');
var Q = require('q');
var _ = require('lodash');
var express = require('express');
var multiparty = require('multiparty');

var conf = require('../conf');
var wsUtil = require('./util');

var util = require('util');

var GridFsService = require('../api/datasource/gridfs');
var db = require('../api/datasource');

// var config = require('../api/config');

var controller = {};


var wsRoot = conf.urlBase+'/attachment_ws';

/**
 * init()
**/
exports.init = function(app) {
  var router = express.Router();

  router.post('/upload', wsUtil.wrap(controller.upload));
  router.get('/download/:fileId', wsUtil.wrap(controller.download));

  app.use(wsRoot, router);
}

/**
 *
**/
controller.upload = function(req, res) {
  var form = new multiparty.Form();
  var onError = wsUtil.handleError.bind(null, res);

  var mode = req.query.mode;

  var fileReceived = false;
  var attachmentId = false;
  var metaObj = false;
  var metaObjStr = '';

  var allDataReceived = Q.defer();

  form.on('error', onError);

  form.on('part', function(part) {
    part.on('error', onError);
    console.log('got a field named %s', part.name);

    if (part.filename) {
      if(fileReceived) {
        //duplicate
        part.resume();
      }
      fileReceived = true;
      GridFsService.saveFile(part, metaObj).then(function(fileId) {

        //file has been saved to gridfs
        attachmentId = fileId;

        if(metaObj && attachmentId) {
          allDataReceived.resolve(true);
        }

      });
    }
    else {
      //metadata
      part.on('readable', function() {
        if(!metaObj) {
          //in case it comes in pieces...
          metaObjStr += part.read().toString();
          try {
            metaObj = JSON.parse(metaObjStr);
            if(metaObj && attachmentId) {
              allDataReceived.resolve(true);
            }
          }
          catch(err) {}
        }

      })
    }
  });

  form.on('close', function() {
    if(!fileReceived) {
      allDataReceived.reject('no file received');
      return onError('no file received');
    }
  });


  form.parse(req);

  allDataReceived.promise.then(function() {

    metaObj.attachment_id = attachmentId;

    if(mode === 'file-resource') {
      //One more step - create a corresponding FileResource object
      var targetPath = req.query.resource_path;

      return new db.FileResource({
        path:targetPath,
        name:metaObj.filename,
        content:metaObj
      }).save().then(function(fileResourceObj){
        metaObj.file_resource_id = fileResourceObj._id;
        metaObj.file_resource_path = targetPath;
        res.json({result:metaObj});
      });
    }
    else {
      //plain old attachment;
      res.json({result:metaObj});
    }
  });
};

/**
 *
**/
controller.download = function(req, res) {

  var fileId = req.params.fileId;
  var onError = wsUtil.handleError.bind(null, res);

  GridFsService.getFile(fileId).then(function(f) {

    res.attachment(f.metadata.filename);
    res.set('Content-Length', f.metadata.size);

    var rs = f.readstream;


    rs.on('error', onError);

    // **SHOULD** just be able to pipe the stream to res,
    ///  but something stupid is going on with encoding.

    rs.setEncoding('base64');
    rs.on('data', function(chunk) {
      res.write(chunk, 'base64');
    });
    rs.on('end', function() {
      res.end();
    });

  },
  onError);
};

