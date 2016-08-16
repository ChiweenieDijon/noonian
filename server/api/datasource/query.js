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
 * query.js
 * API to deal with queries and query clauses - evaluate, stringify, ...
 */
var db = require('./index');
var FieldTypeService = require('./fieldtypes');
var DataTriggerService = require('./datatrigger');


var _ = require('lodash');
var Q = require('q');

//Retain lists of QueryOp objects, keyed by FieldType name, e.g. { string:[QueryOp1, QueryOp2] }
//  for determining valid QueryOps for a particular field type
var queryOpByTypeName;

//Retain mapping of op name + field type name -> QueryOp object, e.g. { $op:{ stirng:QueryOp1, integer:QueryOp2 } }
//  for determining valid QueryOp for a particular op / field type combo
var queryOpByOpName;


var initialized = false;

var cacheAndIndex = function() {
  var byTypeName = {};
  var byName = {};

  //Cache and index FieldTypes and QueryOps
  return db.QueryOp.find({}).then(function(queryOpList) {
    console.log("Caching QueryOp's");
    _.forEach(queryOpList, function(qo) {

      if(!byName[qo.name]) {
        byName[qo.name] = {};
      }

      if(!qo.types || qo.types.length === 0) {
        var wildcardKey = qo.for_array ? 'array:*' : '*';
        byName[qo.name][wildcardKey] = qo;
      }

      _.forEach(qo.types, function(typeRef) {
        var ft = FieldTypeService.getFieldTypeHandler(typeRef._id);
        var typeName = qo.for_array ? 'array:'+ft.name : ft.name;

        if(!byTypeName[typeName]) {
          byTypeName[typeName] = [];
        }
        byTypeName[typeName].push(qo);

        byName[qo.name][typeName] = qo;
      });
    })

    queryOpByTypeName = byTypeName;
    queryOpByOpName = byName;
    initialized = true;

  });
}

var init =
exports.init = function() {
  console.log("Initializing QueryOp service");
  DataTriggerService.registerDataTrigger ('sys.internal.queryOpCacheUpdate', 'ddY7PaHnQsGCChSZfL12wg', 'after', true, true, true, cacheAndIndex);

  return cacheAndIndex();
};

var getQueryOpList =
exports.getQueryOpList = function(forType) {
  return queryOpByTypeName[forType];
}

var getQueryOpObject = function(opName, typeName) {
  var typeMap = queryOpByOpName[opName];
  var wildcardKey = typeName.indexOf('array:') === 0 ? 'array:*' : '*';
  if(typeMap) {
    return typeMap[typeName] || typeMap[wildcardKey];
  }

  return null;
};

/**
 * @return true of modelObj satisifes query condition
 **/
var satisfiesCondition =
exports.satisfiesCondition = function(modelObj, condition) {
  // var typeDescMap = modelObj._bo_meta_data.type_descriptor;
  var metaData = modelObj._bo_meta_data;
  var condKeys = Object.keys(condition);

  if(condKeys.length > 1) {
    //{ field1:{$op:{...}}, field2:{$op:{...}} }
    // convert to $and:[{ field1:{$op:{...}} }, { field2:{$op:{...}} }]
    var effectiveCond = {$and:[]};
    for(var condKeyIndex=0; condKeyIndex < condKeys.length; condKeyIndex++) {
      var k = condKeys[condKeyIndex];
      var subCond = {};
      subCond[k] = condition[k];
      effectiveCond.$and.push(subCond);
    }

    return satisfiesCondition(modelObj, effectiveCond);
  }
  else if(condKeys.length === 1) {
    var k = condKeys[0];
    var condValue = condition[k];

    // console.log("KEY:%s VALUE:%j", k, condValue);

    if(k === '$or') {
      for(var i=0; i < condValue.length; i++) {
        if(satisfiesCondition(modelObj, condValue[i])) {
          return true;
        }
      }
      return false;
    }
    else if(k === '$and') {
      for(var i=0; i < condValue.length; i++) {
        if(!satisfiesCondition(modelObj, condValue[i])) {
          return false;
        }
      }
      return true;
    }
    else if(k === '$nor') {
      for(var i=0; i < condValue.length; i++) {
        if(satisfiesCondition(modelObj, condValue[i])) {
          return false;
        }
      }
      return true;
    }
    else if(metaData.getTypeDescriptor(k)) { //if(typeDescMap[k]) {
      //k should be a field name
      var fieldName = k;
      var fieldValue = _.get(modelObj, fieldName);//modelObj[fieldName];
      var td = metaData.getTypeDescriptor(k); //typeDescMap[fieldName];
      var typeName = td instanceof Array ? 'array:'+td[0].type : td.type;

      if(typeof condValue === 'string') {
        var queryOpObj = queryOpByOpName.$eq[typeName];
        if(!queryOpObj) {
          console.error('MISSING QueryOp for OP $eq TYPE %s', typeName);
          return false;
        }
        return queryOpObj.evaluate(condValue, fieldValue);
      }

      //Keys in condValue are the $op's
      var ops = Object.keys(condValue);
      if(ops.length > 1) {
        // "fieldName":{$op1:{...}, $op2:{...}}
        // convert to $and[ {fieldName:{ $op1:{...} }, {fieldName:{ $op2:{...} } ]
        var effectiveCond = {$and:[]};
        for(var opIndex=0; opIndex < ops.length; opIndex++) {
          var op = ops[opIndex];

          var innerOp = {}; // { $op:{...} }
          innerOp[op] = condValue[op];

          var subCond = {}; // {fieldName:{ $op:{...} } }
          subCond[fieldName] = innerOp;

          effectiveCond.$and.push(subCond);
        }

        return satisfiesCondition(modelObj, effectiveCond);
      }
      else if(ops.length === 1) {
        var op = ops[0];

        if(op === '$not') {
          var negCond = {};
          negCond[fieldName] = condValue[op];
          return !satisfiesCondition(modelObj, negCond);
        }

        // console.log("OP: %s, TYPE: %s", op, typeName);
        var queryOpObj = getQueryOpObject(op, typeName);

        if(!queryOpObj || !queryOpObj.evaluate) {
          console.error('MISSING OR BAD QueryOp for OP %s TYPE %s', op, typeName);
          return false;
        }

        return queryOpObj.evaluate(condValue[op], fieldValue);
      }
      else { //no ops for a field
        return false; //Consistent w/ mongo's behavior for find({ field:{} })
      }

    }
    else { //not sure what k is...
      console.log('WARNING: unknown condition key "%s" when checking condition %j', k, condition);
    }

  }
  else { //condKeys.length isn't 1 and isn't greater than one --> Empty condition object...
    return true; // consistent w/ mongo.find( {} );
  }

};


/**
 * Process any custom query operators to create a query for mongodb
 *  no return value; applies changes directly to queryObj
 **/
var queryToMongo =
exports.queryToMongo = function(queryObj, boMetaData) {
  // console.log("CONVERTING TO MONGO: %j", queryObj);

  if(!initialized) return; //If we're bootstrapping, QueryOp's haven't yet been loaded, but system can still do basic queries

  if(!queryObj || typeof queryObj !== 'object')
    return;

  var keys = Object.keys(queryObj);
  for(var keyIndex = 0; keyIndex < keys.length; keyIndex++) {
    var k = keys[keyIndex];
    var v = queryObj[k];

    //First, check if it's a grouping clause:
    if(k === "$or" || k === "$and" || k === "$nor") {
      //v is an array of terms... handle each one recursively
      for(var i=0; i < v.length; i++)
        queryToMongo(v[i], boMetaData);
    }
    else if(queryOpByOpName[k]) {
      //k is an operator that doesn't require a field (e.g. $fulltextsearch)
      var queryOpObj = queryOpByOpName[k]['*'];

      if(queryOpObj && queryOpObj.toMongo) {
        //toMongo() should replace the custom clause w/ a standard mongo one
        var convertedClause = queryOpObj.toMongo(v, boMetaData.type_descriptor, FieldTypeService);
        delete queryObj[k];
        _.assign(queryObj, convertedClause);
      }
      else if(queryOpObj) {
        console.log('WARNING naked QueryOp doesnt have * key! %s %j', k, queryOpByOpName[k]);
      }
    }
    else if(boMetaData.getTypeDescriptor(k)) {

      //k should be a valid field
      var fieldName = k;
      var clause = queryObj[fieldName];
      var td = boMetaData.getTypeDescriptor(k);
      var typeName = td instanceof Array ? 'array:'+td[0].type : td.type;


      if(typeof clause === 'string' && queryOpByOpName.$eq[typeName]) {
        var queryOpObj = queryOpByOpName.$eq[typeName];
        if(queryOpObj.toMongo) {
          var convertedClause = queryOpObj.toMongo(fieldName, clause, boMetaData.type_descriptor);
          if(convertedClause[fieldName]) {
            queryObj[fieldName] = convertedClause[fieldName];
          } else {
            //Swap out full-on
            // *NOTE could cause problems if using a custom query w/in abbreviated AND notation, e.g. "field":{$customOp:{..}, $plainOp:{..} }
            //  should re-factor to cannonicalize multi-key clauses into explicit $and:[...]
            delete queryObj[fieldName];
            _.assign(queryObj, convertedClause);
          }
        }
      }

      if(typeof clause === 'object' && clause != null) {  
        var ops = Object.keys(clause);
        for(var opIndex=0; opIndex < ops.length; opIndex++) {
          var op = ops[opIndex];
          if(op === '$not') {
            var negatedKeys = Object.keys(clause.$not);
            if(negatedKeys.length === 1) {
              op = negatedKeys[0];
              clause = clause.$not;
            }
            // else {
            //   //TODO Convert to $nor, handle recursively
            // }
          }

          var queryOpObj = getQueryOpObject(op, typeName);

          if(queryOpObj && queryOpObj.toMongo) {
            var convertedClause = queryOpObj.toMongo(fieldName, clause[op], boMetaData.type_descriptor);

            if(convertedClause[fieldName]) {
              delete clause[op];
              _.assign(clause, convertedClause[fieldName]);
            } else {
              //Swap out full-on
              // *NOTE could cause problems if using a custom query w/in abbreviated AND notation, e.g. "field":{$customOp:{..}, $plainOp:{..} }
              //  should re-factor to cannonicalize multi-key clauses into explicit $and:[...]
              delete queryObj[fieldName];
              _.assign(queryObj, convertedClause);
            }


          }
          
        }
      }

    }


  }

};


var conjLabels = {
  $and:'AND',
  $or:'OR',
  $nor:'NOR'
};
/**
 * Convert query object to human-readable string
 **/
var stringifyQuery =
exports.stringifyQuery = function(queryObj, boMetaData, fieldLabels) {

  if(!queryObj)
    return '';

  var condKeys = Object.keys(queryObj);

  if(condKeys.length === 0) {
    return '';
  }
  else if(condKeys.length > 1) {
    //{ field1:{$op:{...}}, field2:{$op:{...}} }
    // convert to $and:[{ field1:{$op:{...}} }, { field2:{$op:{...}} }]
    var effectiveCond = {$and:[]};
    for(var condKeyIndex=0; condKeyIndex < condKeys.length; condKeyIndex++) {
      var k = condKeys[condKeyIndex];
      var subCond = {};
      subCond[k] = queryObj[k];
      effectiveCond.$and.push(subCond);
    }

    return stringifyQuery(effectiveCond, boMetaData, fieldLabels);
  }

  var k = condKeys[0];

  //First, check if it's a grouping clause:
  if(k === "$or" || k === "$and" || k === "$nor") {
    var result = '';
    var conj = conjLabels[k];
    var terms = queryObj[k];
    var lastTerm = terms.length - 1;
    for(var i=0; i < terms.length; i++) {
      result += '(' + stringifyQuery(terms[i], boMetaData, fieldLabels) + ')';
      if(i != lastTerm)
        result += ' '+conj+' ';
    }
    return result;
  }
  else if(queryOpByOpName[k]) {
    //k is an operator that doesn't require a field (e.g. $fulltextsearch)
    var queryOpObj = queryOpByOpName[k]['*'];

    if(queryOpObj && queryOpObj.stringify) {
      //toMongo() should replace the custom clause w/ a standard mongo one
      return queryOpObj.stringify(queryObj[k]);

    }
    else {
      return k+' '+queryObj[k];
    }
  }
  else if(boMetaData.getTypeDescriptor(k)) {
    //k is a valid field (or sub-field)
    var fieldName = k;
    var clause = queryObj[fieldName];
    var td = boMetaData.getTypeDescriptor(k);
    var typeName = td instanceof Array ? 'array:'+td[0].type : td.type;

    var negate = false;
    var queryOpObj;

    if(typeof clause === 'string' || clause == null) {
      queryOpObj = queryOpByOpName.$eq[typeName];

    }
    else  {
      var ops = Object.keys(clause);
      for(var opIndex=0; opIndex < ops.length; opIndex++) {
        var op = ops[opIndex];
        if(op === '$not') {
          negate = true;
          var negatedKeys = Object.keys(clause.$not);
          op = negatedKeys[0];
          clause = clause.$not;
        }
        queryOpObj = getQueryOpObject(op, typeName);
      }
    }

    var result;
    if(queryOpObj && queryOpObj.stringify) {
      result = (fieldLabels[fieldName] || fieldName) + ' ' + queryOpObj.stringify(clause[op] ? clause[op] : clause);
    }
    else {
      result = (fieldLabels[fieldName] || fieldName) + ' ' + op + ' ' + clause;
    }

    if(negate)
      return 'NOT ('+result+')';
    else
      return result;


  }

}

