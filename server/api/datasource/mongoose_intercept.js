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


/*
********************************************************
 * The below functions intecept calls to mongose public api.
 * First the prototype functions (when the Model object refers to a document)
 * Then to the "static" functions.
********************************************************
 TODO: stuff inherited from Document
 */

/**
 * Model.prototype.save(options, fn)
 */
var proto_save = function(options, fn) {
  if(this._stub) {
    throw "Attempting to save a stub Model object - call unstub() first";
  }

  if ('function' == typeof options) {
      fn = options;
      options = undefined;
  }
  if (!options) {
      options = {};
  }

  // console.log("**Intercepted save for "+this._bo_meta_data.class_name);
  var wrappedSave = this._noon_wrapped_proto.save.bind(this, options); //this.save_wrapped.bind(this, options);
  var callOnDone;
  if(('function' === typeof fn))
    callOnDone = fn;
  else
    callOnDone = dummyFn;


  var THIS = this;

  var isUpdate = !this.isNew;

  var beforeDataTrigger, afterDataTrigger;
  if(options.skipTriggers) {
    beforeDataTrigger = afterDataTrigger = function() {return Q(true)};
  }
  else {
    beforeDataTrigger = datatrigger[isUpdate ? 'processBeforeUpdate' : 'processBeforeCreate'];
    afterDataTrigger = datatrigger[isUpdate ? 'processAfterUpdate' : 'processAfterCreate'];
    if(options.currentUser) {
      THIS._current_user = options.currentUser;
    }
  }



  // if(options._datatrigger_meta_data) {
  //   console.log('mongoose_intercept options: %j', options);
  //   THIS._dt_meta_data = options._dt_meta_data
  // }

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
        throw "$update-on-deleted";
      }

      //Check that the version id matches:
      if(''+THIS.__ver !== ''+result.__ver) {
        console.log('Version mismatch - THIS: %s current: %s', THIS.__ver, result.__ver);
        throw "$version-mismatch-error";
      }

      THIS._previous = {__ver:result.__ver};
      for(var fieldName in THIS._bo_meta_data.type_descriptor) {
        if(fieldName.indexOf('_') !== 0)
          THIS._previous[fieldName] = result[fieldName];
      }
    });
  }
  else {
    firstPromise = Q(true);
  }

  return firstPromise.then(beforeDataTrigger.bind(null, THIS, keyFilter, options)) //invoke "before" data trigger, passing
    .then(function() {
      // console.log("Calling wrapped save %j", THIS);
      FieldTypeService.processToDb(THIS);

      //"Increment" version id
      if(options.useVersionId)
        THIS.__ver = options.useVersionId; //New one may be provided by caller (for replication, bootstrap)
      else {
        if(isUpdate && !(THIS._previous.__ver instanceof mongoose.Types.ObjectId) ) {
          var vid = new VersionId(THIS._previous.__ver);
          vid.increment();
          THIS.__ver = vid.toString();
        }
        else {
          THIS.__ver = VersionId.newVersionIdString();
        }
      }


      return wrappedSave();
    })
    .then(function(modelObj) {
      FieldTypeService.processFromDb(modelObj);
      return afterDataTrigger(modelObj, keyFilter, options).then(function(){return modelObj;});
    })
    .then(
      function(modelObj) { callOnDone(null, modelObj) },
      function(err) { console.log("ERROR saving %s, %s", THIS._id, err); callOnDone(err, null) }
    );
};

/**
 * Model.prototype.remove(options, fn)
 */
var proto_remove = function(options, fn) {
  if ('function' == typeof options) {
      fn = options;
      options = undefined;
  }
  if (!options) {
      options = {};
  }
  // console.log("**Intercepted remove() for "+this._bo_meta_data.class_name);
  var wrappedRemove = this._noon_wrapped_proto.remove.bind(this, options); //this.remove_wrapped.bind(this, options);

  var callOnDone;
  if('function' == typeof fn)
    callOnDone = fn;
  else
    callOnDone = dummyFn;

  var THIS = this;

  var keyFilter;
  if(options.filterTriggers) {
    keyFilter = options.filterTriggers;
  }

  return datatrigger.processBeforeDelete(THIS, keyFilter, options)
    .then(function() {
      return wrappedRemove();
    })
    .then(function() {
      return datatrigger.processAfterDelete({_id:THIS._id, _previous:THIS, _bo_meta_data:THIS._bo_meta_data}, keyFilter, options);
    })
    .then(
      function() { callOnDone(null, THIS) },
      function(err) { callOnDone(err, null) }
    );

};


/**
 * query_exec wraps the exec() of a query object
 */
var query_exec = function(op, callback) {
  if ('function' == typeof op) {
      callback = op;
      op = null;
  }
  // console.log("**Intercepted query.exec()**");
  if('function' != typeof callback)
    callback = dummyFn;

  var deferred = Q.defer();

  //Call the wrapped exec, sans callback.
  this.exec_wrapped(op).then(
    function(result) {
      //TODO what comes back may not be full-fledged business objects;
      //  i.e. if only a subset of the fields were selected...
      if(result instanceof Array) {
       for(var i=0; i < result.length; i++) {
         if(result[i]._bo_meta_data)
           FieldTypeService.processFromDb(result[i]);
       }
      }
      else if(result && result._bo_meta_data) {
        FieldTypeService.processFromDb(result);
      }

      deferred.resolve(result);
      callback(null, result);
    },
    function(err) {
      deferred.reject(err);
      callback(err, null);
    }
  );

  return deferred.promise;
}


/**
 * Model.find(conditions, fields, options, callback)
 */
var find = function(conditions, fields, options, callback) {
  if ('function' == typeof conditions) {
    callback = conditions;
      conditions = {};
      fields = null;
      options = null;
  } else if ('function' == typeof fields) {
      callback = fields;
      fields = null;
      options = null;
  } else if ('function' == typeof options) {
      callback = options;
      options = null;
  }

  if(conditions == null)
    conditions = {};

  // console.log("**Intercepted find() for "+this._bo_meta_data.class_name);
  // massageConditions(conditions, this._bo_meta_data.type_descriptor);
  QueryOpService.queryToMongo(conditions, this._bo_meta_data);
  // console.log("Model.find query conditions: %j", conditions);
  var wrappedFind = this._noon_wrapped.find.bind(this); //this.find_wrapped.bind(this);

  //Call it without passing the callback; it returns us a Query object
  var query  = wrappedFind(conditions, fields, options);

  //proxy the exec() function so we can massage incoming data
  query.exec_wrapped = query.exec;
  query.exec = query_exec;
  //TODO wrap Query.stream()


  //If we were provided a callback, exec the query
  if('function' == typeof callback) {
    query.exec(callback);
  }

  return query;
};

/**
 * Model.findById(id, fields, options, callback)
 *
 */
 // var findById = function(id, fields, options, callback) {
  // console.log("**Intercepted findById() for "+this._bo_meta_data.class_name);
  // return this.findById_wrapped.apply(this, arguments);
 // };

/**
 * Model.findOne(conditions, fields, options, callback)
 */
var findOne = function(conditions, fields, options, callback) {
  if ('function' == typeof options) {
    callback = options;
    options = null;
  } else if ('function' == typeof fields) {
    callback = fields;
    fields = null;
    options = null;
  } else if ('function' == typeof conditions) {
    callback = conditions;
    conditions = {};
    fields = null;
    options = null;
  }
  // console.log("**Intercepted findOne() for "+this._bo_meta_data.class_name);
  // massageConditions(conditions, this._bo_meta_data.type_descriptor);
  QueryOpService.queryToMongo(conditions, this._bo_meta_data);
  var wrappedFind = this._noon_wrapped.findOne.bind(this); //this.findOne_wrapped.bind(this);

  //Call it without passing the callback; it returns us a Query object
  var query  = wrappedFind(conditions, fields, options);

  //proxy the exec() function so we can massage incoming data
  query.exec_wrapped = query.exec;
  query.exec = query_exec;

  //If we were provided a callback, exec the query
  if('function' == typeof callback) {
    query.exec(callback);
  }

  return query;
};

/**
 * Model.remove(conditions, callback)
 */
var remove = function(conditions, callback) {
  if ('function' === typeof conditions) {
    callback = conditions;
      conditions = {};
  }
  // console.log("**Intercepted batch remove() for "+this._bo_meta_data.class_name);
  //This one we'll do differently than simply calling the wrapped Model.remove:
  // query according to the conditions
  // perform the delete individually on each result, accumulating the returned promises
  // return promise.all

  var promise = this.find(conditions).then(
    function(results) {
      var promises = [];
      for(var i=0; i < results.length; i++) {
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

/**
 * Model.count(conditions, callback)
 */
 var count = function(conditions, callback) {
  if ('function' === typeof conditions) {
    callback = conditions;
      conditions = {};
  }
  // massageConditions(conditions, this._bo_meta_data.type_descriptor);
  QueryOpService.queryToMongo(conditions, this._bo_meta_data);

  var wrappedCount = this._noon_wrapped.count.bind(this);
  return wrappedCount(conditions, callback);//this.count_wrapped(conditions, callback);
};

/**
 * Model.prototype.model(name)
 * Model.prototype.increment()
 */
/**
 * Model.create(doc, fn)
 * Model.remove(conditions, callback)
 * Model.update(conditions, doc, options, callback)
 * Model.distinct = function distinct (field, conditions, callback)
 * Model.aggregate = function aggregate ()
 * Model.populate = function (docs, paths, cb)
 */
/**
 * Model.where = function where (path, val)
 * Model.$where = function $where ()
 * Model.findOneAndUpdate = function (conditions, update, options, callback)
 * Model.findByIdAndUpdate = function (id, update, options, callback)
 * Model.findOneAndRemove = function (conditions, options, callback)
 */
/**
 * Model.discriminator(name, schema)
 * Model.ensureIndexes(cb)
 * Model.hydrate = function (obj)
 * Model.mapReduce = function mapReduce (o, callback)
 * Model.geoNear = function (near, options, callback)
 * Model.geoSearch = function (conditions, options, callback)
 */

/**
 * Convert a model object to a plain js object
 */
var toPlainObject = function() {
  return JSON.parse(JSON.stringify(this));
  //some problem with this._doc.toObject()
};

//$op -> fn(fieldValue, condValue)
var condCheckers = {
  $eq:function(f, c, type) {},

}

var satisfiesCondition = function(cond) {
  // console.log('Checking %s against condition %j', this._id, cond);
  return QueryOpService.satisfiesCondition(this, cond);
}

var protoWrappers = {
  save: proto_save,
  remove: proto_remove
};

var staticWrappers = {
  find:find,
  count:count,
  findOne:findOne,
  remove:remove
};


/**
 * Add metadata and intercept DB access
 */
exports.decorateModel = function(MongooseModel, BOD) {

  //Metadata
  // MongooseModel.__proto__._metadata = {type_descriptor:BOD.definition, class_name:BOD.class_name};
  // var metaObj = {
  //  class_name: BOD.class_name,
  //  type_descriptor: BOD.definition
  // };

  var metaObj = MongooseModel.schema._bo_meta_data;
  // console.log("%s metadata: %j", BOD.class_name, metaObj);

  MongooseModel._bo_meta_data = metaObj; //Available statically...
  MongooseModel.prototype._bo_meta_data = metaObj; // and when it gets propogated down to instantiations.
  MongooseModel.prototype.toPlainObject = toPlainObject;
  MongooseModel.prototype.satisfiesCondition = satisfiesCondition;


  //Wrap necessary prototype functions, storing originals into a "_noon_wrapped_proto" property
  if(!MongooseModel.prototype._noon_wrapped_proto) {
    MongooseModel.prototype._noon_wrapped_proto = {};
    for(var fName in protoWrappers) {
      MongooseModel.prototype._noon_wrapped_proto[fName] = MongooseModel.prototype[fName];
      MongooseModel.prototype[fName] = protoWrappers[fName];
    }
  }

  //Wrap static functions, storing originals in "_noon_wrapped" property
  if(!MongooseModel._noon_wrapped) {
    MongooseModel._noon_wrapped = {};

    for(var fName in staticWrappers) {
      MongooseModel._noon_wrapped[fName] = MongooseModel[fName];
      MongooseModel[fName] = staticWrappers[fName];
    }
  }


};



// exports.decorateModel = function(, MongooseModel, BOD) {

//   var MongooseSchema = MongooseModel.schema;
//   var metaObj = MongooseSchema._bo_meta_data;


//   MongooseModel._bo_meta_data = metaObj; //Available statically...
//   MongooseModel.prototype._bo_meta_data = metaObj; // and when it gets propogated down to instantiations.

//   //Add in hooks for pre and post processing

//   MongooseSchema.pre('save', function(next) {

//   });
// };
