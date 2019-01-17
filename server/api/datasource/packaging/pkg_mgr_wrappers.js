/*
Copyright (C) 2018  Eugene Lockett  gene@noonian.org

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
const Q = require('q');
const _ = require('lodash');
const semver = require('semver');
const request = require('request');

const path = require('path');
const spawn = require('child_process').spawn;

const db = require('../index');


const nodeExecPath = process.execPath;
const nodeBinPath = path.dirname(nodeExecPath); 



/**
 * Execute command (in node bin dir) w/ args; 
 * @return promise resolving to object: {stdout:'..',stderr:'..',exitCode:#,success:boolean}
*/
const executeCommand = function(cmd, args) {
	const deferred = Q.defer();

	const resultObj = {
		cmd, args,
    	stdout:'',
    	stderr:''
    };

    const handleError = err=>{
    	console.error('ERROR SPAWNING COMMAND "%s" %j  -> %j', cmd, args, resultObj);
    	console.error(err);
        deferred.reject(err);
    };

	try {
		const spawnOpts = {
			env: { PATH:nodeBinPath }, 
			stdio: ['ignore','pipe','pipe']
		};

        const subProc = spawn(cmd, args, spawnOpts);
        
        subProc.stdout.on('data', (data) => {
        	resultObj.stdout += data;
        });
        subProc.stderr.on('data', (data) => {
        	resultObj.stderr += data;
        });
        subProc.on('close', (code) => {            
        	resultObj.exitCode = code;
        	resultObj.success = (code===0);
        	deferred.resolve(resultObj);
        });
        
        subProc.on('error', handleError);
    }
    catch(err) {
    	handleError(err);        
    }
    
    return deferred.promise;

};

/**
 * execute command that returns json to stdout
 * @return promise resolving to parsed json
 */
const executeJsonCommand = function(cmd, args) {
	return executeCommand(cmd, args).then(result =>{
		try{
			if(result.success) {
            	return JSON.parse(result.stdout);
            }
            else {
            	var err = 'Invalid exit code returned from '+cmd;
            	console.error('%s \n %j', err, result);
            	throw new Error(err);
            }
        }
        catch(err) {
            throw new Error('bad json returned by npm: '+resultStr);
        }
	});
}


const npm = {
	getPackageTree:function() {
		if(this.pkg_tree) {
			return Q(this.pkg_tree);
		}

		return executeJsonCommand(nodeBinPath+'/npm', ['ls', '--json']).then(
			result => {
				this.pkg_tree = result;
				return result;
			}
		);
	},

	/**
	 * @return object mapping NPM package name to installed version
	*/
	getInstalledVersions: function(pkgNames) {
		return this.getPackageTree().then(pkgTree => {
			const deps = pkgTree.dependencies;

			if(!pkgNames) {
				pkgNames = Object.keys(deps);
			}

			const result = {};

			_.forEach(pkgNames, pkg => {
				if(deps[pkg]) {
					result[pkg] = deps[pkg].version;
				}
			});

			return result;
		});
	},

	installPackage: function(name, version) {
		var pkgSpec = version ? name+'@'+version : name;
		console.log('installing %s', pkgSpec);
		return executeCommand(nodeBinPath+'/npm', ['install', pkgSpec]);
	}


};




const bower = {
	getPackageTree: function() {
		if(this.pkg_tree) {
			return Q(this.pkg_tree);
		}

		return executeJsonCommand(nodeBinPath+'/bower', ['list', '--offline', '--json']).then(
			result => {
				this.pkg_tree = result;
				return result;
			}
		);
	},

	/**
	 * @return object mapping bower package name to installed version
	*/
	getInstalledVersions: function(pkgNames) {
		return this.getPackageTree().then(pkgTree => {
			const deps = pkgTree.dependencies;

			if(!pkgNames) {
				pkgNames = Object.keys(deps);
			}

			const result = {};

			_.forEach(pkgNames, pkg => {
				if(deps[pkg]) {
					result[pkg] = deps[pkg].pkgMeta.version;
				}
			});

			return result;
		});
	},

	installPackage: function(name, version) {
		var pkgSpec = version ? name+'#'+version : name;
		console.log('installing %s', pkgSpec);
		return executeCommand(nodeBinPath+'/bower', ['install', pkgSpec]);
	}
};


const noonian = {
	/*
	  Backward compatible with BusinessObjectPackage.major_version and minor_version fields
	*/
	getPkgVersion: function(bop) {
		var v = bop.version || ((bop.major_version||'0')+'.'+(bop.minor_version||'0')+'.0');
		return new semver(semver.coerce(v));
	},

	getInstalledVersions: function(pkgKeys) {
		const query = {};
		if(pkgKeys && pkgKeys.length) {
			query.key = {$in:pkgKeys};
		}

		return db.BusinessObjectPackage.find(query,{key:1,version:1,major_version:1,minor_version:1}).then(bopList => {
			const result = {};

			_.forEach(bopList, bop => {
				result[bop.key] = this.getPkgVersion(bop).toString();
			});

			return result;
		});
	},

	/*
	  Go through RemotePackageRepositories, query for 
	*/
	getMetaData: function(pkgKeys) {
		console.log('getMetaData for %j', pkgKeys);
		if(!pkgKeys || (pkgKeys instanceof Array && !pkgKeys.length) || !Object.keys(pkgKeys).length) {
			return Q({});
		}


		//Inner function that makes the http call to a remote repo, asking for 
		const callRemoteRepo = function(rpr) {
			const deferred = Q.defer();

			if(!rpr || !rpr.url || !rpr.auth || !rpr.auth.token) {
				deferred.reject('Bad RemotePackageRepository entry');
			}

			const keyList = encodeURIComponent(JSON.stringify(pkgKeys));
			const fullUrl = `${rpr.url}/ws/package_repo/getMetaData?keys=${keyList}`;
			
			request(
				{
					method:'GET',
					uri:fullUrl,
					auth:{bearer:rpr.auth.token},
					json:true
				},
				function(err, httpResponse, body) {
					if(err || body.error) {
						// console.error(err || body.error);
						return deferred.reject(err || body.error);
					}

					deferred.resolve({
						repo:rpr,
						metadata:body  // pkgkey->metadata obj
					});
				}
			);

			return deferred.promise;
		};

		
		return db.RemotePackageRepository.find({}).then(rprList=>{
			const promiseList = [];
			_.forEach(rprList, rpr=>{
				promiseList.push(callRemoteRepo(rpr));
			});

			return Q.allSettled(promiseList).then(function(promises) {
				var result = [];
				_.forEach(promises, p=>{
					if(p.state === 'fulfilled') {
						result.push(p.value);
					}
				});
				return result;
			})
			;
		});
	},

	/**
	* call RemotePackageRepository to get specified pacakge/version
	*  @return readablestream of json from server 
	*/
	getPackage:function(key, version, repo) {

		const fullUrl = `${repo.url}/ws/package_repo/getPackage?key=${key}&version=${version.toString()}`;
		var requestParams = {
            uri:fullUrl,
            auth:{bearer:repo.auth.token},
            rejectUnauthorized: false
        };
        
        return request.get(requestParams);
	}
};

module.exports = {npm, bower, noonian};