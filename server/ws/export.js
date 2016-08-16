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
var express = require('express');
var mime = require('mime');
var invokerTool = require('../tools/invoker');


var conf = require('../conf');
var wsUtil = require('./util');

var db = require('../api/datasource');
var auth = require('../api/auth');

var controller = {};


var wsRoot = conf.urlBase+'/export';

/**
 * init()
**/
exports.init = function(app) {
  var router = express.Router();

  router.get('/:exportId/:className', wsUtil.wrap(controller.performExport));

  app.use(wsRoot, router);
}



/**
 *  Takes a query, streams the results to the proper DataExport transformer
 *  The DataExport transformer reads the object stream, writes to the output stream
 **/
controller.performExport = function(req, res) {

  var className = req.params.className;
  var exportId = req.params.exportId;

  console.log('performExport: %s, %s', className, exportId);

  if(!className || !exportId || !db[className]) {
    return wsUtil.handleError(res, 'Missing/invalid required parameter', 404);
  }

  var dbQuery = wsUtil.extractDbQuery(req);

  var TargetModel = db[className];

  var dataExportPromise = db.DataExport.findOne({_id:exportId});

  var dacPromise = auth.checkReadDacs(req, TargetModel, dbQuery);

  Q.all([dataExportPromise, dacPromise]).then(function(resultArr){

    var dataExportObj = resultArr[0];
    var queryObj = resultArr[1];
    console.log(queryObj);

    if(!dataExportObj) {
      return wsUtil.handleError(res, 'Invalid DataExport instance', 404);
    }


    var query = TargetModel.find(queryObj.where, queryObj.select);

    if(queryObj.sort)
      query.sort(queryObj.sort);
    if(queryObj.limit)
      query.limit(queryObj.limit);
    if(queryObj.skip)
      query.skip(queryObj.skip);

    query.lean(true); //return plain objects instead of full-fledged mongoose docs

    var contentType = dataExportObj.content_type;
    var ext = '';

    if(contentType) {
      res.type(contentType);
      ext = mime.extension(contentType);
      ext = ext ? '.'+ext : '';
    }
    res.attachment(className+'_export'+ext);

    //Now invoke the DataExport.transform_fn
    console.log('Invoking DataExport %s', dataExportObj.name);
    var transformParams = {
      className: className,
      query:queryObj,
      getInputStream:function() { return query.stream() },
      outputStream:res,
      params:req.query
    }
    invokerTool.invokeInjected(dataExportObj.transform_fn, transformParams, dataExportObj);

  },
  function(err) {
    //AggregateReadDacs rejected promise indicates auth failure
    wsUtil.handleError(res, err, 401);
  });
  //////////////////////////////



};
