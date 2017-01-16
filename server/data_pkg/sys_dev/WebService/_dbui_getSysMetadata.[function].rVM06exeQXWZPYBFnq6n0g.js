function (db) {
    return db.BusinessObjectDef.find({}).then(function(allBods) {
        return {result:allBods};
    });
}