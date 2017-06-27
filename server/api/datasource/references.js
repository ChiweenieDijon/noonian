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
 * references.js
 *  Service to deal with/maintain reference fields
 **/
var Q = require('q');
var _ = require('lodash');

var db = require('./index');
var DataTriggerService = require('./datatrigger');
var GridFsService = require('./gridfs');

var mongoose = require('mongoose');

//Maintain a special collection to track incoming references;
// If
var IncomingRefSchema = new mongoose.Schema({
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

var IncomingRefModel = mongoose.model('IncomingRef', IncomingRefSchema);



/**
 * Set display field for a reference data type.
 *  "this" bound to the reference field struct  {_id:'...', _disp:'...'}
 *  refObj is the actual object referred to.
 **/
var setDisp = function(modelObj, fieldName, td, refObj) {
  if(refObj) {
    // console.log("updating reference for %s %j", fieldName, this);
    this._disp = refObj._disp;

    if(td.denormalize_fields) {
      for(var i=0; i < td.denormalize_fields.length; i++) {
        var df = td.denormalize_fields[i];
        this[df] = refObj[df];
      }
    }

    modelObj.markModified(fieldName);
  }
  return refObj;

}

var registerRef = function(fromClass, fromId, fromField, toClass, toId, isArray) {
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

var deregisterRef = function(fromClass, fromId, fromField, toClass, toId) {
  // console.log('removing ref %s %s', fromField, toClass);
  return IncomingRefModel.remove({
    target_class:toClass,
    target_id:toId,
    referencing_class:fromClass,
    referencing_id:fromId,
    referencing_field:fromField
  }).exec();
};

/**
 * When saving a BusinessObject to the DB, process it's reference fields so they are up-to-date and properly formatted.
 *  Do it here rather than in FieldType.to_db becuase it requires further DB interaction
 **/
var processOutwardRefs = function(isUpdate, isDelete) {
  var modelObj = this;
  var myClassName = modelObj._bo_meta_data.class_name;
  var typeDesc = modelObj._bo_meta_data.type_descriptor;
  var promises = [];

  if(isDelete) {
    //deregister any references i may have
    for(var fieldName in typeDesc) {
      if(typeDesc[fieldName].type === 'reference' && modelObj[fieldName]) {
        var refClass = typeDesc[fieldName].ref_class || modelObj[fieldName].ref_class;
        var refId = modelObj[fieldName]._id;
        promises.push(deregisterRef(myClassName, modelObj._id, fieldName, refClass, refId));
      }
      else if(typeDesc[fieldName] instanceof Array && typeDesc[fieldName][0].type === 'reference' && modelObj[fieldName] && modelObj[fieldName].length > 0) {
        var refClass = typeDesc[fieldName][0].ref_class;
        for(var i=0; i < modelObj[fieldName].length; i++) {
          if(modelObj[fieldName][i]) {
            var refId = modelObj[fieldName][i]._id;
            promises.push(deregisterRef(myClassName, modelObj._id, fieldName, refClass, refId));
          }
        }
      }
    }
  }
  else {
    for(var fieldName in typeDesc) {

      if(typeDesc[fieldName].type == 'reference' && modelObj[fieldName]) {
        var refClass = typeDesc[fieldName].ref_class || modelObj[fieldName].ref_class;
        var refId = modelObj[fieldName]._id;
        var refDisp = modelObj[fieldName]._disp; //If we're loading from bootstrap, we may have the ref before the actual record... retain the _disp
        modelObj[fieldName] = {_id:refId, _disp:refDisp}; //In case its a full object instead of a stub
        if(!typeDesc[fieldName].ref_class)
          modelObj[fieldName].ref_class = refClass;

        var promise = db[refClass].findById(refId).then(
          setDisp.bind(modelObj[fieldName], modelObj, fieldName, typeDesc[fieldName]),
          function(err) { var s="invalid reference "+err; console.error(s); throw s; }
        );
        promises.push(promise);
        promises.push(registerRef(myClassName, modelObj._id, fieldName, refClass, refId));
        if(isUpdate && modelObj._previous[fieldName] && modelObj._previous[fieldName]._id !== refId) {
          //The reference changed... update incoming
          promises.push(deregisterRef(myClassName, modelObj._id, fieldName, refClass, modelObj._previous[fieldName]._id));
        }
      }
      else if(typeDesc[fieldName] instanceof Array && typeDesc[fieldName][0].type === 'reference' && modelObj[fieldName] && modelObj[fieldName].length > 0) {
        var refClass = typeDesc[fieldName][0].ref_class;
        var refIds = {};
        for(var i=0; i < modelObj[fieldName].length; i++) {
          if(modelObj[fieldName][i]) {
            var refStub =  modelObj[fieldName][i];
            if(refStub) {
              var refId =refStub._id;
              var refDisp = refStub._disp;

              if(refStub.ref_class) {
                refClass = refStub.ref_class;
              }

              refIds[refId] = true;
              modelObj[fieldName][i] = refStub = {_id:refId, _disp:refDisp, ref_class:refStub.ref_class}; //In case its a full object instead of a stub

              var promise = db[refClass].findById(refId).then(setDisp.bind(refStub, modelObj, fieldName, typeDesc[fieldName][0]));
              promises.push(promise);
              promises.push(registerRef(myClassName, modelObj._id, fieldName, refClass, refId, true));
            }
          }
        }
        if(isUpdate && modelObj._previous[fieldName] && modelObj._previous[fieldName].length > 0) {
          _.forEach(modelObj._previous[fieldName], function(refStub) {
            if(refStub && !refIds[refStub._id]) {
              promises.push(deregisterRef(myClassName, modelObj._id, fieldName, refClass, refStub._id));
            }
          });
        }

      }
      else if(typeDesc[fieldName].type == 'attachment' && modelObj[fieldName]) {
        var attId = modelObj[fieldName].attachment_id;
        GridFsService.annotateIncomingRef(attId, modelObj._bo_meta_data.class_name, modelObj._id, fieldName);
      }
      else if(typeDesc[fieldName] instanceof Array && typeDesc[fieldName][0].type === 'attachment' && modelObj[fieldName] && modelObj[fieldName].length > 0) {
        for(var i=0; i < modelObj[fieldName].length; i++) {
          var attObj = modelObj[fieldName][i];
          if(attObj && attObj.attachment_id) {
            GridFsService.annotateIncomingRef(attObj.attachment_id, modelObj._bo_meta_data.class_name, modelObj._id, fieldName);
          }
        }
      }
    }
  }


  if(promises.length > 0) {
    return Q.all(promises).then(function(){return true;});
  }
  return null;

};

//On update or delete, update any incoming references...
var processInwardRefs = function(isDelete) {
  var modelObj = this;
  var myClass = modelObj._bo_meta_data.class_name;

  return IncomingRefModel.find({target_id: modelObj._id, target_class: myClass}).then(function(irefs) {
    if(!irefs || irefs.length === 0) return;
    _.forEach(irefs, function(iref) {
      var refClass = iref.referencing_class;
      var refId = iref.referencing_id;
      var refField = iref.referencing_field;
      var isArray = iref.referenced_from_array;

      db[refClass].findById(refId).then(function(bo) {
        if(!bo) {
          return;
        }
        if(!isDelete) {
          if(!isArray)
            setDisp.apply(bo[refField], [bo, refField, bo._bo_meta_data.type_descriptor[refField], modelObj]);
          else {
            var fieldVal = bo[refField];
            for(var i=0; i < fieldVal.length; i++) {
              if(fieldVal[i] && fieldVal[i]._id === modelObj._id) {
                setDisp.apply(fieldVal[i], [bo, refField, bo._bo_meta_data.type_descriptor[refField][0], modelObj]);
              }
            }
          }
        }
        else {
          iref.remove();

          if(!isArray)
            bo[refField] = null;
          else {
            var fieldVal = bo[refField];
            for(var i=0; i < fieldVal.length; i++) {
              if(fieldVal[i] && fieldVal[i]._id === modelObj._id) {
               fieldVal[i] = null;
               bo.markModified(refField);
              }
            }
          }
        }
        return bo.save({useVersionId:bo.__ver, skipTriggers:true},null);
      });

    });

  });
}


exports.init = function(conf) {
  console.log('initializing reference service');

  //Register data trigger for outgoing refs - prepare so proper denormalized fields; 100 priorty to occurr after other 'before' datatriggers
  DataTriggerService.registerDataTrigger('sys.internal.processOutRefs', null, 'before', true, true, true, processOutwardRefs, 100);

  //Register data trigger for incoming refs; -100 priorty so it happens before other 'after' datatriggers
  DataTriggerService.registerDataTrigger('sys.internal.processInRefs', null, 'after', false, true, true, processInwardRefs, -100);

  if(conf.bootstrap) {
    return exports.repair();
  }
  else {
    return Q(true);
  }
};


var buildSystemRefMap = function() {
  var refMap = {}; //classname -> {field1:refTd, field2:refTd, ...} (basically a reference-only typedesc for all the classes)
  var incomingRefMap = {};  //classname -> [{class, field, in_array}, {class, field, in_array}, ...] (a list of incoming references to the class)
  return db.BusinessObjectDef.find({}).then(function(bodList) {
    _.forEach(bodList, function(bod) {
      var className = bod.class_name;
      var typeDescMap = bod.definition;

      //Gather all the reference fields; build our structural ref-mapping
      for(var f in typeDescMap) {
        var td = typeDescMap[f];
        if(td.type === 'reference' ||
          (Array.isArray(td) && td[0].type === 'reference')) {
          var isArray = Array.isArray(td);
          if(isArray) {
            td = td[0];
            td.is_array = true;
          }
          refMap[className][f] = td;

          var refClass = td.ref_class;
          incomingRefMap[refClass] = incomingRefMap[refClass] || [];
          var refDesc = {
            class_name: className,
            field:f,
            in_array:isArray
          };
          incomingRefMap[refClass].push(refDesc);
        }
      }

    }); //end _.forEach()

    return {outgoing: refMap, incoming: incomingRefMap};
  });
};

// var registerIncomingRef = function(referencingBo, refFieldValue, refTd, ) {

//   var refId = refFieldValue._id;
//   var refClass = refTd.ref_class || refFieldValue.ref_class; //Ref_class can be defined in the field for non-specific references

//   var ir = new IncomingRefSchema({
//     target_id:refId,
//     target_class: refClass,
//     referencing_class: referencingBo._bo_meta_data.class_name,
//     referencing_id: referencingBo._id,
//     referencing_field: refTd.field_name,
//     referenced_from_array: !!refTd.is_array
//   });
//   promiseChain = promiseChain.then(deferredSave.bind(ir));
// }

//Traverse all BusinessObjects in the system and catalog all references
// Rebuild incoming ref table and
// update all reference fields so that _disp and denormalized fields are up-to-date
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
                  db[refClass].findById(refId).then(
                    setDisp.bind(bo[refTd.field_name], bo, refTd.field_name, refTd)
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
            console.log("SPLICING REF ARRAY %s %s %j", bo._bo_meta_data.class_name, field, bo[field])
            bo[field].splice(arrIndex, 1);
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



