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
	datasource
	The server-side api for retrieving data models from mongo.
*/
var fs = require('fs');
var path = require('path');
var Q = require('q');
var _ = require('lodash');

var appConfig = require('../../conf');

var util = require('util');

var mongoose = require('mongoose');
require('mongoose-function')(mongoose);
// var mongooseTextSearch = require('mongoose-text-search');

var uuid = require('node-uuid');

var Schema = mongoose.Schema,
	ObjectId = Schema.Types.ObjectId,
	Mixed = Schema.Types.Mixed;

var interceptor = require('./mongoose_intercept');

exports._svc = {};
var FieldTypeService = exports._svc.FieldTypeService = require('./fieldtypes');
var DataTriggerService = exports._svc.DataTriggerService = require('./datatrigger');
var QueryOpService = exports._svc.QueryOpService = require('./query');
var GridFsService = exports._svc.GridFsService = require('./gridfs');
var RefService = exports._svc.RefService = require('./references');
var PackagingService = exports._svc.PackagingService = require('./packaging');

var invokerTool = require('../../tools/invoker');



//Special minimal "bootstrap" schema/model
var BusinessObjectDefBootstrapModel = mongoose.model('BusinessObjectDef_bootstrap',
   new Schema(
     {
      _id:{ type:String, index:{unique: true} },
      class_name:  String,
      superclass: Mixed,
      abstract: Boolean,
      definition: Mixed
    },
    {collection:'BusinessObjectDef', strict:false} //strict:false -> any fields absent from this schema will be included on db write
  )
);



var modelCache = {}; //Cache for compiled mongoose models
var modelById = {};//auxilary mapping for model cache: maps BusinessObjectDef id to cached model

var customSchemaConstructors = {};//maps BusinessObjectDef id to the mongoose schema



/**
 * If uuidStr is not null, converts a UUID in standard hex form XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX
 * into a URL-safe base64-encoded UUID, used by this system for BusinissObject _id's.
 *
 * If uuidStr is null, generates a random UUID and returns in URL-safe base64.
 **/
var generateId;
var convertUuid =
generateId =
exports.generateId =
exports.convertUuid = function(uuidStr) {
  var buffer = new Buffer(16);

  if(uuidStr)
    uuid.parse(uuidStr, buffer);
  else
    uuid.v4(null, buffer);

  return buffer.toString('base64').substr(0, 22).replace(/\//g,'_').replace(/\+/g,'-');
}


/**
 * For Mongoose custom creation of _id on save().
 * passed to the schema.pre('save')
**/
var idGenerator = function(next) {
  if(!this.isNew || this._id) return next();

  this._id = generateId();

  return next();
}

/**
 *  tacked on as a virtual field _disp to all instances
**/
var dispGenerator = function() {
    var typeDescriptor = this._bo_meta_data.type_desc_map;
    var dispTemplate = typeDescriptor._disp;
    try {
      if(dispTemplate) {
        return _.template(dispTemplate)(this);
      }
      else if(typeDescriptor.name && this.name) {
        return this.name;
      }
      else if(typeDescriptor.key && this.key) {
        return this.key;
      }
    }
    catch(err) {} //Might happen if error in dispTemplate...

    return this._bo_meta_data.class_name+'['+this._id+']';

}


/**
 * Method on _bo_meta_data that retrieves the typeDescriptor object for the specified path.
 * path can be  a simple fieldname or dotted into reference fields, e.g.:
 *   db.SomeBusinessObj._bo_meta_data.getTypeDescriptor('refField.blah');
 **/
var getTypeDescriptor = function(path) {
  var dotPos = path.indexOf('.');
  if(dotPos === -1) {
    //just a field name
    return this.type_desc_map[path];
  }

  var localField = path.substring(0, dotPos);
  var subPath = path.substring(dotPos+1);

  var localTd = this.type_desc_map[localField];
  if(localTd && localTd.type === 'reference' && modelCache[localTd.ref_class]) {
    var refModel = modelCache[localTd.ref_class];
    return refModel._bo_meta_data.getTypeDescriptor(subPath);
  }
  else if(localTd && localTd.type === 'composite') {
    //TODO this only works to go one level deep, disallowing composites or refs w/in composites!
    // probably need composite's nested type_desc_map to be augmented w/ getTypeDescriptor function....
    return localTd.type_desc_map && localTd.type_desc_map[subPath];
  }
  else { 
    //dotted into a non-reference or a non-existent field:
    // console.error('attempted to get TD for class %s path %s', this.class_name, path);
    return null;
  }
}

/**
 * Creates the _bo_meta_data object attached to every BusinessObject model
 **/
var createMetaObj = function(forBod) {
  var typeDescMap = _.clone(forBod.definition);
  var metaObj = {
    class_name: forBod.class_name,
    type_descriptor: typeDescMap,  //need to clean up old code that uses this badly-named
    type_desc_map: typeDescMap,
    getTypeDescriptor: getTypeDescriptor,
    bod_id:forBod._id
  };

  if(forBod.superclass) {
    var SuperModel = modelById[forBod.superclass._id];
    _.merge(metaObj.type_desc_map, SuperModel._bo_meta_data.type_desc_map);
  }


  return metaObj;
}

/**
 * Converts the schema JSON we use in our BusinessObjectDef.definition into a mongo schema,
 *  with the help of FieldTypeService to convert custom field types to Mongoose types.
 **/
var createMongoSchema = function(forBod) {

	var mongoSchemaDef = {};
  // var indexObj = {};


  //Iterate through fields in BOD's definition,
  //  mapping each to mongoose type specifiers via fieldTypes
	for(var fieldName in forBod.definition) {
    if(fieldName.indexOf('_') === 0)
      continue;

		var td = forBod.definition[fieldName];
		var isArray = false;
		if(Array.isArray(td) ) {
			isArray = true;
			td = td[0];
		}

    var mongoType = FieldTypeService.getSchemaElem(td);

    if(!mongoType) {
			console.error('Error in json schema, bad type in field "%s" in BOD %j', fieldName, forBod);
			continue;
		}

		if(isArray)
			mongoType.type = [mongoType.type];

    mongoSchemaDef[fieldName] = mongoType;

		// if(mongoType.textIndex) {
  //     console.log("SETTING TEXT INDEX ON %s . %s", forBod.class_name, fieldName);
  //     indexObj[fieldName] = 'text';
		// }
	}


  //Since we're defining our own id generator that creates a id of type string:
  mongoSchemaDef._id = {
    type: String,
    index: {
        unique: true
    }
  };

  //for versioning:
  mongoSchemaDef.__ver = Mixed; //ObjectId;

  //__pkg attribute to differentiate arbitrary objects based on package
  mongoSchemaDef.__pkg = String;
  
  //__disp attribute persists dynamically-generated _disp field.
  mongoSchemaDef.__disp = String;

  var mongoSchema;
  var schemaOptions = {collection:forBod.class_name};

  if(forBod.abstract) {
    //This BOD represents a superclass to someone;
    // create a special constructor for it...
    var AbstractSchema = function() {
        Schema.apply(this, arguments);
        this.add(mongoSchemaDef); //TODO, don't add overridden fields...
    };
    util.inherits(AbstractSchema, Schema);
    customSchemaConstructors[forBod._id] = AbstractSchema;

    mongoSchema = new AbstractSchema({}, schemaOptions);
  }
  else if(forBod.superclass) {
    var superId = forBod.superclass._id;
    if(!superId || !customSchemaConstructors[superId]) {
      console.error("Error in BusinessObjectDef, bad superclass ref in %s - %j",forBod.class_name, forBod.superclass);
      return null;
    }
    //This BOD represents a subclass of another;
    // use superclass's special schema constructor
    var SuperSchema = customSchemaConstructors[superId];
    mongoSchema = new SuperSchema(mongoSchemaDef);
  }
  else {
    schemaOptions.versionKey = false;
    mongoSchema = new Schema(mongoSchemaDef, schemaOptions);
  }

  //Build metadata object and attach it to schema
  mongoSchema._bo_meta_data = createMetaObj(forBod);
  //TODO: Attach mongo schematypes to the schema object's meta?
  // console.log("%s metadata: %j", forBod.class_name, mongoSchema._bo_meta_data);


  //add a virtual _disp field
  mongoSchema.virtual('_disp').get(dispGenerator);


  //Add text indexing
  // if(Object.keys(indexObj).length > 0) {
  //   mongoSchema.plugin(mongooseTextSearch);
  //   mongoSchema.index(indexObj);
  // }

  //Wire in UUID generation
  mongoSchema.pre('save', idGenerator);



  return mongoSchema;
};


/**
 *  Pulls in provided BusinessObject definition and creates a corresponding Mongoose model
 **/
var createAndCacheModel = function(forBod) {
	var className = forBod.class_name;
  console.log("Initializing mongoose model for %s", className);

  if(modelCache[className]) {
    console.error('Attempting to cache a DB model multiple times: %s', className);
    return;
  }

	var mongoSchema = createMongoSchema(forBod);
  if(!mongoSchema) {
    console.error("Skipping model creation for %s", className);
    return;
  }

  var mongoModel;
  if(forBod.superclass) {
    //It's a subclass of someone else;
    //  create model using "discriminator" factory of super-class's model
    var SuperModel = modelById[forBod.superclass._id];
    mongoModel = SuperModel.discriminator(className, mongoSchema);
  }
  else {
    mongoModel = mongoose.model(className, mongoSchema);
  }

  //Intercept all the methods of interest...
  interceptor.decorateModel(mongoModel, forBod);

  //Put it in the cache
	modelCache[className] = mongoModel;
	modelById[forBod._id] = modelCache[className];

  exports[className] = modelCache[className];
  exports[forBod._id] = modelCache[className];
  // console.log("Finished initializing mongoose model for %s", className);
};



var augmentModelsWithMemberFunctions = function(singleClass) {
  if(!modelCache.MemberFunction) {
    //console.log('NEED TO UPGRADE SYS PKG!!!!!  Missing MemberFunction');
    return;
  }
  
  var queryObj = {};
  if(singleClass && modelCache[singleClass]) {
      queryObj.business_object = modelCache[singleClass]._bo_meta_data.bod_id;
  }

    
  return modelCache.MemberFunction.find(queryObj).then(function(memberFnList) {
    _.forEach(memberFnList, function(memberFnObj) {
      
      if(memberFnObj.business_object &&
         memberFnObj.name &&
         memberFnObj.function &&
         (memberFnObj.applies_to == 'server' || memberFnObj.applies_to == 'both')) {
        
        console.log('Installing Member Function %s.%s', memberFnObj.business_object._disp, memberFnObj.name);
        
        var ModelObj = modelById[memberFnObj.business_object._id];
        //console.log('ModelObj: %j', (ModelObj && ModelObj._bo_meta_data && ModelObj._bo_meta_data.class_name));
        if(!ModelObj) {
            return console.error('Invalid BOD ref in MemberFunction object')
        }
        
        var targetObj;
        if(memberFnObj.is_static) {
          targetObj = ModelObj;
        }
        else {
          targetObj = ModelObj.prototype;
        }

        var theFunction;
        if(memberFnObj.use_injection) {
          theFunction = invokerTool.invokeInjected(memberFnObj.function, {}, memberFnObj);
          if(!theFunction) {
            return console.log('Invalid return value for MemberFunction %s.%s', memberFnObj.business_object, memberFnObj.name);
          }
        }
        else {
          theFunction = memberFnObj.function;
        }

        Object.defineProperty(targetObj, memberFnObj.name, {
          enumerable:false,
          writable:true,
          value:theFunction
        });

      }

    });
  });
};

/**
 * Initializes cache of Mongoose Models from BusinessObjectDef's in the system...
 **/
var buildModelCache = function() {

  return BusinessObjectDefBootstrapModel.find({}).exec().then(function(objList) {

    //First, arrange our BusinessObjectDefs so superclasses come first
    objList.sort(function(x,y) {
      if(!y.abstract === !x.abstract) return 0;
      else if(y.abstract && !x.abstract) return 1;
      else return -1;
    });

    //Next, create the models one-by-one
    for(var i=0; i < objList.length; i++) {
      createAndCacheModel(objList[i]);
    }
  });
};




/**
 * - called w/ the BOD instance as "this"
 * - calls BOD save(), thereafter updating our Model cache to add/update the new BOD
 * @param versionId - __ver to use when updating BusinessObjectDef record (used when a package is being installed to keep consistent w/ package manifest)
 **/
var deferredBodSave = function(versionId) {
  versionId = versionId || this.__ver;
  return this.save({useVersionId:versionId, skipTriggers:true}, null).then(
    function(obj){
      console.log("Successfully saved BusinessObjectDef: %s", obj.class_name);
      createAndCacheModel(obj);
    },
    function(err) {
      console.error("ERROR saving BusinessObjectDef "+err);
    }
  );
}

/**
 *  Wipe from existence the model w/ specified className
 **/
var clearModel = function(className) {
  delete modelCache[className];
  //little dangerous - digging into mongoose internals:
  delete mongoose.models[className];
  delete mongoose.modelSchemas[className];
};


var pendingBodsToInstall = {};
/**
 * Creates or updates BOD in the database, and adds it to the Model cache
 * @param bodObj - a plain-object representation of a BusinessObjectDef
 **/
var installBusinessObjectDef =
exports.installBusinessObjectDef = function(bodObj) {
  var className = bodObj.class_name;
  console.log('Installing BOD model for %s', className);

  if(bodObj.superclass && !customSchemaConstructors[bodObj.superclass._id]) {
    //Super class hasn't been loaded yet... add it to pending list to defer it's loading
    console.log('...deferring BOD install for %s', className);
    var superId = bodObj.superclass._id;
    pendingBodsToInstall[superId] = pendingBodsToInstall[superId] || [];
    pendingBodsToInstall[superId].push(bodObj);
    return Q(true);
  }

  var BusinessObjectDef = modelCache.BusinessObjectDef; //In case we're bootstrapping BusinessObjectDef!

  if(modelCache[className]) {
    clearModel(className);
  }

  return BusinessObjectDef.findOne({_id:bodObj._id}).then(function(currBod) {
    if(currBod) {
      var keepVersion;
      if(bodObj.__ver) {
        //We want to retain the __ver that was passed in so as to keep consistent w/ package manifest.
        keepVersion = bodObj.__ver;
        delete bodObj.__ver;
      }
      _.assign(currBod, bodObj); //write onto currBod any fields from passed-in bodObj
      return deferredBodSave.apply(currBod, [keepVersion]);
    }
    else {
      //Not in the DB; do an insert
      return deferredBodSave.apply(new BusinessObjectDef(bodObj));
    }

  })
  .then(function() {
      //restore any memberfunctions we may have trampled
      return augmentModelsWithMemberFunctions(className);
  })
  .then(function() {
      //Any BODs waiting for this one
      if(pendingBodsToInstall[bodObj._id]) {
        var promiseChain = Q(true);
        _.forEach(pendingBodsToInstall[bodObj._id], function(pendingBod) {
          promiseChain = promiseChain.then(installBusinessObjectDef.bind(null, pendingBod));
        });
        promiseChain = promiseChain.then(function() {
          delete pendingBodsToInstall[bodObj._id];
        });
        return promiseChain;
      }
  })
  ;

};


/**
 * When a BusinessObjectDef changes, sync our model cache to reflect the changes
 * @this - the BusinessObjectDef object
 * @param isCreate, isDelete - injected from DataTrigger logic
 **/
var bodUpdate = function(isCreate, isDelete) {
  var className = this.class_name || this._previous.class_name;
  console.log('Refreshing model cache on %s', className);

  if(!isCreate) {
    clearModel(className);
  }

  if(!isDelete)
    createAndCacheModel(this);
}

/**
 * Bootstrap a clean database
 **/
var bootstrapDatabase = function() {

  //Use PackagingService to pull in the latest "sys" package from local data_pkg directory
  return PackagingService.applyLocalPackage('sys')
    .then(FieldTypeService.init)
    .then(function(){
      //Refresh models now that FieldTypeService has been properly initialized
      // (all Models were created sans FieldType objects)
      console.log('Refreshing BOD models');
      _.forEach(modelCache, function(model, className) {
        clearModel(className);
      });
    })
    .then(buildModelCache,
      function(err) {
        if(err && err.stack) console.error(err.stack);
        else console.error(err);
        process.exit();
      }
    );
};

/**
 * Initialize mongo connection and data layer.
 *  If no BusinessObjects are found in the database, a bootstrap is performed.
 * @return promise that is fulfilled upon completion.
 **/
exports.init = function(conf) {

  // Connect to database
  mongoose.connect(conf.mongo.uri, conf.mongo.options);


  //perform data layer bootstrap by first looking for the FieldType BOD via our minimal BusinessObjectDef bootstrap model
  return BusinessObjectDefBootstrapModel.findOne({class_name:'FieldType'})
  .then(function(fieldTypeBod) {

    //Load FieldType BOD description -> schema/model cache
    if(fieldTypeBod) {
      console.log('Initializing data layer from existing DB: %s', conf.mongo.uri);

      //Make it so db.FieldType is available
      createAndCacheModel(fieldTypeBod);

      //Now FieldTypeService.init() can pull in all the FieldType objects,
      //  so buildModelCache can properly build schemas/models for all of the BOD definitions.
      return FieldTypeService.init().then(clearModel.bind(null, 'FieldType')).then(buildModelCache);

    }
    else {
      // no FieldType BOD in the system!  Therefore it's a fresh DB...
      console.error('BOOTSTRAPPING DATABASE: %s', conf.mongo.uri);
      conf.bootstrap = true;

      //Set up to use Bootstrap BusinessObjectDef; will get updated w/ proper model when sys is loaded
      modelCache.BusinessObjectDef = exports.BusinessObjectDef = BusinessObjectDefBootstrapModel;

      return bootstrapDatabase()
      .then(function() { //Set up admin's password
        return modelCache.User.findOne({_id:'vl22Nf2XTNym2-X90sxOag'}).exec();
      })
      .then(function(adminUser) {
        var newPw = generateId();
        adminUser.password = newPw;
        return adminUser.save().then(function() {
          console.log('***** BOOTSTRAP ADMIN PASSWORD SET! ******');
          console.log('Login is "admin", password is:');
          console.log(newPw);
          console.log('******************************************');
        });

      });
    }

  })
  .then(function() { //system is bootstrapped... finish initializing the rest of the data layer
    return DataTriggerService.init()
      .then(QueryOpService.init)
      .then(GridFsService.init.bind(null, conf))
      .then(RefService.init.bind(null, conf))
      .then(PackagingService.init)
      .then(invokerTool.init)
      .then(augmentModelsWithMemberFunctions)
      .then(function() {
        //Register a data trigger so that future BOD updates
        DataTriggerService.registerDataTrigger('sys.internal.dbUpdate', 'R1r6pCVESdma9hj8GrfMaQ', 'after', true, true, true, bodUpdate);

        //Data trigger for "created_date", "modified_date",
        DataTriggerService.registerDataTrigger('sys.internal.datestamps', null, 'before', true, true, false,
          function(isCreate) {
            if(isCreate && this._bo_meta_data.type_desc_map.created_date) {
              this.created_date = new Date();
            }
            if(this._bo_meta_data.type_desc_map.modified_date) {
              this.modified_date = new Date();
            }
          }
        );
        
        //Data trigger for "created_date", "modified_date",
        DataTriggerService.registerDataTrigger('sys.internal.disp', null, 'before', true, true, false,
          function() {
              if(this._bo_meta_data.type_desc_map._disp) {
                this.__disp = this._disp;
                //console.log('SETTING __disp = %s', this.__disp);
              }
          }
        );
      });
  });

}


