function (queryParams, db) {
    db._svc.PackagingService.packageToFs(queryParams.id);
    return {message:'Package export initiated'};
}