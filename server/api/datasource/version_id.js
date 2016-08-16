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
 * VersionId class for managing multi-node-update object versioning.
 **/
var _ = require('lodash');

var MY_INSTANCE = require('../../conf').instanceId;

var VersionId = function(versionStr) {
  var instanceMap = this.instanceMap = {};

  var chunks = versionStr.split('|');

  for(var i=0; i < chunks.length; i++) {
    var vidPieces = chunks[i].split(':');
    instanceMap[vidPieces[0]] = +vidPieces[1];
  }
};

VersionId.newVersionIdString = function() {
  return MY_INSTANCE+':1';
};

VersionId.prototype.increment = function() {
  var instanceMap = this.instanceMap;
  if(!instanceMap[MY_INSTANCE]) {
    instanceMap[MY_INSTANCE] = 1;
  }
  else {
    instanceMap[MY_INSTANCE]++;
  }
};

VersionId.prototype.toString = function() {
  var resultArr = [];
  _.forEach(this.instanceMap, function(counter, instance) {
    resultArr.push(instance+':'+counter);
  });

  return resultArr.join('|');
};

module.exports = VersionId;
