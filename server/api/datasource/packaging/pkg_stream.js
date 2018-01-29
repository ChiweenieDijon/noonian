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
/**
 * datasource/packaging/pkg_stream
 * @module db._svc.PackagingService
 * 
 * Contains logic for processing noonian package "streams" - packages 
 * contained w/in a single .json file, as array of "updates"
 * 
 */

var Q = require('q');
var _ = require('lodash');

var oboe = require('oboe'); //library to allow reading stream of large JSON object without holding all in memory at once
var jsonStringify = require('json-stable-stringify'); //library to allow stringified JSON to have consistent ordering of keys

var db = require('../index');
var PkgService = require('./index');
var GridFsService = require('../gridfs');


var stringify = function(obj) {
    return jsonStringify(obj, {space:'\t'});
}


var PkgVersion = exports.PkgVersion = function(major, minor) {
    this.major = major;
    this.minor = minor;
    this.compareTo = function(otherVer) {
        if(this.major < otherVer.major ||
          (this.major === otherVer.major && this.minor < otherVer.minor)
        )
        return -1;
        
        if(this.major > otherVer.major ||
          (this.major === otherVer.major && this.minor > otherVer.minor)
        )
        return 1;
      return 0;
    }
    this.toString = function() {
      return (this.major || '0')+'.'+(this.minor || '0');
    }
}


////////////////////////////////////////////////////////////////////////
// INSTALL PACKAGE       ///////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////

/**
 * 
 */
exports.installPackage = function(pkgReadStream) {
    
  var deferred = Q.defer();

  var bop;

  var promiseChain;
  
  var packageRef = false;
  
  oboe(pkgReadStream)
  .node('metadata', function(metaObj) {
    //console.log('got metadata %j', metaObj);
    //See if we have an existing version of this package installed
    if(db.BusinessObjectPackage) {
      promiseChain = db.BusinessObjectPackage.findOne({_id:metaObj._id});
    }
    else {
      //if we're in DB bootstrap, we don't have the BusinessObjectPackage to work with...
      //  pass a dummy object as BOP to the next step
      promiseChain = Q({bootstrap:true});
    }

    promiseChain = promiseChain.then(function(resultBop) {
        
      bop = resultBop;
      
      if(bop && !bop.bootstrap) {
        //We're performing an upgrade to an existing package
        var installedVer = new PkgVersion(bop.major_version, bop.minor_version);
        var targetVer = new PkgVersion(metaObj.major_version, metaObj.minor_version);
        
        if( installedVer.compareTo(targetVer) >= 0) {
          // installed version is equal or newer
          throw 'version incompatibility; cannot go from '+installedVer.toString()+' to '+targetVer.toString();
        }
      }
      else if(!bop) {
        bop = new db.BusinessObjectPackage();
      }

      //TODO dependency check: metaObj.dependencies against system

      //update the bop
      delete metaObj.__ver;
      _.assign(bop, metaObj);
      if(!bop.bootstrap) {
        return bop.save().then(function() {
            packageRef = {_id:bop._id};
            console.log('set packageRef %j', packageRef);
        });
      }
    });

  })

  .node('!.business_objects.*', function(obj) {
    //console.log('got business_object %j', obj);
    promiseChain = promiseChain.then(function() {
        return PkgService.importObject(obj._class, obj, packageRef);
    });

    return oboe.drop;  //As we process the list, don't retain data in memory
  })

  .fail(function(err) {
    console.log('fail %j', err);
    deferred.reject(err);
  })

  .done(function() {
    promiseChain.then(function() {
      if(bop.bootstrap && db.BusinessObjectPackage) {
          //if we were bootstrapping, the BusinessObjectPackasge should now be available
        bop = new db.BusinessObjectPackage(bop);
        return bop.save();
      }

    }).then(function() {
      deferred.resolve(bop);
    }, function(err) {
      deferred.reject(err);
    });
  });

  return deferred.promise;

}



////////////////////////////////////////////////////////////////////////
// BUILD PACKAGE            ////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////


/**
 *  Run against a BusinessObjectPackage (BOP) record;
 *  - builds the package file, incorporating all UpdateLog's associated w/ the BOP
 *  - stores it in gridfs, sets as package_file attachment to BOP
 *  - updates manifest and increments minor version on BOP record
**/
exports.buildPackage = function(bopId) {
  
  var deferred = Q.defer();
  
  var bop;              //The BusinessObjectPackage object
  var mergedManifest;   //The updated manifest (that incorporates UpdateLog's)
  var pkgStream;        //The stream to which the package json is written.
  
  var abstractBods = {}; //tells us which BOD's in the packages are marked 'abstract' (need to output first)

  //Phase 1: 
  //  grab the BusinessObjectPackage we're working with, and query for all of the UpdateLogs
  //  and use to pull together mergedManifest
  Q.all([
    db.BusinessObjectPackage.findOne({_id:bopId}),
    db.UpdateLog.find({package:bopId}).sort({timestamp:-1})
  ])
  .then(function(resultArr) {
      
    bop = resultArr[0];
    var updateLogs = resultArr[1];
    
    mergedManifest = bop.manifest ? _.clone(bop.manifest) : {};
    
    
    //Merge in UpdateLog records
    var manifestUpdates = {};
    _.forEach(updateLogs, function(ul) {
        var forClass = manifestUpdates[ul.object_class];
        if(!forClass) {
            forClass = manifestUpdates[ul.object_class] = {};
        }
        if(!forClass[ul.object_id]) {
            if(ul.update_type !== 'delete') {
                forClass[ul.object_id] = ul.updated_version;
            }
            else {
                forClass[ul.object_id] = 'deleted';
            }
        }
    });
    
    _.forEach(Object.keys(manifestUpdates), function(className) {
        if(!mergedManifest[className]) {
            mergedManifest[className] = {};
        }
        _.assign(mergedManifest[className], manifestUpdates[className]);
    });
    
    
    //Do a pass through the manifest to preprocess and ensure all version id's are up-to-date
    //  (because we're streaming the meta object first, which includes the manifest)
    var checkBo = function(className, bodCheck, boId, boStub) {
        //console.log('CHECKING %s.%s -> %j', className, boId, boStub);
        if(!boStub) {
            console.error('BusinessObject %s.%s missing from DB but no "delete" UpdateLog was found', className, boId);
            mergedManifest[className][boId] = 'deleted'; //Presume deleted
            return;
        }
        
        mergedManifest[className][boId] = boStub.__ver;
        if(bodCheck && boStub.abstract) {
            abstractBods[boId] = true;
        }
    };
    
    var versionCheckPromises = [];
    _.forEach(mergedManifest, function(idVerMap, className) {
        var projection = {__ver:1};
        var bodCheck = false;
        if(className === 'BusinessObjectDef') {
            projection.abstract = 1;
            bodCheck = true;
        }
        _.forEach(idVerMap, function(v, id) {
            if(v !== 'deleted') {
                versionCheckPromises.push(
                    db[className].findOne({_id:id}, projection).then(checkBo.bind(null, className, bodCheck, id))
                );
            }
        });
    }); //end forEach(mergedManifest)
    
    return Q.all(versionCheckPromises);
    
  }) //end initial BOP and UpdateLog lookup
  .then(function() {
    //Phase 2:
    //  mergedManifest is now fully up-to-date w/ system and
    //  abstractBods tells us which BusinessObjectDef's are marked as 'abstract' 
    //  Create a file in GridFs and start streaming
    
    
    
    //The BOP object itself will act as our 'meta' block, 
    bop.manifest = mergedManifest;
    bop.markModified('manifest');
    bop.package_file = undefined;
    
    //Manage package-level versioning - automatically increment minor version
    bop.major_version = bop.major_version || 0;
    bop.minor_version = (bop.minor_version || 0) + 1;
    
    
    //Stub out the package_file field value (an "attachment")
    var attachmentMetaObj = {
      filename: bop.key+'.'+bop.major_version+'.'+bop.minor_version+'.json',
      type:'application/json'
    };
    
    
    //Start streaming to the output package
    pkgStream = GridFsService.writeFile(attachmentMetaObj);
    
    pkgStream.on('error', function(err) {
      deferred.reject(err);
    });

    
    //don't want to serialize __ver, but save it off
    var verOrig = bop.__ver;
    bop.__ver = undefined;
    
    pkgStream.write('{\n"metadata":');
    pkgStream.write(stringify(bop));
    
    
    bop.__ver = verOrig;
    bop.package_file = attachmentMetaObj;
    
    
    pkgStream.write(',\n"business_objects":[\n');
    
    var comma = ''; //prepended to each object as written; only blank for the first one
    
    var streamBo = function(theObj) {
        if(!theObj) {
            console.error('Trying to stream BO that wasnt in the system (Should never see this)');
            return;
        }
        var streamObj = theObj.toPlainObject();
        streamObj._class = theObj._bo_meta_data.class_name;
        delete streamObj.__v;
        pkgStream.write(comma + stringify(streamObj));
        comma = ',\n'; 
    };
    
    var promiseChain = Q(true);  //a chain of calls, alternating between findOne and streamBo
    var appendToChain = function(boClass, boId) {
        promiseChain = promiseChain
            .then(
                db[boClass].findOne.bind(db[boClass], {_id:boId}, null, null, null) 
            )
            .then(
                streamBo
            );
    };
    
    
    //Write BusinessObjectDef's first, with abstract ones at the start
    if(mergedManifest.BusinessObjectDef) {
        
        var allBodIds = Object.keys(mergedManifest.BusinessObjectDef);
        allBodIds.sort();
        
        _.forEach(allBodIds, function(bodId) {
            if(abstractBods[bodId] && mergedManifest.BusinessObjectDef[bodId] !== 'deleted') {
                appendToChain('BusinessObjectDef', bodId);
            }
        });
        _.forEach(allBodIds, function(bodId) {
            if(!abstractBods[bodId] && mergedManifest.BusinessObjectDef[bodId] !== 'deleted') {
                appendToChain('BusinessObjectDef', bodId);
            }
        });
    }
    
    //Now the rest of the objects, sorted alphabetically
    var allClasses = Object.keys(mergedManifest);
    allClasses.sort();
    _.forEach(allClasses, function(boClass) {
        if(boClass !== 'BusinessObjectDef') {
            var allIds = Object.keys(mergedManifest[boClass]);
            allIds.sort();
            
            _.forEach(allIds, function(id) {
                if(mergedManifest[boClass][id] !== 'deleted') {
                    appendToChain(boClass, id);
                }
            });
        }
    });
    
    //At this point, promiseChain holds the full sequence of calls to 
    // retrieve and stream each BO belonging to the package.
    
    //When that's all done...
    promiseChain = promiseChain.then(function() {
        pkgStream.end(']}\n'); //close off business_object array, and initial open curlybrace
        console.log('COMPLETED PACKAGE GENERATION for %j', bop.key);
        return bop.save();
    });
    
    return promiseChain;
    
  }) //end Phase 2
  .then(
    function() {
      console.log('generated package file %s for %s ',bop.package_file.attachment_id, bop.key);
      deferred.resolve(bop.package_file.attachment_id);
    },
    function(err) {
      deferred.reject(err);
    }
  );

  return deferred.promise;
  
}; //end exports.buildPackage definition
