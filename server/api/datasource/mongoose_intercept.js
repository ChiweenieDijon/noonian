/*
Copyright (C) 2016-2018  Eugene Lockett  gene@noonian.org

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
 * mongoose_intercept.js
 * All of the functionality to wire into Mongoose's API to
 *  - massage data going into and coming out of the DB
 *  - trigger appropriate events based on data changes
 */

var Q = require('q');
var _ = require('lodash');
var mongoose = require('mongoose');
var Schema = mongoose.Schema,
  ObjectId = Schema.Types.ObjectId,
  Mixed = Schema.Types.Mixed;

var db = require('./index');
var FieldTypeService = require('./fieldtypes');
var QueryOpService = require('./query');
var datatrigger = require('./datatrigger');

var VersionId = require('./version_id');

var dummyFn = function() {};






const hook_preSave = function(next, options) {
  //console.log('PRE-SAVE HOOK %j', this._id);
  if(this.__noon_status) {
    //console.log('DUPLICATE PRE-SAVE %j', this._id);
    return next();
  }
  var THIS = this;
  var isUpdate = !this.isNew;
  
  //Hang onto some info we need to retain for the "post" hook
  this.__noon_status = {
    options,
    isUpdate
  };

  var beforeDataTrigger;
  if(options.skipTriggers) {
    beforeDataTrigger = function() {return Q(true)};
  }
  else {
    beforeDataTrigger = datatrigger[isUpdate ? 'processBeforeUpdate' : 'processBeforeCreate'];    
    if(options.currentUser) {
      THIS._current_user = options.currentUser;
    }
  }

  var keyFilter;
  if(options.filterTriggers) {
    keyFilter = options.filterTriggers;
  }

  var firstPromise;
  if(isUpdate) {
    //Grab prev version
    firstPromise = db[THIS._bo_meta_data.class_name].findOne({_id:THIS._id}).exec().then(function(result) {
      if(!result) {
        console.log('Save called on deleted object: %s.%s', THIS._bo_meta_data.class_name, THIS._id);
        return next(new Error("$update-on-deleted"));
      }

      //Check that the version id matches:
      var newVer = new VersionId(THIS.__ver);
      var currVer = new VersionId(result.__ver);
      if(!currVer.relationshipTo(newVer).same) {
        console.log('Version mismatch on %s.%s - THIS: %s current: %s', THIS._bo_meta_data.class_name, THIS._id, THIS.__ver, result.__ver);
        return next(new Error("$version-mismatch-error"));
      }

      THIS._previous = {__ver:result.__ver};
      for(var fieldName in THIS._bo_meta_data.type_desc_map) {
        if(fieldName.indexOf('_') !== 0)
          THIS._previous[fieldName] = result[fieldName];
      }
    });
  }
  else {
    firstPromise = Q(true);
  }
  
  firstPromise
    .then(beforeDataTrigger.bind(null, THIS, keyFilter, options)) //invoke "before" data triggers
    .then(
      function() {
        //console.log("SAVE after 'before' triggers: %j", THIS);
        FieldTypeService.processToDb(THIS);

        //"Increment" version id
        if(options.useVersionId) {
          THIS.__ver = options.useVersionId; //New one may be provided by caller (for replication, bootstrap)
        }
        else {
          if(isUpdate) {
            var vid = new VersionId(THIS._previous.__ver);
            vid.increment();
            THIS.__ver = vid.toString();
          }
          else {
            THIS.__ver = VersionId.newVersionIdString();
          }
        }

        next();
      },
      function(err) {
        err = err instanceof Error ? err : new Error(err);
        next(err);
      }
    );
};


const hook_postSave = function(modelObj, next) {
  //console.log('POST-SAVE HOOK %j', arguments);  
  
  if(!this.__noon_status) {    
    //console.log('POST-SAVE MISSING __noon_status: %j', modelObj._id);
    return next();
  }
  
  const options = this.__noon_status.options;
  const isUpdate = this.__noon_status.isUpdate;
  
  delete this.__noon_status;

  var afterDataTrigger;
  if(options.skipTriggers) {
    afterDataTrigger = function() {return Q(true)};
  }
  else {
    afterDataTrigger = datatrigger[isUpdate ? 'processAfterUpdate' : 'processAfterCreate'];
    if(options.currentUser) {
      this._current_user = options.currentUser;
    }
  }
  
  const keyFilter = options.filterTriggers || null;

  FieldTypeService.processFromDb(modelObj);
  
  const deferred = Q.defer();
  this._post_triggers_promise = deferred.promise;
  
  afterDataTrigger(modelObj, keyFilter, options).then(
    function(){
      deferred.resolve(modelObj);
      next();
    },
    function(err) {
      deferred.reject(err);
      err = err instanceof Error ? err : new Error(err);
      next(err);
    }
  );
  
};

const hook_preRemove = function(next) {
  var THIS = this;
  var options = {};
  
  this.__noon_status = {
    options
  };
  
  var myContext = this[Symbol.for('context')];
  if(myContext) {
    options.context = myContext;
  }
  
  var keyFilter = options.filterTriggers || null;
  
  //Do we need to ensure the object passed to DataTriggers has all its fields?
  // (could have been removed using a model object that was the result of a query w/ limited projection)
  db[THIS._bo_meta_data.class_name].findOne({_id:THIS._id}).exec().then(function(result) {
    THIS.__noon_status._previous = result;
    datatrigger.processBeforeDelete(result, keyFilter, options).then(
      function() {
          next();
      },
      function(err) {
        err = err instanceof Error ? err : new Error(err);
        next(err);
      }
    );
  });
};

const hook_postRemove = function(modelObj, next) {
  var THIS = this;
  
  if(!this.__noon_status) {    
    console.log('POST-REMOVE MISSING __noon_status: %j', modelObj._id);
    return next();
  }
  
  const options = this.__noon_status.options;
  const keyFilter = options.filterTriggers || null;
  const previous = this.__noon_status._previous
  delete this.__noon_status;
  
  const deferred = Q.defer();
  this._post_triggers_promise = deferred.promise;
  
  var modelObjStub = { //pass a "post-delete stub" to the after DataTriggers
    _id:THIS._id, 
    _previous:previous, 
    _bo_meta_data:THIS._bo_meta_data
  };
  
  datatrigger.processAfterDelete(modelObjStub, keyFilter, options).then(
    function() {
      deferred.resolve(THIS)
      next();
    },
    function(err) {
      deferred.reject(err);
      err = err instanceof Error ? err : new Error(err);
      next(err);
    }
  );
};

/**
 * Creates a "pre-processor wrapper" for massage query criteria 
 * to apply noonian context and non-standard query op's
 * Wraps mongoose Query functions: count, find, findOne, (update)
 * 
 */
const getQueryPreprocessorWrapper = function(wrappedFn, boMetaData) {
  return function(criteria) {
    if(criteria && criteria.$useContext) {
      let context = criteria.$useContext;
      //console.log('Applying context %j %j', boMetaData.class_name, context);
      delete criteria.$useContext;
      
      QueryOpService.applyNoonianContext(criteria, context);
    }
    
    QueryOpService.queryToMongo(criteria, boMetaData);
    return wrappedFn.apply(this, arguments);
  };
};



const hook_postFind = function(result, next) {
  //console.log('POST-FIND %j', result);
  //console.log('  %j', this);
  
  if(result instanceof Array) {
    for(var i=0; i < result.length; i++) {
      if(result[i]._bo_meta_data) {
        FieldTypeService.processFromDb(result[i]);
      }
    }
  }
  else if(result && result._bo_meta_data) {
    FieldTypeService.processFromDb(result);
  }
  next();
};




/**
 * Model.remove(conditions, callback)
 * (funky intercepting required since middleware not available for static remove)
 */
const remove = function(conditions, callback) {
  if ('function' == typeof conditions) {
    callback = conditions;
    conditions = {};
  } 
  
  //pluck out the context if we have it:
  var context = conditions && conditions.$useContext;
  if(context) {        
    delete conditions.$useContext;
    QueryOpService.applyNoonianContext(conditions, context);
  }
  QueryOpService.queryToMongo(conditions, this._bo_meta_data);
  
  // query according to the conditions
  // perform the delete individually on each result, accumulating the returned promises
  // return promise.all

  var promise = this.find(conditions, {_id:1}).then(
    function(results) {
      var promises = [];
      for(var i=0; i < results.length; i++) {
        results[i][Symbol.for('context')] = context;
        promises.push(results[i].remove());
      }
      return Q.all(promises);
    }
  );


  if('function' == typeof callback) {
    promise = promise.then(
      function(result) { callback(null, result) },
      function(err) { callback(err) }
    );
  }

  return promise;

}


/////////////////////////////////////////////
//  additions to the base mongoose model:
/////////////////////////////////////////////
/**
 * Convert a model object to a plain js object
 */
var toPlainObject = function() {
  return JSON.parse(JSON.stringify(this));
  //some problem with this._doc.toObject()
};

var satisfiesCondition = function(cond) {
  // console.log('Checking %s against condition %j', this._id, cond);
  return QueryOpService.satisfiesCondition(this, cond);
}



/**
 * Add metadata and intercept DB access
 */
exports.decorateModel = function(MongooseModel) {
  
  var metaObj = MongooseModel.schema._bo_meta_data;

  MongooseModel._bo_meta_data = metaObj; //Available statically...
  MongooseModel[Symbol.for('metadata')] = metaObj;
  
  MongooseModel.prototype._bo_meta_data = metaObj; // and when it gets propogated down to instantiations.
  MongooseModel.prototype[Symbol.for('metadata')] = metaObj;
  
  MongooseModel.prototype.toPlainObject = toPlainObject;
  MongooseModel.prototype.satisfiesCondition = satisfiesCondition;
  
  //Override the built-in Model.remove() to do it our way (which triggers DataTriggers)
  MongooseModel.remove = remove;
  //MongooseModel.update = update; //TODO intercept update() to run data triggers
  
  
  //Wrap "query" functions on model
  //TODO consider ES6 Proxy 
  MongooseModel.count = getQueryPreprocessorWrapper(MongooseModel.count, metaObj);
  MongooseModel.find = getQueryPreprocessorWrapper(MongooseModel.find, metaObj);
  MongooseModel.findOne = getQueryPreprocessorWrapper(MongooseModel.findOne, metaObj);
  
};


exports.registerHooks = function(schema) {
  schema.pre('save', hook_preSave);
  schema.post('save', hook_postSave);
  
  schema.pre('remove', hook_preRemove);
  schema.post('remove', hook_postRemove);
  
  
  //"pre-find" happens in a wrapper to allow preprocessing of query conditions
  schema.post('find', hook_postFind);
  schema.post('findOne', hook_postFind);
  //no post for count; no results to postprocess
  
  
  
  //schema.pre('', hook_pre);
  //schema.post('', hook_post);
};


