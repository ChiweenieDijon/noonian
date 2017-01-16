function (req, config, auth, DbuiMenuBuilder, Q) {
    var configKey = 'sys.dbui.sidebar_menu';
    
    return Q.all([
        auth.getCurrentUser(req),
        config.getCustomizedParameter(configKey, req.user._id)
    ])
    .then(function(resultArr) {
        var currUser = resultArr[0];
        var menuKey = resultArr[1];
        return DbuiMenuBuilder.buildMenu(menuKey, currUser);
    });
    
}