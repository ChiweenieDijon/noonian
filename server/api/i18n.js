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
// var config = require('../../api/config');
var db = require('./datasource');
var Q = require('q');
var _ = require('lodash');

var ENGLISH_ID='-9vPfv2lEeSFtiimx_V4dw';

var autogenLabelGroup =
exports.autogenLabelGroup = function(className) {
  var key = 'sys.dbui.bo.'+className;

  if(db[className]) {
    console.log("Auto-generating LabelGroup for %s", className);
     //Create a LabelGroup for i18n
     var lg = new db.LabelGroup({
       key:key,
       language:{_id:'-9vPfv2lEeSFtiimx_V4dw'},
       value:{}
     });

     for(var f in db[className]._bo_meta_data.type_descriptor) {
       if(f.indexOf('_') !== 0) {
         lg.value[f] = _.startCase(f);
       }
     }

     return lg.save();
   }
   return null;
};

exports.getLabelGroup = function(key, user) {
  var lang = user && user.language ? user.language._id : ENGLISH_ID; //default to english

  return db.LabelGroup.findOne({key:key, 'language._id':lang}).then(function(lg){
    return lg ? lg.value : {};
  });

};

//resolves immediate reference sub-fields
//TODO also resolve inheritance
exports.getBoLabelGroup = function(className, user) {
  var lang = user && user.language ? user.language._id : ENGLISH_ID; //default to english


  var keyPrefix = 'sys.dbui.bo.';
  var baseKey = keyPrefix+className;

  var boMetaData = db[className]._bo_meta_data;

  var queryKeyList = [baseKey]; //LabelGroup keys we'll be asking for

  var fieldToLgKey = {}; //Maps a ref field name to correpsonding LabelGroup key

  //first, determine all the reference fields and build a list of corresponding LabelGroup keys.
  _.forEach(boMetaData.type_descriptor, function(td, fieldName) {
    if(td.type === 'reference') {
      var myKey = keyPrefix+td.ref_class;
      queryKeyList.push(myKey);
      fieldToLgKey[fieldName] = myKey;
    }
  });
  // console.log(fieldToLgKey);

  //Query for all the necessary LabelGroup's
  return db.LabelGroup.find({key:{$in:queryKeyList}, 'language._id':lang}).then(function(lgList){
    var lgMap = _.indexBy(lgList, 'key');
    var composite;
    var initPromise;

    if(lgMap[baseKey]) {
      composite = lgMap[baseKey].value;
      initPromise = Q(true);
    }
    else {
      initPromise = autogenLabelGroup(className).then(function(newLg) {
        composite = newLg.value;
      });
    }

    return initPromise.then(function() {
      _.forEach(fieldToLgKey, function(lgKey, fieldName) {
        if(lgMap[lgKey]) {
          var fieldPrefix = fieldName+'.';
          var labelPrefix = ''; //(composite[fieldName] || fieldName)+': ';

          _.forEach(lgMap[lgKey].value, function(subLabel, subField) {
            composite[fieldPrefix+subField] = labelPrefix+subLabel;
          });
        }
      });

      return composite;
    });
  });
};
