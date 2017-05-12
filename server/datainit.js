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
* server/datainit.js
*   Process data layer init without starting the server.  usage:
*   node server/datainit.js --instance <instance name>
**/
var Q = require('q');
var _ = require('lodash');

var fs = require('fs');
var express = require('express');

var conf = require('./conf');

//Read commandline args
var commandline = {};

var args = process.argv;
if(args.length > 1) {
  for(var i=0; i < args.length; i++) {
    if(args[i].indexOf('--') === 0) {
      commandline[args[i].substring(2)] = args[i+1];
    }
    else if(args[i].indexOf('-') === 0) {
      commandline[args[i].substring(1)] = true;
    }
  }
  console.log(commandline);
}

conf.init(commandline);


//Initialize server components:
var db = require('./api/datasource');
db.init(conf)
  .then(
    function() {
        console.log('Data layer init complete.');
        var promise = Q(true);
        if(commandline.repair) {
            console.log('...ref repair requested...');
            var refSvc = db._svc.RefService;
            promise = refSvc.repair();
        }
        
        if(commandline.fixdisp) {
            

            promise = promise.then(function() {
                console.log('...fix disp requsted...');
                var saveBo = function(bo) {
                    return bo.save({useVersionId:bo.__ver, skipTriggers:true}, null);
                };
                
                return db.BusinessObjectDef.find({'definition._disp':{$exists:true}}).lean().then(function(bodList) {
                    
                    var promiseList = [];
                    
                    _.forEach(bodList, function(bod) {
                        console.log('FIXING __disp on %s', bod.class_name);
                        
                        var deferred = Q.defer();   //fulfilled when all objects of this class are saved.
                        var promiseChain = Q(true); //chains save() calls so that they are sequential
                        
                        var objStream = db[bod.class_name].find({}).stream();
                        objStream.on('data', function(bo) {
                            
                            bo.__disp = bo._disp;
                            promiseChain = promiseChain.then(saveBo.bind(null, bo));                            
                            
                        }).on('error', function (err) {
                          console.error('error during processing fixdisp on BOD %s - %s', bod.class_name, err);
                          deferred.reject(err);
                        }).on('close', function () {
                          promiseChain.then(function() {
                            console.log('Finished processing %s', bod.class_name);
                            deferred.resolve(true);
                          })
                        });;
                        
                        promiseList.push(deferred.promise);
                    });
                    
                    return Q.allSettled(promiseList);
                });
            });
        }
        
        return promise;
        
    },
    function(err){
        console.error("ERROR INITIALIZING DATASOURCE: %s", err); 
        if(err.stack) {
            console.error(err.stack); 
        }
        process.exit(1);
    }
  )
  .then(
      function() {
          console.log('Completed. Have a nice day.');
          process.exit(0);
      },
      function(err) {
        console.error("ERROR: %s", err); 
        if(err.stack) {
            console.error(err.stack); 
        }
        process.exit(1);
      }
  )
  ;




