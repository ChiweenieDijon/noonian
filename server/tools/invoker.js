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
 * invoker.js
 *  tools for invoking server-side functions
 **/
var Q = require('q');
var _ = require('lodash');
var db = require('../api/datasource');

var datatrigger = require('../api/datasource/datatrigger');


var nodeRequire = function(libName) {
  return require(libName);
}

var globalInjections = {
    Q:Q,
    '_':_,
    db:db,
    config:require('../api/config'),
    auth:require('../api/auth'),
    i18n:require('../api/i18n'),
    invoker:exports,
    nodeRequire:nodeRequire,
    httpRequestLib:require('request')
    // https:require('https')
  };



/**
 * determines parameter names for provided function
 **/
const paramRegex = /\(([\s\S]*?)\)/; //Captures the string between open and close paren
const splitRegex = /[ ,\n\r\t]+/;     //Matches whitespace and commas to split the param list into param names
 
const getParameterNames =
exports.getParameterNames = function(fn) {

  var execResult = paramRegex.exec(fn);

  if(!execResult || !execResult[1])
    return [];

  var paramString = execResult[1].trim();

  if (paramString.length === 0)
    return [];

  return paramString.split(splitRegex);
};


/**
 *  invokes a function, injecting the arguments from injetedParamMap
 */
var invokeInjected =
exports.invokeInjected = function(fnToInvoke, injetedParamMap, fnThis) {
  var paramList = getParameterNames(fnToInvoke);

  var argList = [];

  _.forEach(paramList, function(paramName) {
    var toInject = injetedParamMap[paramName] || globalInjections[paramName];
    if(toInject)
      argList.push(toInject);
    else
      argList.push(null);
  });

  return fnToInvoke.apply(fnThis, argList);
};


var invokeAndReturnPromise =
exports.invokeAndReturnPromise = function(fnToInvoke, injetedParamMap, fnThis) {
  try {
    var retval = invokeInjected(fnToInvoke, injetedParamMap, fnThis);
    if(Q.isPromise(retval))
      return retval;
    else
      return Q(retval);
  } catch(err) {
    return Q.reject(err);
  }
};





var addGlobalInjectable = function(cm) {
  try {
    globalInjections[cm.name] = invokeInjected(cm.code, globalInjections);
  }
  catch(err) {
    console.error('error invoking CodeModule constructor %s %s', cm.name, err);
  }
}

var init =
exports.init = function() {
  
  const cmDependsOn = {}; //maps CodeModule id -> id's of CodeModules it depends upon
  const cmHasDependants = {}; //maps CodeModuel id -> id's of CodeModules that depend upon it

  //Watch CodeModule objects
  datatrigger.registerDataTrigger('sys.internal.invoker', 'oThGB1UxRGiPK6tzu4PUXQ', 'after', true, true, true, function(isCreate, isUpdate, isDelete) {
    if(isDelete) {
      delete globalInjections[this._previous.name];
    }
    else if(isCreate) {
      addGlobalInjectable(this);
    }
    else if(isUpdate) {
      if(this._previous.name !== this.name) {
        globalInjections[this.name] = globalInjections[this._previous.name];
        delete globalInjections[this._previous.name]
      }
      if(this._previous.code !== this.code) {
        addGlobalInjectable(this);
      }
      
      var myDependants = cmHasDependants[this._id];
      if(myDependants && myDependants.length) {
        //I need to re-initialize this CodeModule's dependents
        db.CodeModule.find({_id:{$in:myDependants}}).then(function(cmList) {
          _.forEach(cmList, addGlobalInjectable);
        });
      }
    }

    return null;
  });

  return db.CodeModule.find({}).exec().then(function(codeModules) {
    
    const cmByName = _.indexBy(codeModules, 'name');
    const cmById = _.indexBy(codeModules, '_id');
    
    //First, build DEPENDS-ON map
    _.forEach(codeModules, cm => {      
      _.forEach(getParameterNames(cm.code), p => {
        if(cmByName[p]) {
          cmDependsOn[cm._id] = cmDependsOn[cm._id] || [];
          
          var dep = cmByName[p]._id;
          cmDependsOn[cm._id].push(dep);
          
          if(cmDependsOn[dep] && cmDependsOn.indexOf(cm._id) > -1) {
            console.error('****WARNING!!! Circular dependencies in CodeModules not supported! Refactor CodeModules %s and %s', cm.name, cmByName[p].name);
          }
        }
      });
    });
    
    //Next, generate HAS-DEPENDEDENTS map:
    _.forEach(cmDependsOn, (depList, dependant)=>{
      _.forEach(depList, cmWithDependant=>{
        cmHasDependants[cmWithDependant] = cmHasDependants[cmWithDependant] || [];
        cmHasDependants[cmWithDependant].push(dependant);
      });
    });
    
    //Next, sort codeModules so that dependants come after the ones on which they are dependant
    const added = {};
    const ordered = [];
    const addCm = function(cm) {
      if(!added[cm._id]) {
        added[cm._id] = true;
        if(cmDependsOn[cm._id]) {
          _.forEach(cmDependsOn[cm._id], depId=>{
            addCm(cmById[depId]);
          });
        }
        ordered.push(cm);
      }
    };
    _.forEach(codeModules, addCm);
    
    _.forEach(ordered, cm => {
      console.log('Installing CodeModule: %s', cm.name);
      addGlobalInjectable(cm);      
    });
  });


};
