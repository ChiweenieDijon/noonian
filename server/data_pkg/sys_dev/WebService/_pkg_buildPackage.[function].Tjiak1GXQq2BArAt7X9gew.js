function (queryParams, db) {
    var bopId = queryParams.id;
    if(!bopId) {
        throw 'invalid package id';
    }
    
    console.log('build package %s ...', bopId);
    return db._svc.PackagingService.buildPackage(bopId).then(function(result) {
        return {message:'created package '+result};
    });
}