/*
Copyright (C) 2016-2019  Eugene Lockett  gene@noonian.org

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

const Q = require('q');
const _ = require('lodash');

const oboe = require('oboe'); //library to allow reading stream of large JSON object without holding all in memory at once
const jsonStringify = require('json-stable-stringify'); //library to allow stringified JSON to have consistent ordering of keys

const semver = require('semver');//npm semantic version parsing

const db = require('../index');
const PkgService = require('./index');
const invokerTool = require('../../../tools/invoker');

const GridFsService = require('../gridfs');
const fs = require('fs');

const serverConf = require('../../../conf');

const stringify = function(obj) {
    return jsonStringify(obj, {space:'\t'});
};

const pkgMgrs = require('./pkg_mgr_wrappers');
const getPkgVersion = pkgMgrs.noonian.getPkgVersion;


//////////////////////////////////////////////////////////////////////
// CHECK PACKAGE       ///////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////


/**
 * 
*/
const getInstallObj = function(bop) {
  if(!bop.on_install_fn) {
    return {};
  } 

  var fn;
  if(typeof bop.on_install_fn === 'string') {
    try {
      eval(`fn = ${bop.on_install_fn}`);
    }
    catch(err) {
      console.error(err);
    }
  }
  else {
    fn = bop.on_install_fn
  }

  return invokerTool.invokeInjected(fn, {}, bop);
}


/**
*  Merge the dependencies from src into target, effectively flattening the 
*    dependecy tree for a package into a single list
*  src and target are the dependency_resulution objects from check result, containing npm, bower,noonian keys
*  items from src are merged in to preceed those in target
*/
const mergeDependencies = function(target, src) {

  ['npm','bower','noonian'].forEach(cat=>{
    if(!src[cat]) {
      return;
    }

    if(!target[cat]) {
      target[cat] = src[cat];
      return;
    }
    ['to_install','to_upgrade'].forEach(k=>{
      let srcDep = src[cat][k];
      let targetDep = target[cat][k] || [];
      if(srcDep) {
        target[cat][k] = srcDep.concat(targetDep);
      }
    });

  });
};

/**
 * Checks the noonian, npm, and bower dependencies in bop.dependencies
 */
const checkDependencies = function(bop, inProgress) {
  console.log('Checking dependencies for %s', bop.key);
  var promiseChain = Q({});
  const resultSummary = {};

  const deps = bop.dependencies;
  if(!deps || (!deps.noonian && !deps.npm && !deps.bower)) {
    //No Dependencies
    return promiseChain;
  }

  const processPkgDeps = function(deps, installedVersions) {
    const summary = {};
    _.forEach(deps, (rangeSpec, pkgName)=>{      
      var installedVer = installedVersions[pkgName];
      if(installedVer) {
        if(!semver.satisfies(installedVer, rangeSpec)) {
          summary.to_upgrade = summary.to_upgrade || [];
          summary.to_upgrade.push({package:pkgName, version:rangeSpec, installed_version:installedVer, dependency_of:bop.key});
        }
      }
      else {
        summary.to_install = summary.to_install || [];
        summary.to_install.push({package:pkgName, version:rangeSpec, dependency_of:bop.key});
        // summary.to_install = summary.to_install || {};
        // summary.to_install[pkgName] = rangeSpec;
      }
    });

    return summary;
  };

  if(deps.npm) {
    promiseChain = promiseChain.then(() => {
      console.log('Checking NPM dependencies');
      return pkgMgrs.npm.getInstalledVersions(Object.keys(deps.npm))
    })
    .then(
      processPkgDeps.bind(null, deps.npm)
    )
    .then(npmSummary => {
      if(Object.keys(npmSummary).length) {
        resultSummary.npm = npmSummary;
      }
    });
  }

  if(deps.bower) {
    promiseChain = promiseChain.then(() => {
      console.log('Checking Bower dependencies');
      return pkgMgrs.bower.getInstalledVersions(Object.keys(deps.bower))
    })
    .then(
      processPkgDeps.bind(null, deps.bower)
    )
    .then(bowerSummary => {
      if(Object.keys(bowerSummary).length) {
        resultSummary.bower = bowerSummary;
      }
    });
  }

  if(deps.noonian) {
    //TODO: somehow we need to deal w/ full dependency tree; 
    //  perhaps involves putting noonian packages in npm; re-thinking "instance" structure on filesystem
    promiseChain = promiseChain.then(() => {
      console.log('Checking Noonian dependencies');
      return pkgMgrs.noonian.getInstalledVersions(Object.keys(deps.noonian))
    })
    .then(
      processPkgDeps.bind(null, deps.noonian)
    )
    .then(noonSummary => {

      if(Object.keys(noonSummary).length) {
        var fullNoonList = [];
        resultSummary.noonian = noonSummary;        
        if(noonSummary.to_install && Object.keys(noonSummary.to_install).length) {
          //Recurse into noonian dependencies to find full tree
          const depIndex = {}; //map key directly to spec object so we don't have to iterate thru to_install to find it later
          const toCheck = {};  //argument to pass to getMetaData
          ['to_install','to_upgrade'].forEach(k=>{
            _.forEach(noonSummary[k], d=>{
              let key = d.package;
              let ver = d.version;            
              if(!inProgress[key]) {
                toCheck[key] = ver;
                depIndex[key] = d;
              }
            });
          });

          console.log('recursing into noonian dependencies %j', toCheck);

          return pkgMgrs.noonian.getMetaData(toCheck).then(mdResult=>{
            console.log('getMetaData result: %j', mdResult);

            var recursiveChecks = Q(true);
            // resultSummary.noonian.recursive = [];

            _.forEach(mdResult, mdCheck=>{
              const metadatas = mdCheck.metadata;
              const repo = mdCheck.repo;
              delete repo.auth;


              _.forEach(metadatas, md => {
                depIndex[md.key].repository = repo;
                recursiveChecks = recursiveChecks.then(()=>{
                  return exports.checkPackage(md, inProgress);
                })
                .then(checkResult=>{
                  //TODO: WTF is wrong when a dependency has the same dependency as this package????????????????????????
                  // resultSummary.noonian.recursive.push(checkResult);
                  //merge results of dependency package into the list for the current package
                  const recursiveDeps = checkResult.dependency_resolution;
                  if(recursiveDeps) {                    
                    mergeDependencies(resultSummary, recursiveDeps, repo);
                  }
                  if(checkResult.user_parameters) {
                    let up = resultSummary.user_parameters || [];
                    resultSummary.user_parameters = checkResult.user_parameters.concat(up);
                  }
                  
                })
                ;
              });
              
            }); //end dependency metadata iteration
            return recursiveChecks;

          });

        }

      }
    })

    ;
  }

  if(deps['noonian-core']) {
    console.log('Checking noonian-core dependency.');
    try {
      var noonPkg = JSON.parse(require('fs').readFileSync('package.json'));      
      if(!semver.satisfies(noonPkg.version, deps['noonian-core'])) {
        resultSummary['noonian-core'] = {to_upgrade:deps['noonian-core']};
      }
    }
    catch(err) {
      console.error(err);
    }

  }

  promiseChain = promiseChain.then(()=>{return resultSummary});
  return promiseChain;
};



/**
  Check the package metaObj against the current sytem, return summary:
   - basic package info (key, name, desc, version)
   - installed version of that pkg (if applicable)
   - parameters requested by package to be collected from user on install
   - list of dependencies for npm, bower, and noonian
   - list of check results of noonian depenencies*

  * To build this list, configured RemotePackageRepositories are queried to obtain metadata objects
    for all of the package's noonian dependencies.  Then those objects are recursively checked, 
    and the tree of results are flattened into a list, sorted in the order that they should be installed.
**/
const checkPackage = exports.checkPackage = function(metaObj, inProgress) {
  console.log('Checking package: %s %s', metaObj.key, metaObj.version);
  
  //checkPackage can be called recursively; inProgress param used to prevent infinite loop
  inProgress = inProgress || {};
  if(inProgress[metaObj.key]) {
    return Q.reject('Circular dependency');
  }
  else {
    inProgress[metaObj.key] = true;
  }

  //See if we have an existing version of this package installed
  return db.BusinessObjectPackage.findOne({_id:metaObj._id}).then(
    function(installedBop) {

      var installObj; //The object containing user_parameters, config, and pre/post functionns
      const checkResult = {
        key:metaObj.key,
        name:metaObj.name,
        description:metaObj.description
      };

      const targetVer = getPkgVersion(metaObj); 
      var installedVer;

      checkResult.target_version = targetVer.toString();

      if(installedBop) {
        //We're performing an upgrade to an existing package
        installedVer = getPkgVersion(installedBop);
        checkResult.installed_version = installedVer.toString();
        
        let versionComparison = semver.compare(installedVer, targetVer);
        if(versionComparison >= 0) {
          // installed version is equal or newer
          checkResult.error = 'version_same_or_older';
          if(versionComparison === 0) {
            checkResult.error_msg = `version ${targetVer} of ${metaObj.key} is already installed on this instance`;
          }
          else {
            checkResult.error_msg = `version incompatibility: cannot go from ${installedVer} to ${targetVer}`;            
          }      
          return Q(checkResult);
        } 
        else {
          //invoke metaObj.on_install_fn, get config, check config.increment_version            
          installObj = getInstallObj(metaObj);

          if(installObj.config && installObj.config.increment_version) {
            //make sure targetVer is installedVer +1
            var diffPiece = semver.diff(installedVer, targetVer);
            var diffAmt = targetVer[diffPiece] - installedVer[diffPiece];
            if(diffAmt != 1) {
              checkResult.error = 'version_must_increment'
              checkResult.error_msg = 'version must increment; cannot go from '+installedVer.toString()+' to '+targetVer.toString();
              return Q(checkResult);
            }


          }

        }
      } //done checking if installedBop
      
      if(!installObj) {
        installObj = getInstallObj(metaObj);
      }
      
      if(installObj.user_parameters) {
        installObj.user_parameters.package_key = metaObj.key;
        checkResult.user_parameters = [installObj.user_parameters];
      }
      
      return checkDependencies(metaObj, inProgress).then(function(depResult) {
        checkResult.dependency_resolution = depResult;
        if(depResult.user_parameters) {
          let up = checkResult.user_parameters;
          checkResult.user_parameters = depResult.user_parameters.concat(up || []);
          delete depResult.user_parameters;
        }
        return checkResult;    
      });
    }
  );

};


exports.getPackageMetadataFromStream = function(pkgReadStream) {
    var deferred = Q.defer();
  
    oboe(pkgReadStream)
    .node('metadata', function(metaObj) {
      deferred.resolve(metaObj);
      this.abort();
    })

    .node('!.business_objects.*', oboe.drop)

    .fail(function(err) {      
      deferred.reject(new Error('Error reading JSON: '+err.message));
    });

    return deferred.promise;
};

/**
 * Read package metadata from pkg stream and:
 *  1) check its dependencies against what is installed
 *  2) resolve to the user_parameters
 */
exports.checkPackageStream = function(pkgReadStream) {
  
  return exports.getPackageMetadataFromStream(pkgReadStream)
    .then(checkPackage);
};


////////////////////////////////////////////////////////////////////////
// INSTALL PACKAGE       ///////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////

/**
 * Install the package (and its dependencies) to this instance from json stream
 @param pkgReadStream node readable stream of package json
 @param userParams object containing parameters to be passed to pacakges' install functions
    keyed by package key
 @param skipDep skip dependency check/installation (mainly for use in recursive calls)
 */
exports.installPackage = function(pkgReadStream, userParams, skipDeps) {
    
  const deferred = Q.defer();

  const dependencyResults = {}; //Holds the results for NPM and Bower dependency installs
  const recursiveResults = {};  //Holds the results for recursive package installs  
  const functionResults = {}; //Holds results of the pre/post functions

  var bop;

  var installObj;

  var promiseChain;
  
  var packageRef = false;
  
  oboe(pkgReadStream)
  .node('metadata', function(metaObj) {
    console.log('got metadata %j', metaObj);
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

      if(!bop) {
        bop = new db.BusinessObjectPackage();
      } 

      if(!bop.bootstrap && !skipDeps) {
        return checkPackage(metaObj, bop);
      }
      else {
        //Skip dependency checking
        return {};
      }
    })
    .then(function(checkResult) {
      console.log('Check result: %j', checkResult);

      if(checkResult.error) {
        throw checkResult.error_msg;
      }

      //update the businessObjectPackage w/ updated package data
      delete metaObj.__ver;
      _.assign(bop, metaObj);


      var drChain = Q(true); //DR = Dependency Resolution


      if(checkResult.dependency_resolution) {
        
        const dr = checkResult.dependency_resolution;
        console.log('DR for %s -> %j', metaObj.key, dr);
        const installDeps = function(mgr) {
          const resultArr = dependencyResults[mgr] = [];

          _.forEach(dr[mgr].to_install, dep => {
            drChain = drChain
              .then(pkgMgrs[mgr].installPackage.bind(pkgMgrs[mgr], dep.package, dep.version))
              .then(callResult=>{
                if(!callResult.success) {
                  resultArr.push({
                    dependency:dep,
                    call_result:callResult,
                    result:'error'
                  });
                }
                else {
                  resultArr.push({
                    dependency:dep,
                    result:'success',
                    call_result:callResult
                  })
                }
              });
          });
        };

        if(dr.npm && dr.npm.to_install) {
          installDeps('npm');
        }
        if(dr.bower && dr.bower.to_install) {
          installDeps('bower');          
        }
        if(dr.noonian && (dr.noonian.to_install||dr.noonian.to_upgrade)) {
          ['to_install','to_upgrade'].forEach(k=>{
            _.forEach(dr.noonian[k], noonDep=>{
              drChain = drChain.then(()=>{
                var stream = pkgMgrs.noonian.getPackage(noonDep.package, noonDep.version, noonDep.repository)
                return exports.installPackage(stream, userParams, true).then(installResult=>{
                  //fail overall install of noonian dependency fails
                  if(installResult.error) {
                    throw installResult.error;
                  }

                  dependencyResults.noonian = dependencyResults.noonian || [];
                  dependencyResults.noonian.push({
                    result:'success',
                    dependency:noonDep,
                    install_result:installResult
                  });

                  //Now we're effectively flattening the npm, bower and noonian dependency install result tree:
                  ['npm','bower','noonian'].forEach(mgr=>{
                    if(installResult.dependencyResults && installResult.dependencyResults[mgr]) {
                      dependencyResults[mgr] = (dependencyResults[mgr] || []).concat(installResult.dependencyResults[mgr]);
                    }
                  });

                  //For recursiveResults, we just one one node containing the whole tree on the final return value 
                  recursiveResults[noonDep.package] = installResult;
                  if(installResult.recursiveResults) {
                    _.assign(recursiveResults, installResult.recursiveResults);
                  }

                  delete installResult.dependencyResults;
                  delete installResult.recursiveResults;
                });
              });
              
            });
          });
        }

      }

      return drChain;
    })
    .then(function() {
      //Invoke "pre-install" function
      installObj = getInstallObj(metaObj);

      if(installObj.pre) {
        return invokerTool.invokeAndReturnPromise(installObj.pre, {userParams:userParams[metaObj.key]}, installObj)
          .catch(err=>{
              console.error('Error calling pre-install function:');
              console.error(err);
              functionResults.pre = {error:err, error_msg: (err && err.message) || err}    
              throw err;
          });
      }

    })
    .then(function(preFunctionCallResult) {
      functionResults.pre = preFunctionCallResult;

      //Set packageRef, so that objects belonging to this package get marked with a reference back to the bop:       
      if(bop._id) {
        packageRef = {_id:bop._id};
      }
      else if(!bop.bootstrap) {
        return bop.save().then(()=>{
            packageRef = {_id:bop._id};
        });
      }
    });

  })

  .node('!.business_objects.*', function(obj) {
    //console.log('got business_object %j', obj._id);
    promiseChain = promiseChain.then(function() {
        return PkgService.importObject(obj._class, obj, packageRef);
    });

    return oboe.drop;  //As we process the list, don't retain data in memory
    //TODO the whole list actually does stay in memory in the promise chain function scopes.... 
  })

  .fail(function(err) {
    console.log('failed to parse json stream');
    console.error(err);
    deferred.resolve({
      result:'error',
      error:err,
      error_msg: 'Failed to parse json stream: '+((err && err.message) || err),
      dependencyResults,
      recursiveResults, 
      functionResults
    });
  })

  .done(function() {
    console.log('done reading json stream');

    promiseChain = promiseChain.then(function() {
      console.log('finished installation of %s', bop.key);
      if(bop.bootstrap && db.BusinessObjectPackage) {
          //if we were bootstrapping, the BusinessObjectPackasge should now be available
        bop = new db.BusinessObjectPackage(bop);        
      }
      
      return bop.save();
      

    })
    .then(function() {
      if(installObj.post) {
        return invokerTool.invokeAndReturnPromise(installObj.post, {userParams:userParams[bop.key]}, installObj).then(
          postFunctionCallResult=>{
            functionResults.post = postFunctionCallResult;
          },
          err=>{
            console.error('Error calling post-install function:');
            console.error(err);
            functionResults.post = {error:err, error_msg:((err && err.message) || err)}              
          }
        );

          
      }
    })
    .then(function() {
      deferred.resolve(
        {result:'success', metaObj:bop, dependencyResults, recursiveResults, functionResults}
      );      
    }, 

    ///FINAL ERROR HANDLER OF promiseChain///
    function(err) {
      console.error(err);
      //Any error occurring along the stream ends up being caught here
      if(err && err.callResult) {
        console.error('Err: %j', err.callResult);
      }

      deferred.resolve({
        result:'error',
        error:err,
        error_msg: (err && err.message) || err,
        metaObj:bop,
        dependencyResults,
        recursiveResults, 
        functionResults
      })
    });

  }); //end oboe.done

  return deferred.promise;

}



////////////////////////////////////////////////////////////////////////
// BUILD PACKAGE            ////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////

const validSegment = {major:'major', minor:'minor', patch:'patch'};
/**
 *  Run against a BusinessObjectPackage (BOP) record;
 *  - builds the package file, incorporating all UpdateLog's associated w/ the BOP
 *  - stores it in gridfs, sets as package_file attachment to BOP
 *  - updates manifest and increments minor version on BOP record
**/
exports.buildPackage = function(bopId, majorMinorPatch) {
  
  majorMinorPatch = validSegment[majorMinorPatch] || 'minor';

  var deferred = Q.defer();
  
  var bop;              //The BusinessObjectPackage object
  var mergedManifest;   //The updated manifest (that incorporates UpdateLog's)
  var pkgStream;        //The stream to which the package json is written.
  
  var abstractBods = {}; //tells us which BOD's in the packages are marked 'abstract' (need to output first)

  var incorporatedUpdateLogIds = []; //keep track 
  
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
        if(ul.incorporated) {
          return;
        }
        incorporatedUpdateLogIds.push(ul._id);
        
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
    let ver = pkgMgrs.noonian.getPkgVersion(bop);
    ver.inc(majorMinorPatch);
    bop.version = ver.toString()

    //Will deprecate major_version and minor_version once all existing packages have been updated:
    bop.major_version = ver.major;
    bop.minor_version = ver.minor;
    
    
    //Stub out the package_file field value (an "attachment")
    var attachmentMetaObj = {
      filename: bop.key+'.'+bop.version+'.json',
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
        return bop.save().then(function() {
          var incorpVer =bop.major_version+'.'+bop.minor_version;
          return db.UpdateLog.update({_id:{$in:incorporatedUpdateLogIds}}, {$set:{incorporated:incorpVer}}, {multi:true}).exec();
        });
    });
    
    return promiseChain;
    
  }) //end Phase 2
  .then(
    function() {
      console.log('generated package file %s for %s ',bop.package_file.attachment_id, bop.key);
      
      if(serverConf.packageFsConfig && serverConf.packageFsConfig[bop.key] && serverConf.packageFsConfig[bop.key].distDir) {
        //Stream the new package to dist
        var targetPath = serverConf.packageFsConfig[bop.key].distDir;
        return GridFsService.getFile(bop.package_file.attachment_id).then(function(gridfsFileObj) {
          console.log('Exporting package %s to %s', gridfsFileObj.metadata.filename, targetPath);

          var outputFile = fs.createWriteStream(targetPath+'/'+gridfsFileObj.metadata.filename);
          gridfsFileObj.readstream.pipe(outputFile);
          
          var onComplete = function() {
            deferred.resolve(bop.package_file.attachment_id);
          };
          outputFile.on('finish', onComplete);
          outputFile.on('error', onComplete);
          
        }); 
      }
      else {
        deferred.resolve(bop.package_file.attachment_id);
      }
    },
    function(err) {
      deferred.reject(err);
    }
  );

  return deferred.promise;
  
}; //end exports.buildPackage definition
