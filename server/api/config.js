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

var db = require('./datasource');
var Q = require('q');
var _ = require('lodash');

exports.serverConf = require('../conf');

exports.getParameter = function(key, defaultValue) {
  var deferred = Q.defer();

  db.Config.find({key:key, user:null}).exec().then(
    function(result) {

      if(result && result.length > 0) {
        deferred.resolve(result[0].value);
      }
      else if(defaultValue != undefined) {
        deferred.resolve(defaultValue);
      }
      else {
        deferred.reject(key+' not found');
      }
    },
    function(err) {
      deferred.reject(err);
    }
  );

  return deferred.promise;

};

exports.saveParameter = function(key, value) {

  var query = {key:key};

  return db.Config.find(query).exec()
    .then(function(result){
      if(result.length > 0) {
        result[0].value = value;
        return result[0].save();
      }
      else {
        var newConfig = new db.Config({key:key, value:value});
        return newConfig.save();
      }
    });

};

exports.getCustomizedParameter = function(key, userId) {
  var deferred = Q.defer();

  db.Config.find({key:key, $or:[{user:{$exists:false}},{'user._id':userId}]}).exec().then(

    function(result) {
      if(result.length === 0)
        return deferred.resolve(null);
        // return deferred.reject(key+' not found');

      var base, custom;
      _.forEach(result, function(obj){
        if(obj.user) custom = obj;
        else base = obj;
      });

      base = base ? base.value : null;
      custom = custom ? custom.value : null;

      if(base && custom) {
        //Merge custom atop base
        return deferred.resolve(_.merge(base, custom));
      }
      else {
        return deferred.resolve( base || custom );
      }


    },

    function(err) {
      deferred.reject(err);
    }
  );

  return deferred.promise;
};
