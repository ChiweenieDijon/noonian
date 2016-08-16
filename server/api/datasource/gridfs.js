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
var Q = require('q');
var _ = require('lodash');

var db = require('./index');
var mongoose = require('mongoose');
var Grid = require('gridfs-stream');


var gfs;

var filesCollection;

exports.init = function(conf) {
  console.log('initializing GridFs service');
  var deferred = Q.defer();
  var conn = mongoose.createConnection(conf.mongo.uri, conf.mongo.options);

  conn.once('open', function () {
    gfs = Grid(conn.db, mongoose.mongo);
    filesCollection = conn.db.collection('fs.files');
    deferred.resolve(true);
  });

  return deferred.promise;
};


/**
 * Saves a file, returning it's id
 **/
exports.saveFile = function(readStream, metadata) {
  var deferred = Q.defer();

  var id = db.generateId();

  var opts = {_id:id};
  if(metadata) {
    opts.metadata = metadata;

  }

  var ws = gfs.createWriteStream(opts);

  ws.on('finish', function() {
    deferred.resolve(id);
  });
  ws.on('error', function(err) {
    deferred.reject(err);
  });

  readStream.pipe(ws);
  return deferred.promise;
};

/**
 * Opens a write stream to file and returns it;
 * updates metadata object to include attachment_id
 **/
exports.writeFile = function(metadata) {
  var id = db.generateId();

  var opts = {_id:id};
  if(metadata) {
    opts.metadata = metadata;
    metadata.attachment_id = id;

  }

  return gfs.createWriteStream(opts);
}

/**
 * Retreives a file by id
 * @return { readstream:ReadableStream, metadata:{...} }
 **/
exports.getFile = function(fileId) {
  var deferred = Q.defer();
  gfs.findOne({filename:fileId}, function (err, file) {
    if(err || !file)
      return deferred.reject(err || 'file not found in data store');

    deferred.resolve({
      readstream:gfs.createReadStream({filename:fileId}),
      metadata:file.metadata
    });
  });

  return deferred.promise;
};

/**
 * Add metadata to track incoming reference to a file
 **/
exports.annotateIncomingRef = function(fileId, boClass, boId, field) {
  gfs.findOne({ filename:fileId}, function (err, file) {
    if(err)
      return console.error("Error saving incoming ref on attachment %s", fileId);

    if(!file || !file.metadata) {
      console.error('problem updating incoming refs for file %s from $s', fileId, boClass);
      return;
    }

    var refs = file.metadata.incomingRefs;
    if(!refs) {
      refs = [];
    }

    var found=false;
    _.forEach(refs, function(refDesc) {
      if(refDesc.boClass == boClass && refDesc.boId == boId && refDesc.field === field)
        found = true;
    });

    if(!found) {
      refs.push({boClass:boClass, boId:boId, field:field});

      filesCollection.updateOne({ filename:fileId },
        { $set: { 'metadata.incomingRefs' : refs } },
        function(err, result) {
          if(err) console.error('ERROR updating file metadata %s %s', fileId, err);
          else console.log("Updated the file %s metadata %j", fileId, refs);
        }
      );
    }

  });
}
