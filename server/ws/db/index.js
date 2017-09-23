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
db Web Service
  Defines the server-side logic for datasource api webservice endpoints
   * GET     /db/:className              ->  list
   * GET     /db/:className/:id          ->  get
   * POST    /db/:className              ->  save
   * DELETE  /db/:className/:id          ->  remove
*/
var Q = require('q');
var _ = require('lodash');
var express = require('express');

var conf = require('../../conf');
var wsUtil = require('../util');

var db = require('../../api/datasource');
var auth = require('../../api/auth');

var controller = {};


var wsRoot = conf.urlBase+'/db';

/**
 * init()
**/
exports.init = function(app) {
  var router = express.Router();

  router.get('/:className', wsUtil.wrap(controller.list));
  router.get('/:className/:id', wsUtil.wrap(controller.get));

  router.post('/:className', wsUtil.wrap(controller.save));
  router.post('/:className/:id', wsUtil.wrap(controller.save));

  router.delete('/:className', wsUtil.wrap(controller.remove));
  router.delete('/:className/:id', wsUtil.wrap(controller.remove));

  app.use(wsRoot, router);
}


/**
 * utility function to strip fields from modelObj that are marked as excluded in projectionObj
**/
var stripForbiddenFields = function(projectionObj, modelObj) {
  var anyChange = false;
  for(var fieldName in projectionObj) {
    if(projectionObj[fieldName] == 0 && modelObj.hasOwnProperty(fieldName)) {
      anyChange = true;
      delete modelObj[fieldName];
    }
  }
  return anyChange;
}

/**
 * utility function to clean up projection so it doesn't have a mixture of inclusion/exclusion
**/
var cleanupProjection = function(projectionObj) {
  var anyInclusion = false;
  var exclusionFields = [];

  for(var fieldName in projectionObj) {
    if(projectionObj[fieldName] === 0) {
      exclusionFields.push(fieldName);
    }
    else {
      anyInclusion = true;
    }
  }
  //If there's any inclusion fields, then all others are excluded by default
  if(anyInclusion) {
    for(var i=0; i < exclusionFields.length; i++) {
      delete projectionObj[exclusionFields[i]];
    }
  }
};


controller.list = function(req, res) {
  var className = req.params.className;
   //console.log("WS list %s", className);

  var conditions = null,
    fields,
    sort,
    groupBy = req.query.groupBy,
    limit = req.query.limit,
    skip = req.query.skip;

  if(limit !== undefined)
    limit = +limit;

  if(skip !== undefined)
    skip = +skip;

  if(req.query.where) {
    try {
      conditions = JSON.parse(req.query.where);
    } catch(e) {console.log(e)}
  }
  if(req.query.select) {
    try {
      fields = JSON.parse(req.query.select);
    } catch(e) {console.log(e)}
  }
  if(req.query.sort) {
    try {
      sort = JSON.parse(req.query.sort);
    } catch(e) {console.log(e)}
  }

   //console.log('%s %j %j %j %s %s', className,conditions,fields,sort,limit,skip);

  var TargetModel = db[className];

  Q.all([
    auth.getCurrentUser(req),
    auth.aggregateReadDacs(req, TargetModel)
  ])
  .then(function(resultArr){
    var currUser = resultArr[0].toPlainObject()
    var dacObj = resultArr[1];
    
    var dacCond = dacObj.condition;
    var dacProj = dacObj.fieldRestrictions;

    //Incorporate DAC restrictions into the requested query
    var queryObj;
    if(dacCond) {
      if(conditions)
        queryObj = {$and:[conditions, dacCond]};
      else
        queryObj = dacCond;
    }
    else {
      queryObj = conditions || {};
    }
    // console.log("Querying %s: %j", className, queryObj);

    //Incorporate field restrictions into the projection
    if(dacProj) {
      if(fields)
        _.assign(fields, dacProj);
      else
        fields=dacProj;
    }

    cleanupProjection(fields);
    
    var queryOptions = {noonianContext:{currentUser:currUser}};
    

    TargetModel.count(queryObj, queryOptions, function(err, totalRecords) {
      if(err)
        return wsUtil.handleError(res, err);
      
      var query;

      if(!groupBy) {
        //Simple case: not a group-by query.  just do a find.
        query = TargetModel.find(queryObj, fields, queryOptions);
        
        if(sort)
          query.sort(sort);
        if(skip)
          query.skip(skip);
        if(limit)
          query.limit(limit);

        query.exec().then(
          function(result) {
            res.json({
              nMatched:totalRecords,
              result:result
            });
          },
          wsUtil.handleError.bind(this, res) //Error handler for promise rejection
        );
      }
      else {
        //Construct an aggretation pipeline for groupBy...

        //sort by the groupBy field, to ensure consistent behavior for pagination
        // (don't want members of a group scattered accross different pages!)
        var gbSort = groupBy;

        if(sort) {
          //If a sort was requested, make sure we do group-by sort *before* the requested sort
          for(var sf in sort) {
            if(sf == groupBy) continue;
            if(sort[sf] == -1 || sort[sf] === 'desc' || sort[sf] === 'descending')
              gbSort += ' -'+sf;
            else
              gbSort += ' '+sf;
          }
        }

        if(TargetModel._bo_meta_data.getTypeDescriptor(groupBy).type === 'reference') {
          //TODO, use FieldTypeService to extract groupBy and sort clauses
          groupBy = groupBy+'._id';
        }

        query = TargetModel.aggregate()
          .match(queryObj);

        //https://jira.mongodb.org/browse/SERVER-13715
        if(fields)
          query.project(fields);

        query.sort(gbSort);


        if(skip)
          query.skip(skip);
        if(limit)
          query.limit(limit);

        query.group({
          _id:'$'+groupBy,
          group:{$push:'$$CURRENT'}
        })
        .sort({_id:1});


        var countQuery = TargetModel.aggregate()
          .match(queryObj)
          .group({
            _id:'$'+groupBy,
            count:{$sum:1}
          });


        Q.all([query.exec(), countQuery.exec()]).then(function(resultArr) {
          var results = resultArr[0];
          var countGroups = _.indexBy(resultArr[1], '_id'); //Key's the elements in resultArr[1] by _id property

          _.forEach(results, function(groupObj) {
            var countObj = countGroups[groupObj._id];
            if(countObj) {
              groupObj.count = countObj.count;
            }
          });

          res.json({
              nMatched:totalRecords,
              result:results
            });
        },
        wsUtil.handleError.bind(this, res));
      }



    });

  },
  function(err) {
    //AggregateReadDacs rejected promise indicates auth failure
    wsUtil.handleError(res, err, 401);
  });
  //////////////////////////////



};

// Get a single BO
controller.get = function(req, res) {
  var className = req.params.className;
  var id = req.params.id;
  // console.log("WS get %s $s", className, id);

  var fields;
  if(req.query.select) {
    try {
      fields = JSON.parse(req.query.select);
    } catch(e) {console.log(e)}
  }


  var TargetModel = db[className];

  //auth.aggregateReadDacs(req, TargetModel).then(function(dacObj){
  Q.all([
    auth.getCurrentUser(req),
    auth.aggregateReadDacs(req, TargetModel)
  ])
  .then(function(resultArr){
    var currUser = resultArr[0].toPlainObject()
    var dacObj = resultArr[1];
      
    var dacCond = dacObj.condition;
    var dacProj = dacObj.fieldRestrictions;

    var queryObj = {_id:id};

    if(dacCond) {
      queryObj = {$and:[queryObj, dacCond]};
    }

    if(dacProj) {
      if(fields)
        _.assign(fields, dacProj);
      else
        fields=dacProj;
    }
    cleanupProjection(fields);
    
    var queryOptions = {noonianContext:{currentUser:currUser}};

    TargetModel.findOne(queryObj, fields, queryOptions, function(err, result){
      if(err) { return wsUtil.handleError(res, err); }
      if(!result) { return wsUtil.handleError(res, className+" "+id+" not found", 404); }
      return res.json({result:result});
    });

  },
  function(err) {
    //AggregateReadDacs rejected promise indicates auth failure
    wsUtil.handleError(res, err, 401);
  });

};



//Save: insert or update a single item, or batch update multiple according to criteria
controller.save = function(req, res) {
  //console.log("SAVE: %j", req.body);
  var className = req.params.className;
  var id = req.params.id;
  if(req.body._id) {
    if(!id)
      id = req.body._id;
    delete req.body._id;
  }
  //console.log("Save %s.%s", className, id);

  var conditions;
  if(req.query.where) {
    conditions = JSON.parse(req.query.where); //May throw exception
  }

  var TargetModel = db[className];

  if(id) {
    /*
      *** Single-item update ***
    */
    //auth.aggregateUpdateDacs(req, TargetModel).then(function(dacObj){
    Q.all([
        auth.getCurrentUser(req),
        auth.aggregateUpdateDacs(req, TargetModel)
    ])
    .then(function(resultArr){
      var currUser = resultArr[0].toPlainObject();
      var dacObj = resultArr[1];
    
      var dacCond = dacObj.condition;
      var dacProj = dacObj.fieldRestrictions;

      //DAC Update requirments:
      // 1. the existing record conforms to the "condition" specified by the DAC
      // 2. no fields are updated that "field restrictions" forbid
      var queryObj = {_id:id};

      //Append the DAC condition to the query
      if(dacCond) {
        queryObj = {$and:[queryObj, dacCond]};
      }
      
      var queryOptions = {noonianContext:{currentUser:currUser}};

      TargetModel.findOne(queryObj, null, queryOptions, function(err, result) {
        if(err) { return wsUtil.handleError(res, err); }
        if(!result) { return wsUtil.handleError(res, "Not authorized to update", 401); }

        //We've got the existing record, which passes the DAC conditions.

        //Now, just strip out any forbidden fields, apply changes to the existing record, and commit the update.
        var newObj = req.body;
        if(dacProj)
          if(stripForbiddenFields(dacProj, newObj))
            console.log('WARNING: attempted to update restricted field: user %s, record %s %s', req.user._id, className, id);

        _.assign(result, newObj); //Apply fields from newObj atop result

        
        return result.save({currentUser:currUser}, null).then(function (saveResult) {
          delete saveResult._current_user;
          return res.json({result:saveResult, nModified:1});
        },
        function(err) {
          return wsUtil.handleError(res, err);
        });

      });

    },
    function(err) {
      //AggregateXyzDacs rejected promise indicates auth failure
      wsUtil.handleError(res, err, 401);
    });
  }
  else if(conditions) {
    /*
      *** Batch update ***
    */
    //auth.aggregateUpdateDacs(req, TargetModel).then(function(dacObj){
    Q.all([
        auth.getCurrentUser(req),
        auth.aggregateUpdateDacs(req, TargetModel)
    ])
    .then(function(resultArr){
      var currUser = resultArr[0].toPlainObject()
      var dacObj = resultArr[1];
      
      var dacCond = dacObj.condition;
      var dacProj = dacObj.fieldRestrictions;

      //Incorporate DAC restrictions into the requested query
      var queryObj;
      if(dacCond) {
        queryObj = {$and:[conditions, dacCond]};
      }
      else {
        queryObj = conditions;
      }

      var updateObj = req.body;
      if(dacProj)
        if(stripForbiddenFields(dacProj, updateObj))
          console.log('WARNING: attempted to update restricted field: user %s, record %s %s', req.user._id, className, id);
    
      
      //var queryOptions = {noonianContext:{currentUser:currUser}, multi:true};
      //TODO: mongoose batch update is not yet wrapped; therefore no data triggers or noonianContext
      
      TargetModel.update(queryObj, updateObj, {multi:true}, function(err, result) {
        if(err)
          return wsUtil.handleError(res, err);
        result.result="success";
        return res.json(result);
      });

    },
    function(err) {
      //AggregateXyzDacs rejected promise indicates auth failure
      wsUtil.handleError(res, err, 401);
    });

  }
  else {
    /*
      *** Single insert ***
    */
    //auth.aggregateCreateDacs(req, TargetModel).then(function(dacObj){
    Q.all([
        auth.getCurrentUser(req),
        auth.aggregateCreateDacs(req, TargetModel)
    ])
    .then(function(resultArr){
      var currUser = resultArr[0].toPlainObject()
      var dacObj = resultArr[1];
      
      var dacCond = dacObj.condition;
      var dacProj = dacObj.fieldRestrictions;

      var newObj = req.body;
      if(dacProj)
        if(stripForbiddenFields(dacProj, newObj))
          console.log('WARNING: attempted to insert w/ restricted field: user %s, record %s %j', req.user._id, className, newObj);

      var newModelObj = new TargetModel(newObj);
      
      if(dacCond) {
          db._svc.QueryOpService.applyNoonianContext(dacCond, {currentUser:currUser});
      }

      if(auth.checkCondition(dacCond, newModelObj)) {
        
        return newModelObj.save({currentUser:currUser}, null).then(function(saveResult) {
          delete saveResult._current_user;
          //Respond with the inserted object as the result
          return res.json({result:saveResult, nInserted:1});
        },
        wsUtil.handleError.bind(null, res)
        );
      }
      else {
        wsUtil.handleError(res, 'Not authorized to insert', 401);
      }

    },
    function(err) {
      //AggregateXyzDacs rejected promise indicates auth failure
      wsUtil.handleError(res, err, 401);
    });
  }
};



//Remove: either a single by ID or batch based on criteria.
controller.remove = function(req, res) {
  //console.log("REMOVE: %j", req.params);
  var className = req.params.className;
  var id = req.params.id;
  var conditions;

  // console.log("WS delete %s %s %j", className, id);
  if(req.query.where) {
    conditions = JSON.parse(req.query.where);
  }

  var TargetModel = db[className];

  if(id) {
    conditions = {_id:id};
  }
  else if(!conditions) {
    return wsUtil.handleError(res, "No conditions specified");
  }


  //auth.aggregateDeleteDacs(req, TargetModel).then(function(dacObj){
  Q.all([
    auth.getCurrentUser(req),
    auth.aggregateDeleteDacs(req, TargetModel)
  ])
  .then(function(resultArr) {
    var currUser = resultArr[0];
    var dacObj = resultArr[1];
    var dacCond = dacObj.condition;

    var queryObj;
    if(dacCond) {
      queryObj = {$and:[conditions, dacCond]};
    }
    else {
      queryObj = conditions;
    }
    
    var queryOptions = {noonianContext:{currentUser:currUser}};

    TargetModel.remove(queryObj, queryOptions, function(err, result) {
      if(err) { return wsUtil.handleError(res, err); }
      return res.json({result:"success", nRemoved:result.length}); //TODO if result.length=0, is it success?
    });

  },
  function(err) {
    //AggregateXyzDacs rejected promise indicates auth failure
    wsUtil.handleError(res, err, 401);
  });

};
