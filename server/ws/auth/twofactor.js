var _ = require('lodash');
var Q = require('q');
var moment = require('moment');


var db = require('../../api/datasource');
var invokerTool = require('../../tools/invoker');

var conditionChecker = db._svc.QueryOpService.satisfiesCondition;


/**
 * Constructor for our two-factor auth utility
 * initialized using config item under sys.two_factor_auth
 */
var TFA = function(tfaConfig) {
    
    var THIS = this;
    
    THIS.config = tfaConfig;
    THIS.codelength = tfaConfig.codelength || 5;
    
    
    var condition = THIS.config.condition;
    
    if((typeof condition) === 'boolean') {
        THIS.conditionChecker = function() {return condition};
    }
    
    if((typeof condition) === 'string') {
        //single role name
        condition = [condition];
    }
    
    if(condition instanceof Array) {
        //it's an array of role names        
        THIS.conditionChecker = function(user) {
            var hasRequiredRole = false;
            _.forEach(user.roles, function(r) {
                if(condition.indexOf(THIS.roleMap[r._id]) > -1) {
                    hasRequiredRole = true;
                } 
            });
            return hasRequiredRole;
        };
    }
    else if((typeof condition) === 'object') {
        //It's a query condition object
        THIS.conditionChecker = function(user) {
            return db._svc.QueryOpService.satisfiesCondition(user, condition);
        };
    }
    
    
    this.$initPromise = 
    Q.all([
        db.TwoFactorAuthImplementation.findOne({name:tfaConfig.implementation}).exec(),
        db.Role.find({}).exec()
    ])
    .then(function(resultArr) {
        
        var impl = THIS.implementation = resultArr[0];
        var roles = resultArr[1];
        
        if(!impl) {
            throw new Error('bad implementation specified in configuration');
        }
        
        if(!tfaConfig.userToPhone) {
            throw new Error('bad userToPhone specified in configuration');
        }
        
        THIS.roleMap = {}; //id-> role name
        _.forEach(roles, function(r) {
            THIS.roleMap[r._id] = r.name;
        });
        
    });
};

/**
 * @private function to generate random code that is texted to user
 */
var generateNewCode = function(numDigits) {
    return Math.floor(Math.random() * (Math.pow(10, (numDigits - 1)) * 9)) + Math.pow(10, (numDigits - 1));
};

/**
 * @private function to map user to phone number, given phoneMapping object from config
 */
var getPhoneForUser = function(theUser, phoneMapping) {
    var deferred = Q.defer();
    
    if(typeof phoneMapping === 'string') {
        //phoneMapping is a string -> phone is a field on the User itself
        deferred.resolve(theUser[phoneMapping]);
    }
    else {
        //phoneMapping is object -> phone is a field somewhere else
        // refClass.refField points to this user, and refClass.phoneField has the phone.
        var refClass = phoneMapping.refClass;
        var refField = phoneMapping.refField;
        var phoneField = phoneMapping.phoneField;
                
        var queryObj = {};
        queryObj[refField] = theUser._id;
        
        var lookupPromise = db[refClass].find(queryObj).then(function(result) {
            for(var i=0; i < result.length; i++) {
                var phone = _.get(result[i], phoneField);
                if(phone) {
                    return phone;
                }
            }
            return false;
        });
        
        deferred.resolve(lookupPromise);
    }
    
    
    return deferred.promise;
};


/**
 * Check user to determine if 2nd factor auth is required, based on 2 conditions:
 * 1) tfaConfig.condition
 * 2) how recent a prior 2nd factor auth occurred from specified IP address
 * 
 * @return promise fulfilled when check is complete
 */
TFA.prototype.requires2fa = function(user, ip) {
    var THIS = this;
    return this.$initPromise.then(function() {
        
        //First step: look for recently validated 2FA
        if(THIS.config.refresh_period) {
            return db.TwoFactorAuthLoginRequest.find({user:user._id, ip:ip, validated:true}).sort({created_date:'asc'}).exec();
        }
        else {
            //no refresh_period -> recent validations don't matter
            return [];
        }
    })
    .then(function(pastRequests) {
        //If they've already verified w/in last refresh_period hours, 2fa isn't required.
        if(THIS.config.refresh_period && pastRequests.length) {
            var refreshPeriodHours = THIS.config.refresh_period;
            var lastValidation = moment(pastRequests[0].modified_date);
            var now = moment();
            
            //if lastValidation + refreshPeriod is in the future, then no need to re-validate
            lastValidation.add(refreshPeriodHours, 'hours');
            if(lastValidation.isAfter(now)) {
                return false;
            }
        }
        
        return THIS.conditionChecker(user);
    })
    ;
};


/**
 * Initiate 2nd factor auth for specified user; grab 
 */
TFA.prototype.initiate2fa = function(user, ip) {
    var THIS = this;
    return this.$initPromise.then(function() {
        
        var newReq = new db.TwoFactorAuthLoginRequest({
           user:{_id:user._id},
           ip:ip,
           validated:false,
           code:generateNewCode(THIS.codelength)
        });
        
        return newReq.save();
    })
    .then(function(newReq) {
        
        //Next, find the destination phone number
        return getPhoneForUser(user, THIS.config.userToPhone).then(function(destPhone) {
            if(!destPhone) {
                throw new Error('Couldnt find phone number for user '+user.name);
            }
            
            //Now send the actual code
            var impl = invokerTool.invokeInjected(
                THIS.implementation.factory_fn, 
                {tfaConfig:THIS.config, console:console}, 
                THIS.implementation
            );
            
            if((typeof impl.sendCode) === 'function') {
                //console.log('calling impl.sendCode %j', newReq);
                var sent = impl.sendCode(destPhone, newReq.code);
                //console.log('sent %j', sent);
                
                return sent;
            }
            else {
                throw new Error('invalid TwoFactorAuthImplementation: missing sendCode');
            }
        });
    })
    ;
};

/**
 * Validate a provided code
 */
TFA.prototype.validate2fa = function(user, ip, code) {
    var THIS = this;
    return this.$initPromise.then(function() {
        return db.TwoFactorAuthLoginRequest.findOne({user:user._id, ip:ip, validated:false, code:code}).sort({created_date:'asc'}).exec();
    })
    .then(function(authReq) {
        if(authReq) {
            var ts = moment(authReq.modified_date);
            var now = moment();
            ts.add(30, 'minutes');
            if(ts.isAfter(now)) {
                //Still in valid window
                authReq.validated = true;
                return authReq.save().then(function() {
                    return {success:true};
                });
            }
            else {
                return authReq.remove().then(function() {
                    return { error: 'Expired code' };
                });
            }
        }
        else {
            return { error:'Invalid code' };
        }
    });
    
    
};



module.exports = TFA;
