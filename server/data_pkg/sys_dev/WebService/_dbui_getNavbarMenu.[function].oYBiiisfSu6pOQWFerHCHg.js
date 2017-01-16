function (config, req, db, _) {
    var configKey = 'sys.dbui.navbar_menu';
    
    var fullBoList = {};
    
    
    var buildSubmenuContainer = function(categoryObj) {
        
        var submenuContainer = { label:categoryObj.title, submenu:[] };
        
        _.forEach(categoryObj.classes, function(boClass) {
            submenuContainer.submenu.push({
                action: {
                    state: "dbui.list",
                    params: { className:boClass, perspective:"default" }
                },
                label:boClass
            });
            delete fullBoList[boClass];
        });
        
        return submenuContainer;
    }
    
    return db.BusinessObjectDef.find({}).then(function(boList) {
        _.forEach(boList, function(bo) {
            fullBoList[bo.class_name] = true;
        });
        
        return config.getCustomizedParameter(configKey, req.user._id);
    })
    .then(function(categoryArr) {
        //for now, menukey contains categorized list of BusinessObject names:
        /*
            [
                { title:"Angular Dev", classes:["AngularModule","AngularBlah",...] },
                { ... },
                ...
            ]
        */
        
        var menuArr = [];
        _.forEach(categoryArr, function(categoryObj) {
            menuArr.push(buildSubmenuContainer(categoryObj));
        });
        
        var uncategorized = Object.keys(fullBoList);
        if(uncategorized.length) {
            uncategorized.sort();
            menuArr.push(buildSubmenuContainer({title:"uncategorized", classes:uncategorized}));
        }
        
        return menuArr
        
        
    });
    
}