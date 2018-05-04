
var _ = require('lodash');

/**
 * @param configArr array of objects {condition:'',redirect:''}
 */
module.exports = function(configArr) {
  
  var conditions = [];
  
  if(!(configArr instanceof Array)) {
    configArr = [configArr];
  }
  
  _.forEach(configArr, (cfg) => {
    conditions.push({
      redirect:cfg.redirect,
      template:_.template('<%= '+cfg.condition+' %>', {variable:'user'}),
      allow:new RegExp(cfg.allow)
    });
  });
  
  
  this.check = function(user) {
    var ret = false;
    
    _.forEach(conditions, (cond) => {
      if(ret) return;
      
      var testResult = cond.template(user);
      //console.log('%j -> %s', user, testResult);
      if(testResult !== 'false') {
        ret = cond;
      }
    });
    
    return ret;
  }
  
};
