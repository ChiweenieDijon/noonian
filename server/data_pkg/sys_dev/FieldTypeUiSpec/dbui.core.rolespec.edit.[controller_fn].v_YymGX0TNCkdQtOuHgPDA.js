function ($scope, Dbui) {
    
    Dbui.getRoleMap().then(function(roleMap) {
        
        $scope.allRoles = [];
        _.forEach(roleMap, function(name, id){
            $scope.allRoles.push({
                _id:id,
                name:name
            });
        });
    });

}