//To process old-style packages w/ all the BusinessObjectPackageUpdate nonsense
//hang onto this until all legacy packages are phased out of existence


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
