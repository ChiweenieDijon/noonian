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
 * fieldtypes.js
 *  logic pertaining to FieldType objects: mongoose schema elements, calling to/fromDb function
 * @module db._svc.FieldTypeService
 */

var mongoose = require('mongoose'); require('mongoose-function')(mongoose);
var validate = require('mongoose-validator');
var Schema = mongoose.Schema,
  ObjectId = Schema.Types.ObjectId,
	   Mixed = Schema.Types.Mixed;

var db = require('./index');

var _ = require('lodash');
var Q = require('q');


var initialized = false;
var ftMap = {
  object:{
    to_db:function (value) {
        //https://docs.mongodb.org/manual/faq/developers/#dollar-sign-operator-escaping
        //Escape any keys that start with $ or contain one or more dots
        var ud = '\uFF04';
        var udot = '\uFF0E';
        
        var escapeDollars = function(obj) {
            if(typeof obj === 'object') {
                for(var key in obj) {
                    escapeDollars(obj[key]);
                    if(typeof key === 'string') {
                        if(key.indexOf('$')===0) {
                            var newKey = ud+key.substring(1);
                            obj[newKey] = obj[key];
                            delete obj[key];
                        }
                        if(key.indexOf('.') > -1) {
                            var newKey = key.replace(/\./g, udot);
                            obj[newKey] = obj[key];
                            delete obj[key];
                        }
                    }
                }
            }
        };
        
        escapeDollars(value);
        return value;
    }
  }
};


//These types, when persisted to filesystem, will be separated out to their own files
var specialFsTypes = {
	sourcecode:function(td) {
		return {
			extension:td.language || 'js'
		};
	},
	'function':function() {
		return {extension:'js'};
	}
};

/**
 * Caches FieldType objects from db into ftMap.
 * used for initialization.
 * @private
 * @return {promise} fullfilled upon completion of caching
 */
var cacheAndIndex = function() {
  return db.FieldType.find({}).exec().then(function(ftList) {

    for(var i=0; i < ftList.length; i++) {
      var ft = ftList[i];
      ftMap[ft.name] = ft;
      ftMap[ft._id] = ft;
      
      if(!ft.toFileSystem && specialFsTypes[ft.name]) {
		  ft.toFileSystem = specialFsTypes[ft.name];
	  }
    }
    //console.log('FieldTypes cached and indexed: %j', Object.keys(ftMap));

  });
};

/**
 * Initialize FieldType cache from DB.
 * @return {promise} fullfilled upon completion of caching
 **/
exports.init = function() {
  console.log('Initializing FieldType service')
  return cacheAndIndex().then(function() {
    //TODO Register data trigger
    initialized = true;
  });
};



//Map the fundamental noonian field type names to the object Mongoose is expecting.
// used when bootstrapping the data layer (since the FieldType instances themselves come from the data layer!)
var bootstrapTypeMap = {
  'string':String,
  'text':String,
  'jsdoc':String,
  'path':String,
  'sourcecode':String,
  'boolean':Boolean,
  'integer':Number,
  'function':Function,
  'reference':Mixed,
  'rolespec':Mixed,
  'object':Mixed,
  'attachment':Mixed,
  'password':Mixed,
  'image':Mixed,
  'datetime':Date,
  'url':String
};


//Map the string in FieldType.mongo_type to the actual object Mongoose is expecting in its schema
var mongoTypeMap = {
  'String':String,
  'Boolean':Boolean,
  'Number':Number,
  'Date':Date,
  'Mixed':Mixed,
  'Function':Function,
  'Buffer':Buffer
};

/**
 * Convert typeDescriptor object from BOD into mongoose schema element.
 * @return the object used by the Mongoose schema for a field w/ provided typeDescriptor
 * @todo Recurse into composite field types?
 **/
exports.getSchemaElem = function(typeDescriptor) {
  var tdType = typeDescriptor.type;
  var ft = ftMap[tdType];
  if(initialized && ft) {
    var result = {
      type:mongoTypeMap[ft.mongo_type],
      textIndex:!!(ft.text_index || typeDescriptor.text_index)
    };

    if(ft.get_validator) {
      var v = ft.get_validator(typeDescriptor); //TODO: make injectable?
      if(v != null)
        result.validator = v;
    }

    return result;
  }
  else { //No FieldType in cache...

    if(initialized) {
      console.error('WARNING missing FieldType instance for type "%s"', tdType);
      return null;
    }

    if(!bootstrapTypeMap[tdType]) {
      console.error('WARNING missing type "%s" in bootstrap map', tdType);
      return null;
    }

    return {
      type:bootstrapTypeMap[tdType]
    };
  }
};


/**
 * Get the actual FieldType object by ID or by type descriptor
 * @return {FieldType}
 **/
var getFieldTypeHandler =
exports.getFieldTypeHandler = function(typeDescriptorOrId) {
  if(typeof typeDescriptorOrId === 'string')
    return ftMap[typeDescriptorOrId];
  else if(Array.isArray(typeDescriptorOrId))
    return ftMap[typeDescriptorOrId[0].type];
  else
    return ftMap[typeDescriptorOrId.type];
}

/**
 * Used when pulling the raw data objects from Mongo.
 * Invokes the to_db or from_db for each field of modelObj to do type-specific augmenting or massaging.
 **/
var processToFromDb = function(modelObj, toFromFn) {
  var typeDescMap = modelObj._bo_meta_data.type_desc_map;


  //Build a field_type_handlers maping: field name -> FieldType object
  _.forEach(typeDescMap, function(td, fieldName) {
    var ft = getFieldTypeHandler(td);
    if(!ft) {
      return;
    }
    // console.log(' -> %s %s %s', toFromFn, fieldName, modelObj[fieldName]);
    var fn = ft[toFromFn];

    if('function' === typeof fn && modelObj[fieldName] !== undefined) {
      var td = typeDescMap[fieldName];
      if(Array.isArray(td)) {
        td = td[0];
        // console.log('invoking %s for array field %s type %s', toFromFn, fieldName, td.type);
        for(var i=0; i < modelObj[fieldName].length; i++) {
          try {
            modelObj[fieldName][i] = fn.apply(modelObj, [modelObj[fieldName][i], td, fieldName]);
          } catch (err) {
            console.error('ERROR INVOKING %s function on: %s.%s VALUE=%j ERR=%j', toFromFn, modelObj._bo_meta_data.class_name, fieldName, modelObj[fieldName][i], err);
            if(err && err.stack)
              console.error(err.stack);
          }
        }
      }
      else {
        // console.log('invoking %s for field %s type %s', toFromFn, fieldName, td.type);
        try {
          modelObj[fieldName] = fn.apply(modelObj, [modelObj[fieldName], td, fieldName]);
        } catch (err) {
          console.error('ERROR INVOKING %s function on: %s.%s VALUE=%j ERR=%j', toFromFn, modelObj._bo_meta_data.class_name, fieldName, modelObj[fieldName], err);
          if(err && err.stack)
            console.error(err.stack);
        }
      }

    }
  });

};

var processToDb =
exports.processToDb = function(modelObj) {
  if(modelObj.__ver && modelObj.__ver.$oid)
    modelObj.__ver = modelObj.__ver.$oid;
  return processToFromDb(modelObj, 'to_db');
};

var processFromDb =
exports.processFromDb = function(modelObj) {
  return processToFromDb(modelObj, 'from_db');
}


