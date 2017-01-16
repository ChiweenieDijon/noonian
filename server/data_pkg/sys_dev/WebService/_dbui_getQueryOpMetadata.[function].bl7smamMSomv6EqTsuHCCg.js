function (queryParams, req, res, db, I18n, _) {
    
    var queryopLabels;
    
    return I18n.getLabelGroup('sys.query_operations', req.user).then(function(labelGroup) {
        queryopLabels = labelGroup;
        
        return db.QueryOpUiSpec.find({});    
    })
    .then(function(uiSpecs) {
        
        //Restructure the list for easier consumption client-side
        var resultList = [];
        _.forEach(uiSpecs, function(specObj) {
            
            var typeNames = [];
            var editorSpecs = [];
            
            //First, pull together type names
            var typeNameSuffix = specObj.for_array ? '[]' : '';
            
            if(!specObj.fieldtypes || !specObj.fieldtypes.length) {
                typeNames.push('*'+typeNameSuffix);
            }
            else {
                _.forEach(specObj.fieldtypes, function(ftRef) {   
                    typeNames.push(ftRef.name+typeNameSuffix);
                });
            }
            
            //Next, construct list of queryop spec objects.  These describe the available queryop's for the above fieldtypes
            _.forEach(specObj.editors, function(editorSpec) {
                var opName = Object.keys(editorSpec)[0];
                editorSpecs.push({
                    op:opName,
                    label:queryopLabels[opName.substring(1)],
                    editor:editorSpec[opName]
                });
            });
            
            //Finally, build result mapping: typename -> op info list 
            resultList.push({
               types:typeNames,
               queryops:editorSpecs
            });
            
        }); //End uiSpecs iteration
        
       return resultList; 
    });
    
}