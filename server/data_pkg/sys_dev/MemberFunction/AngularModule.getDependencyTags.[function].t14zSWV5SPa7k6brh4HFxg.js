function (db, Q, _) {

    
    return function() {
        var deferred = Q.defer();
        
        var moduleObj = this;
        
        
        var myTag = '<script src="'+this.path+'/'+this.name+'"></script>\n';
        
        var jsDepTags = '';
        var cssDepTags = '';
        
        //Start with my own JS dependencies:
       if(moduleObj.js_dependencies && moduleObj.js_dependencies.length) {
            _.forEach(moduleObj.js_dependencies, function(dep) {
                // var depPath = PathTool.computeRelativePath(dep.path, relativeToPath);
                jsDepTags += '<script src="'+dep.path+'/'+dep.name+'"></script>\n';
            });
        }
        
        //... and my own CSS dependencies:
        if(moduleObj.css_dependencies && moduleObj.css_dependencies.length) {
            _.forEach(moduleObj.css_dependencies, function(dep) {
                // var depPath = PathTool.computeRelativePath(dep.path, relativeToPath);
                cssDepTags += '<link rel="stylesheet" href="'+dep.path+'/'+dep.name+'"></link>\n';
            });
        }
        
        //Now, recursively gather dependencies of the AngularModules on which I depend:
        if(moduleObj.mod_dependencies && moduleObj.mod_dependencies.length) {
            //Put id's in a list, retaining ordering of mod_dependencies field
            var idList = [];
            _.forEach(moduleObj.mod_dependencies, function(modRef) {
                idList.push(modRef._id);
            });
            
            db.AngularModule.find({_id:{$in:idList}}).then(function(depList) {
                var depMap = {};
               _.forEach(depList, function(dep) {
                   depMap[dep._id] = dep;
               });
               
               //Recursive call to grab tags for AngularModuleDependencies, in proper order
               var promiseList = [];
               _.forEach(idList, function(depId) {
                   promiseList.push(depMap[depId].getDependencyTags());
               });
               
               Q.all(promiseList).then(function(recursiveCallResultArr) {
                   //recursiveCallResultArr contains dependency subtrees' tags...
                   
                   var jsTagList = [];
                   var cssTagList = [];
                   
                   //First, pull in the tags for my dependencies
                   _.forEach(recursiveCallResultArr, function(depTag) {
                        if(depTag && depTag.js) {
                            jsTagList.push(depTag.js); 
                        }
                        if(depTag && depTag.css) {
                            cssTagList.push(depTag.css);
                        }
                   });
                   
                   if(jsDepTags) {
                       jsTagList.push(jsDepTags);
                   }
                   if(cssDepTags) {
                       cssTagList.push(cssDepTags);
                   }
                   
                   //Finally, my own AngularModule script
                   jsTagList.push(myTag);
                   
                   deferred.resolve({js:jsTagList.join('\n'), css:cssTagList.join('\n')});
                   
               });
               
                
            });
        }
        else {
            //No module dependencies
            deferred.resolve({js:jsDepTags+myTag, css:cssDepTags});
        }
        
        return deferred.promise;
    }
}