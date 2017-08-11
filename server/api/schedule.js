/*
Copyright (C) 2017  Eugene Lockett  gene@noonian.org

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
/*
 * schedule.js
 * 
 */
var _ = require('lodash');
var Q = require('q');

var scheduler = require('node-schedule');

var db = require('./datasource');
var DataTriggerService = require('./datasource/datatrigger');
var invokerTool = require('../tools/invoker');

var scheduledJobs = {};

var executeScheduleTrigger = function() {
    if(this.running) {
        console.log('Skipping execution of ScheduleTrigger %s (still running from previous execution)', this._id);
    }
    this.running = true;
    
    var st = this;
    var fn = this.function;
    
    invokerTool.invokeAndReturnPromise(fn, {}, this).then(
        function() {
            delete st.running;
            st.last_execution = new Date();
            st.save({skipTriggers:true}, null);
        },
        function(err) {
            console.error('Error executing ScheduleTrigger %s: %s', st._id, err.stack);
            delete st.running;
        }
    );
};


var scheduleTrigger = function(st) {
    if(!st.function) {
        console.error('Skipping loading scheduleTrigger %s (invalid function)', st._id);
        return;
    }
    
    var s = st.schedule;
    var schedStr =  s.second+' '+
          s.minute+' '+
          s.hour+' '+
          s.day_of_month+' '+
          s.month+' '+
          s.day_of_week;
          
    scheduledJobs[st._id] = scheduler.scheduleJob(schedStr, executeScheduleTrigger.bind(st));
};

exports.init = function(conf) {
    
    DataTriggerService.registerDataTrigger('sys.internal.scheduler', 'UfkDq2TKQAm4OWijwTpokQ', 'after', true, true, true, 
        function(isCreate, isDelete) {
            if(isCreate) {
                if(this.enabled) {
                    scheduleTrigger(this);
                }
            }
            else {
                var running = scheduledJobs[this._id];
                running && running.cancel();
                if(isDelete) {
                    delete scheduledJobs[this._id];
                }
                else { //Update
                    if(this.enabled) {
                        scheduleTrigger(this);
                    }
                }
            }
        }
    );
    
    return db.ScheduleTrigger.find({enabled:true}).then(function(resultArr) {
        _.forEach(resultArr, function(st) {
            scheduleTrigger(st);
        });
    }); 
};
