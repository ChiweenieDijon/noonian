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
var db = require('../datasource');
var config = require('../config');
var QueryOpService = require('../datasource/query');


/**
 * Gets the User BusinessObject for the user currently logged in
 * @param req the request
 * @return promise that resolves to User BusinessObject if valid, and false otherwise. (never rejects)
 **/
var getCurrentUser =
exports.getCurrentUser = function(req) {
  var deferred = Q.defer();

  if(req.user && req.user._id) {

    db.User.findOne({_id:req.user._id}).then(
      function(user) {
        deferred.resolve(user);
      },
      function(err) {
        console.log(err);
        deferred.resolve(false);
      }
    );
  }
  else {
    deferred.resolve(false);
  }

  return deferred.promise;
};

var updateUserPassword =
exports.updateUserPassword = function(req, newPassword) {

  var deferred = Q.defer();

  getCurrentUser(req).then(function(userObj) {
    if(!userObj) {
      return deferred.reject('$invalid_user');
    }

    config.getParameter('sys.password_complexity', false).then(function(complexityDesc) {
      if(complexityDesc) {
        var checkerRegex = new RegExp(complexityDesc.regex);
        if(!checkerRegex.test(newPassword))
          return deferred.reject('$complexity_requirements');
      }

      userObj.password = newPassword;
      userObj.save().then(function() {
          deferred.resolve('success');
        },
        function(err) {
          deferred.reject('$save_error');
        }
      );

    });


  });

  return deferred.promise;

};

var getCurrentUserRoles =
exports.getCurrentUserRoles = function(req) {
  var deferred = Q.defer();

  getCurrentUser(req).then( function(userObj) {
    if(!userObj || !userObj.roles || userObj.roles.length == 0)
      deferred.resolve([]);
    var roleRefs = userObj.roles;
    var roleArr = [];
    for(var i=0; i < roleRefs.length; i++) {
      roleArr.push(roleRefs[i]._id);
    }
    deferred.resolve(roleArr);
  });

  return deferred.promise;
};


var checkRolesForUser =
exports.checkRolesForUser = function(user, rolespec, noShortCircuit) {
  //First, the no-restriction rolespec:
  if(!rolespec || !rolespec.length) {
    return true;
  }

  var userRoleList = user ? user.roles : [];

  //Compile user's roles into a nice neat hash table
  var userHasRole = {};
  for(var i=0; i < userRoleList.length; i++) {
    userHasRole[userRoleList[i]._id] = true;  
  }

  //Short circuit the special SYSADMIN role
  if(!noShortCircuit && userHasRole['FnQ_eBYITOSC8kJA4Zul5g'])
    return true;


  for(var i=0; i < rolespec.length; i++) {
    if(userHasRole[rolespec[i]])
      return true;
  }

  return false;
};

/**
 * Checks the roles for the logged-in user
 * @param req the request
 * @param rolespec role specification object to check against
 * @return promise that resolves to true if check passes, or rejected on failure
 **/
var checkRoles =
exports.checkRoles = function(req, rolespec) {
  var deferred = Q.defer();

  if(!rolespec) {
    //null rolespec means "no role restrictions" -> pass
    deferred.resolve(true);
  }
  else {
    getCurrentUser(req).then( function(userObj) {

      if(checkRolesForUser(userObj, rolespec))
        deferred.resolve(true);
      else
        deferred.reject('$role_check_failure');
    });
  }

  return deferred.promise;
};


/**
 * Gets a stripped-down type descriptor for the specified BO;
 *  result contains fields for which logged-in user has read access
 *  @todo this will be a way to not expose too much metadata to a non-admin DBUI user
 **/
exports.getRestrictedTypeDesc = function(req, Model) {

};



/**
 *  Pulls together DACs that apply to TargetBoModel and the current user's roles.
 *  @return {condition:{...}, fieldRestrictions:{...}}
 **/
var aggregateDacs =
exports.aggregateDacs = function(req, TargetBoModel, opField, frField ) {

  var deferred = Q.defer();

  getCurrentUserRoles(req).then(function(myRoles) {
    // console.log('my roles %j', myRoles);

    //SYSADMIN short-circuit
    if(myRoles.indexOf('FnQ_eBYITOSC8kJA4Zul5g') > -1)
      return deferred.resolve({}); //Resolve w/ no restrictions/conditions


    var dacQuery = {
      $and:[
        {},
        {'business_object._id':TargetBoModel._bo_meta_data.bod_id},
        {'rolespec':{$satisfiedBy:myRoles}}
      ]
    };
    dacQuery.$and[0][opField]=true; //allow_[read|create|update|delete] = true

    db.DataAccessControl.find(dacQuery).then(function(dacQueryResult) {
      // console.log('dacQueryResult %j', dacQueryResult);
      if(dacQueryResult.length == 0)
        return deferred.reject('$role_check_failure');

      var compositeCond = [];
      var compositeFieldRestriction = null;

      for(var i=0; i < dacQueryResult.length; i++) {
        var dac = dacQueryResult[i];
        if(dac.condition) {
          compositeCond.push(dac.condition); //TODO process condition to substitute CURRENT_USER fields!!!
        }
        if(dac.field_restrictions && frField) {
          if(!compositeFieldRestriction)
            compositeFieldRestriction = dac.field_restrictions;
          else {
            for(var f in compositeFieldRestriction) {
              if(!dac.field_restrictions[f] || dac.field_restrictions[f][frField] == true) {
                compositeFieldRestriction[f][frField] = true;
              }
            }
          }
        }
      }
      //We've pulled together the conditions, and aggregated the field restrictions
      var result = {};
      if(compositeCond.length == 1)
        result.condition = compositeCond[0];
      else if(compositeCond.length > 1)
        result.condition = {$or:compositeCond};

      if(compositeFieldRestriction) {
        result.fieldRestrictions = {};
        for(var f in compositeFieldRestriction) {
          if(!compositeFieldRestriction[f][frField])
            result.fieldRestrictions[f] = 0;
        }
      }

      deferred.resolve(result);
    })
  });

  return deferred.promise;
};

exports.aggregateReadDacs = function(req, TargetBoModel) {
  return aggregateDacs(req, TargetBoModel, 'allow_read', 'read');
};
exports.aggregateUpdateDacs = function(req, TargetBoModel) {
  return aggregateDacs(req, TargetBoModel, 'allow_update', 'write');
};
exports.aggregateCreateDacs = function(req, TargetBoModel) {
  return aggregateDacs(req, TargetBoModel, 'allow_create', 'write');
};
exports.aggregateDeleteDacs = function(req, TargetBoModel) {
  return aggregateDacs(req, TargetBoModel, 'allow_delete', false);
};

/**
 * checkCondition checks a query condition against an object and returns boolean indicating satisfaction
**/
var checkCondition =
exports.checkCondition = function(condObj, targetObj) {
  // console.log("checking insert condition %j for %j", condObj, targetObj);
  if(condObj)
    return QueryOpService.satisfiesCondition(targetObj, condObj);
  else
    return true;
};


/**
 * utility function to clean up projection so it doesn't have a mixture of inclusion/exclusion
**/
var cleanupProjection = function(projectionObj) {
  if(!projectionObj)
    return;

  var anyInclusion = false;
  var exclusionFields = [];

  for(var fieldName in projectionObj) {
    if(projectionObj[fieldName] === 0) {
      exclusionFields.push(fieldName);
    }
    else {
      anyInclusion = true;
    }
  }
  //If there's any inclusion fields, then all others are excluded by default
  if(anyInclusion) {
    for(var i=0; i < exclusionFields.length; i++) {
      delete projectionObj[exclusionFields[i]];
    }
  }
}

/**
 * Returns a promise that either
 * a) Resolves to a query that has been massaged to restrict access based on applicable DACs, or
 * b) Rejects when DACs don't allow read access to the requested TargetBoModel
 **/
var checkReadDacs =
exports.checkReadDacs = function(req, TargetBoModel, query) {
  var deferred = Q.defer();
  console.log('checkReadDacs %s, %j', TargetBoModel._bo_meta_data.class_name, query);

  aggregateDacs(req, TargetBoModel, 'allow_read', 'read').then(
    function(dacObj){
      var dacCond = dacObj.condition;
      var dacProj = dacObj.fieldRestrictions;

      query = _.clone(query);

      //Incorporate DAC restrictions into the requested query
      var conditionObj = query.where;

      if(dacCond) {
        if(conditionObj)
          query.where = {$and:[query.where, dacCond]};
        else
          query.where = dacCond;
      }

      //Incorporate field restrictions into the projection
      if(dacProj) {
        if(query.select)
          _.assign(query.select, dacProj);
        else
          query.select=dacProj;
      }

      cleanupProjection(query.select);

      deferred.resolve(query);
    },

    function(err) {
      deferred.reject(err);
    }
  );


  return deferred.promise;
}
