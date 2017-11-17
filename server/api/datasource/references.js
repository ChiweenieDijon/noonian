/*
Copyright (C) 2016-2017  Eugene Lockett  gene@noonian.org

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
 * references.js
 *  Service to deal with/maintain reference fields
 **/
const Q = require('q');
const _ = require('lodash');

const db = require('./index');
const DataTriggerService = require('./datatrigger');
const GridFsService = require('./gridfs');

const mongoose = require('mongoose');

//Maintain a special collection noonian.references efficiently handle references bidirectionally
const IncomingRefSchema = new mongoose.Schema({
    target_id:{
      type: String,
      index: true
    },
    target_class: String,
    referencing_class: String,
    referencing_id: String,
    referencing_field: String,
    referenced_from_array: Boolean
  },
  {collection:'noonian.references'}
);

const IncomingRefModel = mongoose.model('IncomingRef', IncomingRefSchema);



/**
 * Set _disp and denormalized fields for a reference value
 *  @this bound to the reference field struct  {_id:'...', _disp:'...'}
 *  refObj is current version of referenced object
 **/
const augmentRef = function(modelObj, fieldName, td, refObj) {
  if(this && refObj) {
    
    this._disp = refObj._disp;

    if(td.denormalize_fields) {
      for(var i=0; i < td.denormalize_fields.length; i++) {
        var df = td.denormalize_fields[i];
        this[df] = refObj[df];
      }
    }
    //Since we're chaning values on an object w/out changing the object 
    // itself, need to make sure Mongoose knows to persist
    modelObj.markModified(fieldName);
  }
  
  return refObj;
}

const registerRef = function(fromClass, fromId, fromField, toClass, toId, isArray) {
  var irSpec = {
    target_class:toClass,
    target_id:toId,
    referencing_class:fromClass,
    referencing_id:fromId,
    referencing_field:fromField,
    referenced_from_array:!!isArray
  };

  return IncomingRefModel.count(irSpec).exec().then(function(matchCount) {
    if(matchCount === 0) {
      return new IncomingRefModel(irSpec).save();
    }
  });
};


/**
 * @return minimal reference stub built from provided reference field value
 */
const createRefStub = function(td, fieldValue) {
  
  var stub = {_id:fieldValue._id, _disp:fieldValue._disp}; 
  
  //handle "generic" reference wherein ref_class is specified in value instead of type descriptor
  if(!td.ref_class) {
    stub.ref_class = fieldValue.ref_class;
  }
  
  return stub;
}

/**
 * When saving a BusinessObject to the DB, process it's reference fields so they are up-to-date and properly formatted.
 *  Do it here rather than in FieldType.to_db becuase it requires further DB interaction
 **/
const processOutwardRefs = function(isUpdate, isDelete) {
  var modelObj = this;
  var myClassName = modelObj._bo_meta_data.class_name;
  var typeDesc = modelObj._bo_meta_data.type_desc_map;
  
  
  //First, clear out records of outgoing references from modelObj
  return IncomingRefModel.remove({referencing_class:myClassName,referencing_id:modelObj._id}).then(function() {
    var promises = [];
  
    if(!isDelete) { 
      //modelObj was just created or updated
      
      _.forEach(typeDesc, function(td, fieldName) {
        var fieldValue = modelObj[fieldName];
        
        if(td.type === 'reference' && fieldValue) {
          //console.log('handle reference %s', fieldName);
          //Handle a single reference
          modelObj[fieldName] = createRefStub(td, fieldValue);
          
          let refClass = td.ref_class || fieldValue.ref_class;
          let refId = fieldValue._id;
          
          //Augment value w/ _disp and denormalized fields from current version of record
          var promise = db[refClass].findById(refId).then(
            augmentRef.bind(modelObj[fieldName], modelObj, fieldName, td),
            function(err) { console.error(err); throw new Error(err); }
          );
          promises.push(promise);
          
          //Create record in noonian.references collection
          promises.push(registerRef(myClassName, modelObj._id, fieldName, refClass, refId));
          
        }
        else if(td instanceof Array && td[0].type === 'reference' && fieldValue && fieldValue.length) {
          //console.log('handle reference collection %s', fieldName);
          //Handle collection of references
          td = td[0];
          
          for(var i=0; i < fieldValue.length; i++) {
            
            if(fieldValue[i]) {
              //must use MongooseArray.set instead of assigning directly to fieldValue[i]
              fieldValue.set(i, createRefStub(td, fieldValue[i])); 
              
              let refClass = td.ref_class || fieldValue[i].ref_class;
              let refId = fieldValue[i]._id;
              
              var promise = db[refClass].findById(refId).then(
                augmentRef.bind(fieldValue[i], modelObj, fieldName, td),
                function(err) { console.error(err); throw new Error(err); }
              );
              promises.push(promise);
              
              promises.push(registerRef(myClassName, modelObj._id, fieldName, refClass, refId, true));
              
            }
          }
        }
        else if(td.type == 'attachment' && fieldValue) {
          var attId = fieldValue.attachment_id;
          GridFsService.annotateIncomingRef(attId, myClassName, modelObj._id, fieldName);
          //TODO clean up attachment annotations for _previous value
        }
        else if(td instanceof Array && td[0].type === 'attachment' && fieldValue && fieldValue.length) {
          for(var i=0; i < fieldValue.length; i++) {
            var attObj = fieldValue[i];
            if(attObj && attObj.attachment_id) {
              GridFsService.annotateIncomingRef(attObj.attachment_id, myClassName, modelObj._id, fieldName);
            }
          }
          //TODO clean up attachment annotations for _previous value
        }
        
      }); //end typedesc iteration
    }

    return Q.all(promises).then(function(){return true;});
  });
};


/**
 * When a BO is saved or deleted, trace back all references to it, and ensure the _disp and denormalized fields are updated
 */
const processInwardRefs = function(isDelete) {
  var modelObj = this;
  var myClassName = modelObj._bo_meta_data.class_name;

  //Look up all references to modelObj
  return IncomingRefModel.find({target_id: modelObj._id, target_class: myClassName}).then(function(irefs) {
    
    if(!irefs || irefs.length === 0) return;
    
    var promises = [];
    _.forEach(irefs, function(iref) {
      var refClass = iref.referencing_class;
      var refId = iref.referencing_id;
      var refField = iref.referencing_field;
      var isArray = iref.referenced_from_array;
      
      if(!db[refClass]) {
        return console.error('[REF-REPAIR] Bad incoming reference class %s in %s.%s', refClass, myClassName, modelObj._id);
      }
      
      //Grab the referencing object...
      var inrefPromise = db[refClass].findById(refId).then(function(bo) {
        if(!bo) return;
        var refTd = bo._bo_meta_data.type_desc_map[refField];
        
        if(!bo[refField]) {
          return console.error('[REF-REPAIR] Stale incoming reference from %s.%s', refClass, refId);
        }
        
        if(!isArray) {
          if(isDelete) {
            //Null out the reference in the referencing object
            bo[refField] = null;
          }
          else {
            //Update _disp and normalized fields in referencing object
            augmentRef.apply(bo[refField], [bo, refField, refTd, modelObj]);
          }
        }
        else {
          //Referencing from array; search for the position(s)
          var fieldVal = bo[refField];
          for(var i=0; i < fieldVal.length; i++) {
            if(fieldVal[i] && fieldVal[i]._id === modelObj._id) {
              if(isDelete) {
                fieldVal[i] = null;
                bo.markModified(refField);
              }
              else {
                augmentRef.apply(fieldVal[i], [bo, refField, refTd[0], modelObj]);
              }
            }
          }
        }
        
        //Save referencing object w/out affecting it's version or triggering data triggers
        return bo.save({useVersionId:bo.__ver, skipTriggers:true},null);
      });
      
      promises.push(inrefPromise);

    });//end iteration through irefs
    
    
    var finalPromise = Q.all(promises);
    
    if(isDelete) {
      //When all is said and done, clear out records of references to modelObj
      finalPromise = finalPromise.then(function() {
        return IncomingRefModel.remove({target_id: modelObj._id, target_class: myClassName})
      });
    }
    
    //Ensure returned promise is fulfilled when all incoming refs are processed
    return finalPromise;
  });
}

const handleOneToOne = function(modelObj, fieldName) {
  //if my reference changed:
  //  query for target:
  //  if target back ref isn't pointing to me, then update and save 
  //  if _previous value is not null (reference changed from something else)
  //    query for _previous target:
  //    if _previous target back ref isn't null, update it to null and save.
  var myRef = modelObj[fieldName] || {};
  var myPrevRef = (modelObj._previous && modelObj._previous[fieldName]) || {};
  
  if(myRef._id == myPrevRef._id) {
    //No change; we're done
    return Q(true);
  }
    
  var myClassName = modelObj._bo_meta_data.class_name;
  var myTypeDescMap = modelObj._bo_meta_data.type_desc_map;
  var myTd = myTypeDescMap[fieldName];
  
  var targetClassName = myTd.ref_class;
  var targetTypeDescMap = db[targetClassName]._bo_meta_data.type_desc_map;
  var targetTd = targetTypeDescMap[myTd.back_ref]; 
  
  var promises = [];
  
  if(myRef._id) {
    promises.push(db[targetClassName].findOne({_id:myRef._id}));
  }
  else {
    promises.push(Q(null));
  }
  if(myPrevRef._id) {
    promises.push(db[targetClassName].findOne({_id:myPrevRef._id}));
  }
  else {
    promises.push(Q(null));
  }
  
  return Q.all(promises).then(function(resultArr) {
    var toResolve = [];
    var currTarget = resultArr[0];
    var prevTarget = resultArr[1];
    var backRefField = myTd.back_ref;
    if(currTarget) {
      //make sure currTarget[backRefField] points back to modelObj
      let backRef = currTarget[backRefField];
      if(!backRef || backRef._id !== modelObj._id) {
        //console.log('Updating backref for %s.%s -> %s.%s', myClassName, fieldName, targetClassName, backRefField);
        currTarget[backRefField] = {_id:modelObj._id};
        toResolve.push(currTarget.save());
      }
    }
    
    if(prevTarget) {
      //clear out prevTarget[backRefField] if it still points to me
      let backRef = prevTarget[backRefField];
      if(backRef && backRef._id === modelObj._id) {
        //console.log('Nulling prev backref for %s.%s -> %s.%s', myClassName, fieldName, targetClassName, backRefField);
        prevTarget[backRefField] = null;
        toResolve.push(prevTarget.save());
      }
    }
    
    return Q.all(toResolve);
  });
};

const handleManyToMany = function(modelObj, fieldName, isCreate, isUpdate, isDelete) {
  //Find delta between my _previous and current list of references
  //  query for all targets in delta
  //  for each REMOVED
  //    check that backref field in target doesn't include me; if it does, remove and save
  //  for each ADDED
  //    check that backref field in target includes me; if it doesn't add and save
  
  var prevRefs = _.pluck((modelObj._previous && modelObj._previous[fieldName]), '_id');
  var currRefs = _.pluck(modelObj[fieldName], '_id');
  var removed = _.difference(prevRefs, currRefs);
  var added = _.difference(currRefs, prevRefs);
  
  if(!removed.length && !added.length) {
    //no change; we're done
    return Q(true);
  }
  
  
  
  var myClassName = modelObj._bo_meta_data.class_name;
  var myTypeDescMap = modelObj._bo_meta_data.type_desc_map;
  var myTd = myTypeDescMap[fieldName][0];
  var backrefField;
  
  //console.log('%s', myClassName);
  //console.log(' %j', added);
  //console.log(' %j', removed);
  //console.log('----------------------');
  
  var targetClassName = myTd.ref_class;
  var targetTypeDescMap = db[targetClassName]._bo_meta_data.type_desc_map;
  var targetTd = targetTypeDescMap[myTd.back_ref][0]; 

  var promises = [];
  
  if(removed.length) {
    promises.push(db[targetClassName].find({_id:{$in:removed}}));
  }
  else {
    promises.push(Q([]));
  }
  if(added.length) {
    promises.push(db[targetClassName].find({_id:{$in:added}}));
  }
  else {
    promises.push(Q([]));
  }
  
  return Q.all(promises).then(function(resultArr) {
    var toResolve = [];
    var removedObjects = resultArr[0];
    var addedObjects = resultArr[1];
    var backRefField = myTd.back_ref;
    
    _.forEach(removedObjects, function(target) {
      //check that backref field in target doesn't include me; if it does, remove and save
      var backrefIds = _.pluck(target[backRefField], '_id');
      var myPos = backrefIds.indexOf(modelObj._id);
      var modified = false;
      while(myPos > -1) {
        modified = true;
        target[backRefField].splice(myPos, 1);
        backrefIds.splice(myPos, 1);
        myPos = backrefIds.indexOf(modelObj._id);
      }
      if(modified) {
        //console.log('Updating REMOVED backref for %s.%s -> %s.%s', myClassName, fieldName, targetClassName, backRefField);
        target.markModified(backRefField);
        toResolve.push(target.save());
      }
    });
    
    _.forEach(addedObjects, function(target) {
      //check that backref field in target includes me; if it doesn't add and save
      var backrefIds = _.pluck(target[backRefField], '_id');
      var myPos = backrefIds.indexOf(modelObj._id);
      if(myPos < 0) {
        target[backRefField] = target[backRefField] ? _.clone(target[backRefField]) : [];
        target[backRefField].push({_id:modelObj._id});
        //console.log('Updating ADDED backref for %s.%s -> %s.%s', myClassName, fieldName, targetClassName, backRefField);
        toResolve.push(target.save());
      }
    });
    
    return Q.all(toResolve);
  });
  
};



const processBackRefs = function(isCreate, isUpdate, isDelete) {
  var modelObj = this;
  var myClassName = modelObj._bo_meta_data.class_name;
  var typeDesc = modelObj._bo_meta_data.type_desc_map;
  
  var promises = [];
  
  _.forEach(typeDesc, function(td, fieldName) {
    var isArray = td instanceof Array;
    td = isArray ? td[0] : td;
    
    if(td.type === 'reference' && td.back_ref) {
      //Are we talking about one-to-one or many-to-many? 
      var targetTd = db[td.ref_class]._bo_meta_data.type_desc_map[td.back_ref];
      var targetIsArray = targetTd instanceof Array;
      if(targetIsArray && isArray) {
        promises.push(handleManyToMany(modelObj, fieldName, isCreate, isUpdate, isDelete));
      }
      else if(!targetIsArray && !isArray) {
        promises.push(handleOneToOne(modelObj, fieldName, isCreate, isUpdate, isDelete));
      }
      else {
        console.error('one-to-many backref not yet supported! %s.%s - %s.%s', myClassName, fieldName, td.ref_class, td.back_ref);
      }
    }
    
  });
  
  return Q.all(promises);
};


exports.init = function(conf) {
  console.log('initializing reference service');

  //Register data trigger for outgoing refs - prepare so proper denormalized fields; 100 priorty to occurr after other 'before' datatriggers
  DataTriggerService.registerDataTrigger('sys.internal.processOutRefs', null, 'before', true, true, true, processOutwardRefs, 100);

  //Register data trigger for incoming refs; -100 priorty so it happens before other 'after' datatriggers
  DataTriggerService.registerDataTrigger('sys.internal.processInRefs', null, 'after', false, true, true, processInwardRefs, -100);
  
  if(conf.enableBackRefs) {
    DataTriggerService.registerDataTrigger('sys.internal.processBackRefs', null, 'after', true, true, true, processBackRefs, -90);
  }

  if(conf.bootstrap) {
    return exports.repair();
  }
  else {
    return Q(true);
  }
};




/**
 * Traverse all BusinessObjects in the system and catalog all references
 * Rebuild IncomingRefModel table and
 * update all reference fields so that _disp and denormalized fields are up-to-date
 */
exports.repair = function() {
  console.log('PERFORMING REF REPAIR...');

  return IncomingRefModel.remove({}).then(function() {
    console.log('...IncomingRefs deleted');
    return db.BusinessObjectDef.find({}).exec();
  })
  .then(function(bodList) {

    var bodPromiseList = [];
    
    _.forEach(bodList, function(bod) {
      var deferred = Q.defer();
      bodPromiseList.push(deferred.promise);

      
      var badRefs = [];

      var className = bod.class_name;
      var typeDescMap = bod.definition;

      console.log('Building IncomingRefs for %s', className);
      
      //Pull out the reference fields for this BO class
      var myRefFields = []; //an array of td's for this BOD's reference fields, augmented w/ field_name and is_array
      for(var f in typeDescMap) {
        var td = typeDescMap[f];
        if(!td) continue;

        if(td.type === 'reference' ||
          (Array.isArray(td) && td[0].type === 'reference')) {
          if(Array.isArray(td)) {
            td = td[0];
            td.is_array = true;
          }
          td.field_name = f;
          myRefFields.push(td);
        }
      }

      //if this class has reference fields...
      if(myRefFields.length > 0) {
          
        var currentPromise = Q(true); //will be processing objects one at a time; this holds promise resolved when most recent object completes
          
        var projection = {__ver:1};
        for(var i=0; i < myRefFields.length; i++) {
          projection[myRefFields[i].field_name] = 1;
        }

        //Stream in all the objects of this type, grabbing the ref fields:
        var objStream = db[bod.class_name].find({}, projection).stream();
        objStream.on('data', function(bo) {
          objStream.pause();  //force one-at-a-time processing; resumes when this object is completed
          
          var refHandlePromises = [];
          
          var handleRef = function(refTd, fieldVal, arrIndex) {
            var refId = fieldVal._id;
            var refClass = refTd.ref_class || fieldVal.ref_class; //ref_class can be defined in the field for non-specific references
            if(!db[refClass]) {
                console.log('found reference to nonexistant class %s -> %s', className, refClass);
                var badRef = {
                  bo:bo, field:refTd.field_name, refId:refId, arrIndex:arrIndex
                };
                //Clean these up later!
                badRefs.push(badRef);
                return Q(true);
            }
            // console.log('handleRef %j', fieldVal);
            //Check if the reference is valid, if so update disp and denormalized fields
            return db[refClass].count({_id:refId}).exec().then(function(matchCount) {
              //If reference is valid, make the entry:
              if(matchCount === 1) {
                //Valid reference!
                var ir = new IncomingRefModel({
                  target_id:refId,
                  target_class: refClass,
                  referencing_class: className,
                  referencing_id: bo._id,
                  referencing_field: refTd.field_name,
                  referenced_from_array: !!refTd.is_array
                });
                // console.log("%s.%s.%s -> %s.%s", className, ir.referencing_id, ir.referencing_field, refClass, refId);
                return ir.save().then(function() {
                  return db[refClass].findById(refId).then(
                    augmentRef.bind(bo[refTd.field_name], bo, refTd.field_name, refTd)
                  )
                  .then(function() {
                    return bo.save({useVersionId:bo.__ver, skipTriggers:true}, null);
                  });
                });
              }
              else {
                console.log('found bad reference %s -> %s', className, refClass);
                var badRef = {
                  bo:bo, field:refTd.field_name, refId:refId, arrIndex:arrIndex
                };
                console.log(badRef);
                //Clean these up later!
                badRefs.push(badRef);
              }
            });
          };

          _.forEach(myRefFields, function(refTd) {
            var fieldVal = bo[refTd.field_name];
            if(!fieldVal) return;

            if(!refTd.is_array) {
              refHandlePromises.push(handleRef(refTd, fieldVal));
            }
            else {
              for(var i=0; i < fieldVal.length; i++) {
                if(fieldVal[i])
                  refHandlePromises.push(handleRef(refTd, fieldVal[i], i));
              }
            }

          });//end ref field iteration
          
          currentPromise = Q.allSettled(refHandlePromises).then(function() {
              objStream.resume();
          });


        }).on('error', function (err) {
          console.error('error during processing ref repair on BOD %s - %s', className, err);
          deferred.reject(err);
        }).on('close', function () {
          // the stream is closed
          currentPromise.then(function() {
            console.log('Finished processing %s', className);
            deferred.resolve(badRefs);
          })
        });

      }
      else {
        //No references...
        deferred.resolve(true);
      }

    }); //end _.forEach()

    return Q.allSettled(bodPromiseList);
  })
  .then(function(bodPromiseResults) {
    var promiseList = [];
    _.forEach(bodPromiseResults, function(promiseResult) {
      if(promiseResult.state === 'fulfilled' && Array.isArray(promiseResult.value) && promiseResult.value.length > 0) {

        _.forEach(promiseResult.value, function(badRef) {
          var bo = badRef.bo;
          var field = badRef.field;
          var arrIndex = badRef.arrIndex;
          if(arrIndex !== undefined) {
            bo[field][arrIndex] = null;
          }
          else {
            bo[field] = null;
          }
          promiseList.push(bo.save({useVersionId:bo.__ver, skipTriggers:true}, null));
        });
      }
    });
    return Q.all(promiseList);
  })
  ;
};



