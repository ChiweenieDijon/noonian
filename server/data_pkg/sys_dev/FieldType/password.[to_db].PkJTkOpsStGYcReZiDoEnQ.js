function (value, typeDesc) {
	if(typeDesc.hash) {
	    var bcrypt = require('bcrypt');
		//If we're supposed to store a hash, but a string was set for this field...
		if(typeof value === 'string') {
			//...then change it into a hash
			var salt = bcrypt.genSaltSync();
			var hash = bcrypt.hashSync(value, salt);
			return {
			    hash:hash
            };
		}
	}

	return value;
}