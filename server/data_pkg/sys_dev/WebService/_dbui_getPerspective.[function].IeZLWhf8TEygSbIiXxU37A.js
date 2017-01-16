function (queryParams, req, DbuiPerspectiveBuilder) {
    var name = queryParams.name;
    var boClass = queryParams.class_name;
    var type = queryParams.type;
    var userId = req.user._id;


    if(!boClass) {
        throw new Error("Missing boClass parameter");
    }
    
    if(!name) {
        name = 'default';
    }
    
    return DbuiPerspectiveBuilder.getPerspective(boClass, name, type, userId);
    
}