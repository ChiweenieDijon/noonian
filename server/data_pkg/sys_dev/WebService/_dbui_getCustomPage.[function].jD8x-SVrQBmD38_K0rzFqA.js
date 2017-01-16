function (queryParams, db) {
    var key = queryParams.key;
    // var user = req.user;
    
    if(!key) {
        throw new Error("Missing key parameter");
    }
    
    //TODO {rolespec:{$satsifiedBy:user.roles}}
    return db.DbuiCustomPage.findOne({key:key});
}