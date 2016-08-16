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
 * invoker.js
 *  tools for invoking server-side functions
 **/
var Q = require('q');
var _ = require('lodash');
var db = require('../api/datasource');

var datatrigger = require('../api/datasource/datatrigger');


var globalInjections = {};



/**
 * determines parameter names for provided function
 **/
var getParameterNames =
exports.getParameterNames = function(fn) {

  var paramRegex = /\(([\s\S]*?)\)/; //Captures the string between open and close paren
  var splitRegex = /[ ,\n\r\t]+/;     //Matches whitespace and commas to split the param list into param names

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


var nodeRequire = function(libName) {
  return require(libName);
}


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
    }

    return null;
  });

  globalInjections = {
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
  }

  return db.CodeModule.find({}).exec().then(function(codeModules) {
    _.forEach(codeModules, function(cm) {
      try {
        globalInjections[cm.name] = invokeInjected(cm.code, globalInjections);
      }
      catch(err) {
        console.error('error invoking CodeModule constructor %s %s', cm.name, err);
      }
    });
  });


};
