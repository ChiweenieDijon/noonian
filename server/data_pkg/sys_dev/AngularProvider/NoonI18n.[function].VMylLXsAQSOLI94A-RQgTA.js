function (NoonWebService, $q) {
    
    var lgCache = {};

    var callAndStub = function(ws, params) {
        var deferred = $q.defer();
        var stub = {$promise:deferred.promise};
        
        NoonWebService.call(ws, params).then(
            function(resp) {
                var result = resp.result;
                for(var k in result) {
  					stub[k] = result[k];
  				}
  				//'fake' an array if needed
  				if(result instanceof Array) {
  				    stub.length = result.length;
  				}
  				deferred.resolve(stub);
            },
            
            function(err) {
                deferred.reject(err);
            }
        );
        
        return stub;
    };
    

	return {
	    getLabelGroup: function(key) {
	        if(!lgCache[key]) {
	            var stub = callAndStub('/sys/i18n/getLabelGroup', {key:key});
	            lgCache[key] = stub;
	            return stub;
            }
            else {
              return lgCache[key];
            }
            
        },
        
        getBoLabelGroup: function(className) {
            if(!lgCache[className]) {
	            var stub = callAndStub('/sys/i18n/getBoLabelGroup', {className:className});
	            lgCache[className] = stub;
	            return stub;
            }
            else {
              return lgCache[className];
            }
          },
        
        getEnumerationValues: function(enumName) {
            var cacheKey = 'enum|'+enumName;
            if(!lgCache[cacheKey]) {
                var stub = callAndStub('/sys/i18n/getEnumerationValues', {name:enumName});
                lgCache[cacheKey] = stub;
                return stub;
            }
            else {
                return lgCache[cacheKey];
            }
        }
          
          
	};

}