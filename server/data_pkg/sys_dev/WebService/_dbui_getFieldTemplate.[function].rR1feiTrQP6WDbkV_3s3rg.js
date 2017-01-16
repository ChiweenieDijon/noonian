function (queryParams, res, db, _) {
    //Build response that maps type name to an 'info' object, providing what client-side needs in order to build a UI form for a specified business object.
    
    var fieldtypeName = queryParams.type;
    var isArray = queryParams.array === 'true';
    var viewEdit = queryParams.view_or_edit;
    
    console.log('getFieldTemplate for %s %s %s', viewEdit, fieldtypeName, (isArray ? '[ ]' : ''));
    
    if(!fieldtypeName) {
        throw new Error('Invalid field type name: '+fieldtypeName);
    }
    
    var applicKey = (viewEdit === 'view') ? 'for_viewing' : 'for_editing';
    
    if(isArray) {
        applicKey += '_array';
    }
    
    var queryObj = {
        'fieldtypes.name':fieldtypeName
    };
    queryObj[applicKey] = true;
    

    
    // console.log('queryObj %j', queryObj);
    return db.FieldTypeUiSpec.find(queryObj).then(function(uiSpecs) {
        
        if(uiSpecs.length > 1) {
            console.warn('Too many FieldTypeUiSpecs for %s %s %s', viewEdit, fieldtypeName, (isArray ? '[ ]' : ''))
        }
        if(uiSpecs.length === 0) {
            //look 'universally-applicable' editors/viewers:    
            delete queryObj['fieldtypes.name'];
            queryObj.fieldtypes = {$empty:true};
            
            return db.FieldTypeUiSpec.find(queryObj).then(function(universalSpecs) {
               if(!universalSpecs || !universalSpecs.length) {
                   throw new Error('No FieldTypeUiSpecs found for '+viewEdit+' '+fieldtypeName+' '+isArray);
               }
               res.type('html');
               return universalSpecs[0].template;
            });
        }
        
        res.type('html');
        return uiSpecs[0].template;
        
    });
    
}