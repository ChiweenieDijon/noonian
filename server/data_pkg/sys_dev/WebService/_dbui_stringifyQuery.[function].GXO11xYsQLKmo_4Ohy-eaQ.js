function (req, queryParams, I18n, db, _) {
    var QueryOpService = db._svc.QueryOpService;
    
    var className = queryParams.className;
    var queryObj = JSON.parse(queryParams.queryObj);
    
    
    return I18n.getBoLabelGroup(className, req.user).then(function(fieldLabels) {
        if(fieldLabels._abbreviated) {
            _.assign(fieldLabels, fieldLabels._abbreviated);
        }
        
        var queryDesc = QueryOpService.stringifyQuery(queryObj, db[className]._bo_meta_data, fieldLabels);
        
        return queryDesc;
    });
}