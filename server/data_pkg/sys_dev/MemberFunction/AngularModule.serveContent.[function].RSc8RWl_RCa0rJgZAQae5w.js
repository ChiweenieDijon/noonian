function (db, _, Q) {
    
    return function(outStream) {
        console.log('AngularModule.serveContent(...)');
        
        var moduleObj = this;
        var moduleId = this._id;
        // var qry = {'module._id':moduleId};
        
        // return Q.all([
        //     db.AngularDirective.find(qry).exec(),
        //     db.AngularProvider.find(qry).exec()
        // ])
        return db.AngularProvider.find({'module._id':moduleId})
        .then(function(providers) {
            
            console.log('  providers count: %s', providers.length);
            
            if(typeof outStream.type === 'function') {
                outStream.type('application/javascript');
            }
            
            
            //A tiny bit of code-generation for module dependency list:
            var depArr = '';
            var comma = '';
            if(moduleObj.external_mod_dependencies && moduleObj.external_mod_dependencies.length) {
                depArr = '\''+moduleObj.external_mod_dependencies.join('\',\'')+'\'';
                comma = ',';
            }
            
            if(moduleObj.mod_dependencies && moduleObj.mod_dependencies.length) {
                _.forEach(moduleObj.mod_dependencies, function(dep) {
                    depArr += comma+'\''+dep.name+'\'';
                    comma = ',';
                })
            }
            
            //A little more code-generation...
            
            outStream.write(
                "'use strict';\n"+
                "angular.module('"+moduleObj.name+"', ["+depArr+"])\n"
            );
            
            if(moduleObj.config_function) {
                outStream.write(
                    '.config('+moduleObj.config_function+')\n'
                );
            }
            
            _.forEach(providers, function(providerObj) { 
                //Build up the proper call to the angular module api: 
                // e.g. .factory('factory_name', ['param1', 'param2', function(...) {}] )
                
                var curr = '.'+providerObj.type+'(\''+providerObj.name+'\', ';
                var suffix = ')\n\n';
                if(providerObj.parameters && providerObj.parameters.length) {
                    curr += '[\''+providerObj.parameters.join('\',\'')+'\',';
                    suffix = ']'+suffix;
                }
                curr += providerObj.function + suffix;
                
                outStream.write(curr);
            });
            
            return outStream.end();
            
            // res.type('application/javascript');
            // return res.send(toSend);    
        });
        
        
    }
}