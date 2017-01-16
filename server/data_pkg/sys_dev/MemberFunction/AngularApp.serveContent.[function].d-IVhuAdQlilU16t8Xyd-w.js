function (db, Q, _, config) {
    /**
     * AngularApp.serveContent
     * 
     */ 
    return function (outStream) {
        var appObj = this;
        var myPath = this.path;
        var moduleObj;
        
        var initialPromise;
        if(appObj.module) {
            initialPromise = db.AngularModule.findOne({_id:appObj.module._id}).exec();
        }
        else {
            initialPromise = Q(false);
        }
        
        return initialPromise.then(function(result) {
            if(result) {
                moduleObj = result;
                return moduleObj.getDependencyTags();
            }
            else {
                return {css:'',js:''};
            }
        })
        .then(function(moduleDepTags) {
            
            if(typeof outStream.type === 'function') {
                outStream.type('html');
            }
            
            var moduleName = moduleObj ? moduleObj.name : appObj._id;
            
            var header = '<!doctype html>';
            
            header += '<html ng-app="'+moduleName+'">';
            
            
            header += '<head>'
            header += '<base href="'+config.serverConf.urlBase+'/">';
            
            header += moduleDepTags.css; //Css dependencies of AngularModule's
            
            header += appObj.head+'\n';
            
            outStream.write(header);
            
            if(appObj.css_dependencies && appObj.css_dependencies.length) {
                _.forEach(appObj.css_dependencies, function(cssDep) {
                    outStream.write('<link rel="stylesheet" href="'+cssDep.path+'/'+cssDep.name+'">\n');
                });
            }
            
            outStream.write('</head>');
            
            outStream.write('<body>'+appObj.body+'\n'+moduleDepTags.js+'\n');
            
            if(appObj.js_dependencies && appObj.js_dependencies.length) {
                _.forEach(appObj.js_dependencies, function(jsDep) {
                    outStream.write('<script src="'+jsDep.path+'/'+jsDep.name+'"></script>\n');
                });
            }
            
            if(appObj.config_function) {
                outStream.write('<script type="text/javascript">\n');
                
                outStream.write('angular.module(');
                if(moduleObj) {
                    outStream.write('\''+moduleName+'\'');
                }
                else{
                    outStream.write('\''+moduleName+'\', []');
                }
                outStream.write(').config('+appObj.config_function+');\n');
                
                outStream.write('</script>');
            }
            
            outStream.write('</body></html>');
            
            return outStream.end();
            
        });
        
    }
}