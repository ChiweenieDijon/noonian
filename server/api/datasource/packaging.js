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

var Q = require('q');
var _ = require('lodash');


var fs = require('fs');
var path = require('path');

var express = require('express');
var oboe = require('oboe');

var config = require('../config');

var db = require('./index');
var GridFsService = require('./gridfs');
var DataTriggerService = require('./datatrigger');

var PKG_DIR = 'server/data_pkg';

var currentPkg; //An instance of BusinessObjectPackage if system is configured to be building a package; false if not.

var updateCurrentPkg = function(currPkgKey) {
  console.log('Configured to build package: %s', currPkgKey);
  if(currPkgKey) {
    return db.BusinessObjectPackage.findOne({key:currPkgKey}).then(
      function(pkgBo) {
        currentPkg = pkgBo
      },
      function(err) {
        currentPkg = false;
      });
  }
  else {
    currentPkg = false;
    return false;
  }
};


/**
 * Initialize the package-builder logic: data trigger, etc.
 **/
exports.init = function() {
  console.log('initializing packaging service');

  DataTriggerService.registerDataTrigger('sys.internal.pkg', null, 'after', true, true, true, function(isDelete, isUpdate) {
    var clazz = this._bo_meta_data.class_name;
    if(clazz === 'BusinessObjectPackage' || clazz === 'BusinessObjectPackageUpdate')
      return;
    else if(clazz === 'Config' && this.key === 'sys.currentPackage') {
      if(!isDelete)
        updateCurrentPkg(this.value);
      else
        updateCurrentPkg(false);
    }
    else if(currentPkg) {
      if(isUpdate || isDelete) {
        var targetObj = this;
        db.BusinessObjectPackageUpdate.findOne({'package._id':currentPkg._id, 'target_object._id':this._id}).then(function(bopu) {

          if(bopu) {
            if(isDelete && !bopu.updates) {
              //it was a create before; delete -> don't create
              return bopu.remove();
            }

            //We have one... don't mess with it if it was originally a "create" (ie updates==empty)
            if(bopu.updates) {
              if(isDelete) {
                bopu.updates = 'delete';
              }
              else {
                //Update: copy over the fields that have changed.
                bopu.updates.__ver = ''+targetObj.__ver;
                for(var fieldName in targetObj._bo_meta_data.type_descriptor) {
                  if(fieldName.indexOf('_')===0) continue;
                  if(targetObj[fieldName] !== targetObj._previous[fieldName]) { //TODO deep compare/compare based on type
                    // console.log('copying field to bopu update %s, %j', fieldName, targetObj[fieldName]);
                    bopu.updates[fieldName] = targetObj[fieldName];
                  }
                }
              }
              bopu.markModified('updates');
              bopu.save();
            }

          }
          else {
            //We don't have one... create one with updates
            // (we'll be in here if an update is being made to someone else's package)
            bopu = new db.BusinessObjectPackageUpdate({
              'package':currentPkg,
              'target_object':{_id:targetObj._id, ref_class:clazz}
            });

            if(isDelete)
              bopu.updates = 'delete';
            else {
              //_previous_version ALWAYS contains the version id the other package knows about...
              // TODO: may cause trouble when that external package updates that record...
              bopu.updates = {_previous_version:''+targetObj._previous.__ver, __ver:''+targetObj.__ver};
              for(var fieldName in targetObj._bo_meta_data.type_descriptor) {
                if(fieldName.indexOf('_')===0) continue;
                if(targetObj[fieldName] !== targetObj._previous[fieldName]) {
                  // console.log('copying field to bopu update %s', fieldName);
                  bopu.updates[fieldName] = targetObj[fieldName];
                }
              }
            }

            bopu.save();
          }

        });

      }
      else {
        //It's a create, just create a new bopu
        var newUpdate = new db.BusinessObjectPackageUpdate({
          'package':currentPkg,
          'target_object':{_id:this._id, ref_class:clazz}
        });
        newUpdate.save();
      }
    }
  });


  return config.getParameter('sys.currentPackage', false).then(updateCurrentPkg);

};


/**
 *  Run against a BusinessObjectPackage record;
 *  - builds the package file, incorporating all BOPUpdate records into existing manifest;
 *  - stores it in gridfs, sets as package_file attachment to BOP
 *  - updates manifest and increments minor version on BOP record
**/
exports.buildPackage = function(bopId) {
  var deferred = Q.defer();
  var bop;
  var currentManifest;
  var bopusToClear = [];

  var pkgStream;

  var comma = '';

  var processBopuRecord = function(bopu, targetObj) {
    var targetRef = bopu.target_object;
    var updateField = bopu.updates;

    var targetClass = targetRef.ref_class;
    var targetId = targetRef._id;
    if(targetObj) {
      console.log('processing %s %s', targetClass, targetId);
    }
    else {
      console.log('WARNING bopu %s has bad reference: %s.%s', bopu._id, targetClass, targetId);
      return;
    }

    //First, remove it from current manifest, effectively marking the record as processed
    // so we won't add it to the package post bopu-procsessing
    var isMyRecord = currentManifest[targetClass] && currentManifest[targetClass][targetId] && !currentManifest[targetClass][targetId].external_pkg;
    if(currentManifest[targetClass]) {
      delete currentManifest[targetClass][targetId];
    }

    if(!bop.manifest[targetClass])
        bop.manifest[targetClass] = {};

    var toPush;


    if(updateField === 'delete') {
      //if it's a delete of a record that was incorporated in a prior version of this package,
      // it won't get added to the next version of the package. (we cleared it from currentManifest above)
      //if it's a delete of something from an external package, ignore -
      //  we don't want to allow package updates to delete willy nilly from others'
      //either way, this BOPU will be cleared:
      bopusToClear.push(bopu._id);
    }

    //If it's a create OR
    //If it's an update, and it was already in the current manifest...
    else if (!updateField || isMyRecord) {

      //Put it in the package as a 'create' (it belongs to this package)
      toPush = {
        class:targetClass,
        create:targetObj
      };

      //include it in the new manifest
      bop.manifest[targetClass][targetId] = ''+targetObj.__ver;

      //discard the BOPU record when we're done building the package
      bopusToClear.push(bopu._id);
    }
    else {
      //it's an update, but it wasn't already in the package's manifest,
      // so it must be an update to another package's file!  need to be careful about this...
      // (note - we're retaining the BOPU record by not adding it to bopusToClear)
      toPush = {
        class:targetClass,
        id:targetId,
        update:updateField
      };
      //updateField._previous_version ALWAYS contains the version id the other package knows about...
      // TODO: may cause trouble when that external package updates that record...
      bop.manifest[targetClass][targetId] = {external_pkg:true, update_to:''+updateField._previous_version, version:''+updateField.__ver};
    }

    if(toPush) {
      pkgStream.write(comma+JSON.stringify(toPush));
      comma = ',';
    }
  };

  //First, grab the BusinessObjectPackage we're working with.
  db.BusinessObjectPackage.findOne({_id:bopId}).then(function(result) {

    bop = result;
    currentManifest = bop.manifest || {};
    bop.manifest = {};
    bop.major_version = bop.major_version || 0;
    bop.minor_version = bop.minor_version !== undefined ? bop.minor_version+1 : 1;

    var pkgMetaObj = {
      name:bop.name,
      description:bop.description,
      key:bop.key,
      version:''+bop.major_version+'.'+bop.minor_version,
      dependencies: bop.dependencies
    };

    //Start streaming to the output package
    var attachmentMetaObj = bop.package_file = {
      filename: bop.key+'.'+pkgMetaObj.version+'.json',
      type:'application/json'
    };

    pkgStream = GridFsService.writeFile(attachmentMetaObj);

    pkgStream.on('error', function(err) {
      deferred.reject(err);
    });

    pkgStream.write('{"metadata":');
    pkgStream.write(JSON.stringify(pkgMetaObj));
    pkgStream.write(',"updates":[')


    return db.BusinessObjectPackageUpdate.find({"package._id":bopId});
  })
  .then(function(updateList) {
    //Apply all of the BusinessObjectPackageUpdate's
    var promiseList = [];
    _.forEach(updateList, function(bopUpdate) {
      var targetRef = bopUpdate.target_object;
      if(targetRef) {
        promiseList.push(
          db[targetRef.ref_class].findOne({_id:targetRef._id}).then(processBopuRecord.bind(null, bopUpdate))
        );
      }
    });
    return Q.all(promiseList);
  })
  .then(function() {
    //And add all of the records from the currentManifest
    var promiseList = [];
    _.forEach(currentManifest, function(idVerMap, targetClass) {
      if(!bop.manifest[targetClass])
        bop.manifest[targetClass] = {};
      _.forEach(idVerMap, function(manifestVer, id) {

        //If it was an external package, we should have already dealt with it in our bopu processing,
        // since we retain the bopu between package builds, and we recreate them on package application
        if(manifestVer.external_pkg) {
          console.log('WANRING: external_pkg in manifest without accompanying BOPU record: %s.%s', targetClass, id);
          //make note in the new manifest
          manifestVer.missing_from_package = true;
          bop.manifest[targetClass][id] = manifestVer;
        }
        else {
          //grab the target object, (only care if it still exists)
          // update the new manifest, and jam it into the package
          promiseList.push(
            db[targetClass].findOne({_id:id}).then(function(targetObj) {
              if(targetObj) {

                if(''+targetObj.__ver !== ''+manifestVer) {
                  console.log('WANRING: version changed but we have no BOPU record: %s.%s %s->%s', targetClass, id, ''+targetObj.__ver, ''+manifestVer);
                }

                bop.manifest[targetClass][id] = ''+targetObj.__ver;

                pkgStream.write(comma+JSON.stringify({
                  class:targetClass,
                  create:targetObj
                }));
                comma = ',';
              }
            })
          );
        }
      });
    });
    return Q.all(promiseList);
  })
  .then(function() {
    //We've got the manifest built, and the updates all written to the package - finalize the file, and save the BOP, and cleanup
    pkgStream.end(']}\n');

    return Q.all([
      bop.save(),
      db.BusinessObjectPackageUpdate.remove({_id:{$in:bopusToClear}})
    ]);

  })
  .then(
    function() {
      console.log('generated file '+bop.package_file.attachment_id);
      deferred.resolve(bop.package_file.attachment_id);
    },
    function(err) {
      deferred.reject(err);
    }
  );

  return deferred.promise;
};


/*******************************
 Install package
********************************/


/**
 * Applies an update object from a package
 * @this the update object
 * @param currentManifest - manifest for currently-installed version of this package
 * @param newManifest - object retained between calls to incrementally construct manifest for package being installed
 * @param awaitingBod - container retained between calls to defer loading objects until corresponding BOD is loaded
 **/
var applySingleUpdate = function(currentManifest, newManifest, awaitingBod) {
  // console.log(this);

  var boClass = this.class;
  var Model = db[boClass];

  if(!boClass)
    console.error('BAD PACKAGE UPDATE RECORD: %j', this);

  if(!Model && boClass !== 'BusinessObjectDef') {
    awaitingBod[boClass] = awaitingBod[boClass] || [];
    awaitingBod[boClass].push(this);
    return Q(true);
  }
  newManifest[boClass] = newManifest[boClass] || {};

  if(this.create) {
    //"create" -> implies this object belongs to this package.
    var updateObj = this.create;
    var updateVer = updateObj.__ver;

    //Update manifest to show updateVer is what we have for this record
    newManifest[boClass][updateObj._id] = updateVer;

    // console.log('calling .findOne for class %s', boClass);
    //Check if the record already exists in the DB
    return Model.findOne({_id:updateObj._id}).then(function(installedBo) {

      if(installedBo) {
        var installedVer = ''+installedBo.__ver;

        //If versions match, don't need to do anything further
        if(updateVer === installedVer) {
          // console.log('SKIPPING %s.%s - up to date', boClass, updateObj._id);
          return;
        }

        //Check installed version against current manifest to ensure we're updating the intended version
        var currManifestVer = currentManifest[boClass] ? currentManifest[boClass][updateObj._id] : null;
        if(currManifestVer && currManifestVer !== installedVer) {
          console.error('SKIPPING PACKAGE UPDATE TO %s.%s - has been updated independently of package', boClass, updateObj._id);

          //Annotate new manifest to note that we left this modified record as-is in the DB
          newManifest[boClass][updateObj._id] = {version:updateVer,skipped:{reason:'independent update'}};
          //Create a BOPU to keep track of data changes and allow for manual merge later
          return;
        }
      }

      //BusinessObjectDef is a special case; install it via db.installBusinessObjectDef
      if(boClass === 'BusinessObjectDef') {
        return db.installBusinessObjectDef(updateObj).then(function() {
          //BOD is saved and registered w/ datasource layer...
          // now let's check on any objects that may have been waiting on it.
          var targetClass = updateObj.class_name;
          var awaiting = awaitingBod[targetClass];
          delete awaitingBod[targetClass];

          //Objects of this BOD's class may have been encountered prior to this BOD...
          // take care of them now
          if(awaiting) {
            if(updateObj.superclass && !db[targetClass]) {
              //this bod wasn't installed since it has a superclass not yet installed...
              // shift over the awaiting list
              var superClass = updateObj.superclass._disp;

              console.log('DEFERRING BOD LOAD FOR %s - awaiting %s', targetClass, superClass);

              awaitingBod[superClass] = awaitingBod[superClass] || [];
              awaitingBod[superClass] = awaitingBod[superClass].concat(awaiting);

              //also, any subsequent targetClass instances should be waiting on superClass:
              awaitingBod[targetClass] = awaitingBod[superClass];
            }
            else {
              //Their wait is over
              var promiseList = [];
              for(var i=0; i < awaiting.length; i++) {
                promiseList.push(
                  applySingleUpdate.apply(awaiting[i], [currentManifest, newManifest, awaitingBod])
                );
              }
              return Q.all(promiseList);
            }
          }
        });
      }
      else {
        //This is not a BusinessObjectDef
        delete updateObj.__ver; //Clear it out of the record so it doesn't interfere w/ save() logic
        var modelObj;

        if(installedBo) {
          modelObj = installedBo;
          _.assign(modelObj, updateObj);
        }
        else {
          modelObj = new Model(updateObj);
        }

        return modelObj.save({useVersionId:updateVer, skipTriggers:true}, null);
      }
    });

  }
  else if(this.update) {
    var updateObj = this.update;
    var updateVer = updateObj.__ver;
    var targetId = this.id;
    delete updateObj.__ver;
    newManifest[boClass][targetId] = {external_pkg:true, update_to:updateObj._previous_version, version:updateVer};

    return Model.findOne({_id:targetId}).then(function(existingBo) {

      if(!existingBo) {
        console.log('WARNING: package specifies update to a non-existant object %s.%s', boClass, targetId);
        newManifest[boClass][targetId].skipped = {reason:'base object not found'};
        return false;
      }

      if(''+existingBo.__ver === ''+updateVer) {
        //This external BO is already up-to-date; via previous version of this package
        newManifest[boClass][existingBo._id].skipped = {reason:'up to date'};
        return true;
      }
      else if(''+existingBo.__ver !== ''+updateObj._previous_version) {
        console.error('SKIPPING PACKAGE UPDATE TO EXTERNAL %s.%s - version mismatch', boClass, existingBo._id);
        console.error('%s %s', ''+existingBo.__ver, ''+updateVer);

        newManifest[boClass][existingBo._id].skipped = {reason:'version mismatch'};
        return true; //Still let it create the BOPU
      }

      _.assign(existingBo, updateObj);
      // console.log('Saving external %s.%s', boClass, existingBo._id);
      return existingBo.save({useVersionId:updateVer, skipTriggers:true}, null);

    })
    .then(function(existingBo) {
      if(!existingBo)
        return false;
      //save off a BOPU for this update if one doesn't already exist:
      return db.BusinessObjectPackageUpdate.findOne({'package._id':existingBo._id, 'target_object._id':targetId}).then(function(bopu) {
        if(!bopu) {
          bopu = new db.BusinessObjectPackageUpdate({
            'package':existingBo,
            'target_object':{_id:targetId, ref_class:boClass}
          });
        }
        bopu.updates = updateObj;
        bopu.updates.__ver = updateVer; //(we deleted it earlier...)
        return bopu.save();
      });
    });
  }
  else {
    console.error('missing either update or create');
    return Q(true);
  }
};


/**
 *  Function to compare this version to otherVer
 *  @return
 *    < 0 if this is LESS THAN otherVer
 *    > 0 if this is GREATER THAN otherVer
 *    == 0 if this is equal to otherVer
 **/
var versionCompareTo = function(otherVer) {
  if(this.major < otherVer.major ||
      (this.major === otherVer.major && this.minor < otherVer.minor)
    )
    return -1;
  if(this.major > otherVer.major ||
      (this.major === otherVer.major && this.minor > otherVer.minor)
    )
    return 1;
  return 0;
};

var versionToString = function() {
  return (this.major || '0')+'.'+(this.minor || '0');
}

/**
 * Parse a #.# (major.minor) version string into an object w/ keys major, minor
 *  missing dot assumes major version is 0
 * blank string assumes 0.0;
 **/
var parseVersionString =
exports.parseVersionString = function(verStr) {
  var major = 0;
  var minor = 0;

  if(verStr) {
    var dotPos = verStr.indexOf('.');
    if(dotPos > -1) {
      major = +(verStr.substring(0, dotPos));
      minor = +(verStr.substring(dotPos+1));
    }
    else {
      minor = +verStr;
    }
  }

  return {
    major: major,
    minor: minor,
    compareTo: versionCompareTo,
    toString: versionToString
  };
};

/**
 * installs a package from readstream
 * @param readstream - stream of pkg json
 **/
var applyPackageStream =
exports.applyPackageStream = function(readstream) {
  var deferred = Q.defer();

  var bop;

  var currentManifest = {};
  var newManifest = {};
  var awaitingBod = {};

  var promiseChain;


  oboe(readstream)
  .node('metadata', function(metaObj) {
    // console.log('METADATA %j', metaObj);

    //See if we have an existing version of this package installed
    if(db.BusinessObjectPackage) {
      promiseChain = db.BusinessObjectPackage.findOne({key:metaObj.key});
    }
    else {
      //if we're in DB bootstrap, we don't have the BusinessObjectPackage to work with...
      //  pass a dummy object as BOP to the next step
      promiseChain = Q({bootstrap:true});
    }

    promiseChain = promiseChain.then(function(resultBop) {
      bop = resultBop;
      // console.log(bop);

      var pkgVer = parseVersionString(metaObj.version);

      if(bop && !bop.bootstrap) {
        //We're performing an upgrade to an existing package
        _.assign(currentManifest, bop.manifest); //(avoid re-assigning currentManifest variable since we're binding it to applySingleUpdate calls below)

        bop.major_version = bop.major_version || 0;
        bop.minor_version = bop.minor_version || 0;

        if(
          (pkgVer.major < bop.major_version) ||
          (pkgVer.major === bop.major_version && pkgVer.minor <= bop.minor_version)
          ) {
          //pkg is smaller major version, or same major/smaller minor
          throw 'version incompatibility; cannot go from '+bop.major_version+'.'+bop.minor_version+' to '+pkgVer.major+'.'+pkgVer.minor;
        }
      }
      else if(!bop) {
        bop = new db.BusinessObjectPackage();
      }

      //TODO dependency check: metaObj.dependencies against system

      //update the bop
      bop.name = metaObj.name;
      bop.key = metaObj.key;
      bop.description = metaObj.description;
      bop.major_version = pkgVer.major;
      bop.minor_version = pkgVer.minor;
      bop.dependencies = metaObj.dependencies;
      bop.manifest = newManifest;

    });

  })

  .node('!.updates.*', function(updateObj) {
    promiseChain = promiseChain.then(applySingleUpdate.bind(updateObj, currentManifest, newManifest, awaitingBod));

    return oboe.drop;  //As we process the list, don't retain data in memory
  })

  .fail(function(err) {
    deferred.reject(err);
  })

  .done(function() {
    promiseChain.then(function() {
      if(!bop.bootstrap) {
        return bop.save();
      }
      else if(db.BusinessObjectPackage) {
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

};

/**
 * Apply package attached to a bop
 **/
exports.applyPackage = function(bopId) {
  var bopObj;
  return db.BusinessObjectPackage.findOne({_id:bopId})
    .then(function(bop) {
      bopObj = bop;

      if(!bop || !bop.package_file || !bop.package_file.attachment_id) {
        throw 'Invalid BusinessObjectPackage';
      }
      else {
        return GridFsService.getFile(bop.package_file.attachment_id)
      }
    })
    .then(function(gridfsFileObj) {
      console.log('Loading Data Package from %s', gridfsFileObj.metadata.filename);
      return applyPackageStream(gridfsFileObj.readstream).then(function(retBop) {
        bopObj = retBop;
      });
    })
    .then(db._svc.RefService.repair)
    .then(function() {
      return bopObj.key;
    });

};

/**
 * - searches local PKG_DIR for package w/ pkgName
 * - applies latest version it finds
 **/
exports.applyLocalPackage = function(pkgName) {

  // var deferred = Q.defer();

  var pkgFiles = fs.readdirSync(PKG_DIR);

  var fileRegex = new RegExp(pkgName+'\\.(\\d+)\\.(\\d+)\\.json');

  var foundFilename;
  var maj=-1, min=-1;

  _.forEach(pkgFiles, function(filename) {
    var match = fileRegex.exec(filename);
    if(match) {
      var testMaj = +match[1];
      var testMin = +match[2];
      if(testMaj > maj || (testMaj == maj && testMin > min) ) {
        foundFilename = filename;
        maj = testMaj;
        min = testMin;
      }
    }
  });
  console.log('Loading local package file %s (version %s.%s)', foundFilename, maj, min);

  var readstream = fs.createReadStream(PKG_DIR+'/'+foundFilename);

  return applyPackageStream(readstream);

};

/**
 * Place package attached bop into data_pkg directory
 **/
exports.packageToFs = function(bopId) {
  var bopObj;
  return db.BusinessObjectPackage.findOne({_id:bopId})
    .then(function(bop) {
      bopObj = bop;

      if(!bop || !bop.package_file || !bop.package_file.attachment_id) {
        throw 'Invalid BusinessObjectPackage';
      }
      else {
        return GridFsService.getFile(bop.package_file.attachment_id)
      }
    })
    .then(function(gridfsFileObj) {
      console.log('Exporting package %s to data_pkg on filesystem', gridfsFileObj.metadata.filename);

      var outputFile = fs.createWriteStream(PKG_DIR+'/'+gridfsFileObj.metadata.filename);
      return gridfsFileObj.readstream.pipe(outputFile);

    });

};

