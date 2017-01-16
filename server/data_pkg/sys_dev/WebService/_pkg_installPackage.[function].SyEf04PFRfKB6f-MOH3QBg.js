function (queryParams, db) {
    var bopId = queryParams.id;
    if(!bopId) {
        throw 'invalid package id';
    }
    
    return db._svc.PackagingService.applyPackage(bopId).then(function(result) {
        return {message:'applied package '+result};
    });
}