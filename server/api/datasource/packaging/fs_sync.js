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
 * datasource/packaging/fs_sync
 * @module db._svc.PackagingService
 * 
 * Contains logic for syncing data with filesystem for "collaborative" packages. 
 * 
 */

var Q = require('q');
var _ = require('lodash');
var fs = require('fs');
var stringify = require('json-stable-stringify');
 

var serverConf = require('../../../conf');

var db = require('../index');
var PkgService = require('./index');
var FieldTypeService = require('../fieldtypes.js');




//Filename format for fs-persisted business objects:
//<obj display str>.[<fieldName>].<extension>
var fileRegex = /^(?:.+)\.\[([^\.]+)?\]\.(.{22})\.(\w+)$/; 


//Helper for simple directory create
var mkdir = function(dir) {
	try {fs.mkdirSync(dir);} catch(err) {}
};


// Helper to generate a sanitized filename for a business object
var badCharsRegex = /\/|\||\\/g;
var generateFileName = function(bo) {
    var str = bo._disp;
    if(!str) {
        return bo._id;
    }
    return str.replace(badCharsRegex, '_');
};


////////////////////////////////////////////////////////////////////////
// SYNC OPERATIONS             /////////////////////////////////////////
////////////////////////////////////////////////////////////////////////


//Lil function to write a value to a stream, unmodified.
var identityFn = function(stream, value) { return stream.write(''+value); };

/**
 * Export (and explode) a single business object to the file system
 */
var writeObjectToPackageDir = 
exports.writeObjectToPackageDir = function(fsPath, bo) {
	var className = bo._bo_meta_data.class_name;
	var classDir = fsPath+'/'+className;
	mkdir(classDir);
	
	var targetPath = classDir+'/'+generateFileName(bo);
	
	var tdMap = bo._bo_meta_data.type_desc_map;
	
	var toBaseFile = {_id:bo._id, __ver:bo.__ver};
	
	//First, find the fields that should be put in separate files
	_.forEach(tdMap, function(td, fieldName) {
		if(fieldName === '_disp') return;
		
		var fth = FieldTypeService.getFieldTypeHandler(td);
		if(fth && fth.toFileSystem && bo[fieldName]) {
			var spec = fth.toFileSystem(td);
			var filePath = targetPath+'.['+fieldName+'].'+bo._id+'.'+spec.extension;
			console.log('...writing %s', filePath);
			var ws = fs.createWriteStream(filePath);
			var writeFn = spec.writeFn || identityFn;
			writeFn(ws, bo[fieldName]);
			ws.end();
		}
		else {
			toBaseFile[fieldName] = bo[fieldName];
		}
	});
	
	//Finish up by writing the base file
	var filePath = targetPath+'.[].'+bo._id+'.json';
	console.log('...writing %s', filePath);
	var ws = fs.createWriteStream(filePath);
	ws.end(stringify(toBaseFile, {space:'\t'}));
};


/**
 * Remove an object from filesystem
 */
exports.removeObjectFromPackageDir = function(fsPath, bo) {
	try {
		var className = bo._bo_meta_data.class_name;
		var classDir = fsPath+'/'+className;
		var objFiles = fs.readdirSync(classDir);
		_.forEach(objFiles, function(fileName) {
			if(fileName.indexOf('].'+bo._id+'.') > 0) {
				console.log('deleting %s/%s', classDir, fileName);
				fs.unlink(classDir+'/'+fileName);
			}
		});
	}
	catch(err) {
		console.error('problem deleting object %s from package %s', bo._id, pkgKey);
		console.error(err);
	}
};



////////////////////////////////////////////////////////////////////////
// IMPORTING             ///////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////


/**
 * Load a filesystem-exploded package into the system.
 * Called on every start-up when packageDev is configured for a given package
 * @param srcDir directory containing pkg_meta.json and a directory for each class
 * 
 * @return promise fulfilled when import of srcDir is complete
 */
exports.packageFromFs = function(srcDir) {
    console.log('Loading package from %s...', srcDir);
    
    //sync pkg_meta.json (export of a BusinessObjectPackage object) in base of pkg directory
	var bopFile = srcDir+'/pkg_meta.json';
    
    var bopObj;
    
    try {
        bopObj = JSON.parse(fs.readFileSync(bopFile));
    }
    catch(err) {
        console.log('Configured to sync from %s, but pkg_meta.json not found or invalid.', srcDir);
        return Q(true);  
    }
    
    
    return PkgService.importObject('BusinessObjectPackage', bopObj, false).then(function() {
        
        var promiseChain = Q(true);
        
		var classDirs = fs.readdirSync(srcDir);
		
        //Bump up BusinessObjectDef to be processed first:
		var bodIndex = classDirs.indexOf('BusinessObjectDef');
		if(bodIndex > -1) {
			classDirs[bodIndex] = classDirs[0];
			classDirs[0] = 'BusinessObjectDef';
		}
		
		_.forEach(classDirs, function(className) {
			promiseChain = promiseChain.then(importClassDir.bind(null, srcDir, className));
		});
		
		return promiseChain;
	});
	
	
};


/**
 * @private
 * Imports objects from the specified source directory.
 */
function importClassDir(srcDir, className) {
	var promiseChain = Q(true);
    		
	var objDir = srcDir+'/'+className;
	var dirStat = fs.statSync(objDir);
	if(dirStat.isDirectory()) {
		console.log(' Loading objects from %s', className);
		
		//Need to reconstruct the object potentially from multiple files.
		//...construct index of id->fileinfo
		var nameMap = {};
		var objFiles = fs.readdirSync(objDir);
		_.forEach(objFiles, function(fileName) {
			var filePath = objDir+'/'+fileName;
			var match = fileRegex.exec(fileName); 
			if(match && match.length >= 4) {
                ///^(?:.+)\.\[([^\.]+)?\]\.(.{22})\.(\w+)$/
				var fieldName = match[1];
                var objId = match[2];
				var ext = match[3];
				if(!nameMap[objId]) {
					nameMap[objId] = {};
				}
				if(fieldName) {
					nameMap[objId][fieldName] = filePath;
				}
				else {
					nameMap[objId]._ = filePath;
				}
			}
		});
        
		var jsonObjects = [];
		
		//Now use the info from idMap to reconstruct the objects
		_.forEach(nameMap, function(fileMap) {
            try {
                var obj = JSON.parse(fs.readFileSync(fileMap._));
                _.forEach(fileMap, function(fileName, field) {
                    if(field !== '_') {
                        obj[field] = fs.readFileSync(fileName, 'utf8');
                    }
                });
                jsonObjects.push(obj);
            }
            catch(e) {
                console.error('ERROR LOADING %s OBJECT FROM FILE %s', className, fileMap._);
                console.error(e);
            }
		});
        
        //If we're dealing with BusinessObjectDef's, make sure abstract super-classes go first
        if(className === 'BusinessObjectDef') {
            jsonObjects.sort(function(x,y) {
              if(!y.abstract === !x.abstract) return 0;
              else if(y.abstract && !x.abstract) return 1;
              else return -1;
            });
        }
        
        //Import the list
        _.forEach(jsonObjects, function(obj) {
            promiseChain = promiseChain.then(PkgService.importObject.bind(null, className, obj, false));
        });
        
	}
	return promiseChain;
};



////////////////////////////////////////////////////////////////////////
// EXPORTING ///////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////

var writeMetaFile = 
exports.writeMetaFile = function(targetDir, bop) {
    fs.createWriteStream(targetDir+'/'+'pkg_meta.json')
        .end(stringify(bop, {space:'\t'}));
};

/**
  * Explode a BOP to the filesystem -
  * A utility to take a distributable, non-collaborative package and make it collaborative.
  * 
  * Exports objects in the manifest, and places BusinessObjectPackage 
  * export itself in the base as pkg_meta.json
  * 
  * Places files into server/data_pkg/<key> directory, which can subesquently be moved 
  * to a separate directory and its own git repo.
  * 
 */
exports.packageObjectsToFs = function(bop, targetDir) {
  
  mkdir(targetDir);
  console.log('Writing package to %s', targetDir);
  
  var promiseArr = [];
  
  if(bop.manifest) {
    //First, dump the bop itself to the pkg_meta.json in the base
    writeMetaFile(targetDir, bop);
  
    //Dump the objects listed manifest to filesystem    
    _.forEach(bop.manifest, function(idVerMap, className){
      
      //for each object in the manifest...
      _.forEach(idVerMap, function(ver, objId) {
        
        promiseArr.push(
          db[className].findOne({_id:objId}).then(function(obj) {
              //Temporary force version id:
              obj.__ver = ver;
            writeObjectToPackageDir(targetDir, obj);
          })
        );

      });
    });
  }
  else {
	console.log('empty package synced to %s (no manifest for %s!)', targetDir, bop.key);
  }
  

  return Q.all(promiseArr);
};




