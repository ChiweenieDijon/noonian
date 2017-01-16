function (db, queryParams, httpRequestLib, Q, _) {
    var PackagingService = db._svc.PackagingService;
    
    var repoUrl;
    var authHeader;
    
    var myPackages = {};
    
    return db.RemotePackageRepository.findOne({_id:queryParams.id}).then(function(rpr) {
        if(!rpr) {
            throw 'invalid remotePackageRepo id';
        }
        
        _.forEach(rpr.packages, function(pkgRef) {
            myPackages[pkgRef.key] = {major:pkgRef.major_version, minor:pkgRef.minor_version};
        });
        
        console.log('Checking update for packages: %j', myPackages);
        repoUrl = rpr.url;
        authHeader = { authorization:'Bearer '+rpr.auth.token};
        
        var deferred = Q.defer();
        httpRequestLib.get( {
              uri:repoUrl+'/ws/package_repo/getList',
              headers:authHeader,
              rejectUnauthorized: false
          }, function(err, httpResponse, body) {
              if(err) {
                  deferred.reject(err);
              }
              else {
                  try {
                    deferred.resolve(JSON.parse(body));
                  }
                  catch(err) {
                      deferred.reject(err);
                  }
              }
          });
          return deferred.promise;
        
    })
    .then(function(pkgList){
        // console.log('Received pkg list: %j', pkgList);
        var toUpgrade = {};
        var workToDo = false;
        
        _.forEach(pkgList, function(remotePkg) {
            var localVersion = myPackages[remotePkg.key];
            if(localVersion) {
                var remoteVersion = PackagingService.parseVersionString(remotePkg.latest_version);
                // console.log('Checking %s against remote version %j', remotePkg.key, remoteVersion);
                if(remoteVersion.compareTo(localVersion) > 0) {
                    //Scan through available versions; find the first one that is newer than localVersion
                    for(var i=0; i < remotePkg.available_versions.length; i++) {
                        var v = PackagingService.parseVersionString(remotePkg.available_versions[i]);
                        if(v.compareTo(localVersion) > 0) {
                            toUpgrade[remotePkg.key] = v;
                            workToDo = true;
                            break;
                        }
                    }
                    
                }
            }
        });
        
        //toUpgrade now maps pkg keys to target upgrade versions
        if(workToDo) {
            var summaryString = '';
            var promiseChain = Q(true);
            _.forEach(toUpgrade, function(askForVersion, key) {
                summaryString += key+' '+askForVersion.toString()+', ';
                
                promiseChain = promiseChain.then(function() {
                    var requestParams = {
                        uri:repoUrl+'/ws/package_repo/getPackage?key='+key+'&version='+askForVersion.toString(),
                        headers:authHeader,
                        rejectUnauthorized: false
                    };
                
                    var pkgStream = httpRequestLib.get(requestParams);
                    return PackagingService.applyPackageStream(pkgStream);
                });
            });
            console.log('attempting updates: %s', summaryString);
            return promiseChain.then(function() {
               return {message: 'Upgrade complete: '+summaryString}; 
            });
        }
        else {
            return({message:'all packages already up-to-date!'});
        }
    });
}