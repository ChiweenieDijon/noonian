function (value, typeDesc) {
    if(typeDesc.hash) {
        var bcrypt = require('bcrypt');
        value = value || {};
        value.matches = function(toCheck) {
          return bcrypt.compareSync(toCheck, this.hash);  
        };
    }
    return value;
}