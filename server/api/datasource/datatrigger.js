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
/**
 * datatrigger.js
 * All functionality to respond to data-update events to DataTrigger's
 */
var Q = require('q');
var _ = require('lodash');
var db = require('./index');

var invokerTool = require('../../tools/invoker');

var appConfig = require('../../conf');


var dataTriggers = {
  before:{
    '*':{onCreate:[], onUpdate:[], onDelete:[]}
  },
  after:{
    '*':{onCreate:[], onUpdate:[], onDelete:[]}
  }
};

var dtBackrefs = {}; //maps dataTrigger id to arrays that contain it


var registerDataTriggerObj = function(dt) {
  var bucket = dataTriggers[dt.before_after];
  var bodId = dt.business_object && dt.business_object._id ? dt.business_object._id : '*';

  var dtId = dt._id || 'none';
  dt.priority = dt.priority || 0;

  if(!bucket[bodId])
    bucket[bodId] = {onCreate:[], onUpdate:[], onDelete:[]};

  if(!dtBackrefs[dtId])
    dtBackrefs[dtId] = [];

  var arr;
  if(dt.on_create) {
    arr = bucket[bodId].onCreate;
    arr.push(dt);
    dtBackrefs[dtId].push(arr);
  }
  if(dt.on_update) {
    arr = bucket[bodId].onUpdate;
    arr.push(dt);
    dtBackrefs[dtId].push(arr);
  }
  if(dt.on_delete) {
    arr = bucket[bodId].onDelete;
    arr.push(dt);
    dtBackrefs[dtId].push(arr);
  }
};

var unregisterDataTrigger = function(dtId) {
  // console.log('unregister dataTrigger: %s - %j', dtId, dtBackrefs[dtId]);
  if(dtBackrefs[dtId]) {
    _.forEach(dtBackrefs[dtId], function(containingArray) {
      for(var i=0; i < containingArray.length; i++) {
        if(containingArray[i]._id === dtId) {
          containingArray.splice(i, 1);
          break;
        }
      }
    });
    dtBackrefs = [];
  }

}

//For system-level triggers not stored in the DB
var registerDataTrigger =
exports.registerDataTrigger = function(key, bodId, beforeAfter, onCreate, onUpdate, onDelete, actionFn, priority) {
  registerDataTriggerObj({
    key:key,
    business_object:(bodId  ? {_id:bodId} : null),
    before_after:beforeAfter,
    on_create:onCreate,
    on_update:onUpdate,
    on_delete:onDelete,
    action:actionFn,
    priority: (priority || 0)
  });
};


exports.init = function() {
  return db.DataTrigger.find({}).exec().then(function(dtList) {

    _.forEach(dtList, registerDataTriggerObj);


    //When a DataTrigger object change happens, update our cache
    registerDataTrigger('sys.internal.dataTriggerCacheUpdate', 'w1FEKYa4SbiVPVqAtEWJyw', 'after', true, true, true, function(isCreate, isDelete) {
      if(!isCreate)
        unregisterDataTrigger(this._id);
      if(!isDelete)
        registerDataTriggerObj(this);
    });


  });
};



var processTriggers = function(bodId, beforeAfter, createUpdateDelete, modelObj, keyFilter) {
  // var promises = [];
  var promiseChain = Q(true);

  var bucket = dataTriggers[beforeAfter];

  var dtList = bucket['*'][createUpdateDelete] || [];

  if(bucket[bodId])
    dtList = dtList.concat(bucket[bodId][createUpdateDelete]);

  dtList = _.sortBy(dtList, 'priority');

  var filterRegex = false;
  if(keyFilter) {
    try {
      filterRegex = new RegExp(keyFilter);
    } catch (err) {
      console.log('invalid keyFilter in processTriggers: %s', keyFilter);
    }
  }
  // console.log('DATA TRIGGGAZ: %j', dtList);
  var injectables = {
    id:modelObj._id,
    isUpdate:(createUpdateDelete==='onUpdate'),
    isCreate:(createUpdateDelete==='onCreate'),
    isDelete:(createUpdateDelete==='onDelete')
  };


  _.forEach(dtList, function(dt){

    if(filterRegex && !filterRegex.test(''+dt.key)) {
      console.log('SKIPPING DataTrigger %s (not matching regex %s)', dt.key, keyFilter);
      return;
    }

    try {
      console.log('invoking %s DataTrigger %s for %s.%s',  createUpdateDelete,dt.key, modelObj._bo_meta_data.class_name, modelObj._id);
      // promises.push(
      //   invokerTool.invokeAndReturnPromise(dt.action, injectables, modelObj)
      // );
      promiseChain = promiseChain.then(invokerTool.invokeAndReturnPromise.bind(null, dt.action, injectables, modelObj));

    }
    catch(err) {
      console.error('ERROR inovking %s %s dataTrigger %s - %s', beforeAfter, createUpdateDelete, dt.key, err);
      // promises.push(Q.reject(err));
    }

  });


  // return Q.all(promises);
  return promiseChain;
}



exports.processBeforeCreate = function(modelObj, keyFilter) {
	// console.log("**BEFORE CREATE for "+modelObj._bo_meta_data.class_name);
  return processTriggers(modelObj._bo_meta_data.bod_id, 'before', 'onCreate', modelObj, keyFilter);
};

exports.processBeforeUpdate = function(modelObj, keyFilter) {
	// console.log("**BEFORE UPDATE for "+modelObj._bo_meta_data.class_name);
  return processTriggers(modelObj._bo_meta_data.bod_id, 'before', 'onUpdate', modelObj, keyFilter);
};

exports.processBeforeDelete = function(modelObj, keyFilter) {
	// console.log("**BEFORE DELETE for "+modelObj._bo_meta_data.class_name);
	return processTriggers(modelObj._bo_meta_data.bod_id, 'before', 'onDelete', modelObj, keyFilter);
};



exports.processAfterCreate = function(modelObj, keyFilter) {
	// console.log("**AFTER CREATE for "+modelObj._bo_meta_data.class_name);
	return processTriggers(modelObj._bo_meta_data.bod_id, 'after', 'onCreate', modelObj, keyFilter);
};

exports.processAfterUpdate = function(modelObj, keyFilter) {
	// console.log("**AFTER UPDATE for "+modelObj._bo_meta_data.class_name);
  return processTriggers(modelObj._bo_meta_data.bod_id, 'after', 'onUpdate', modelObj, keyFilter);
};

exports.processAfterDelete = function(modelObj, keyFilter) {
	// console.log("**AFTER DELETE for "+modelObj._bo_meta_data.class_name);
	return processTriggers(modelObj._bo_meta_data.bod_id, 'after', 'onDelete', modelObj, keyFilter);
};
