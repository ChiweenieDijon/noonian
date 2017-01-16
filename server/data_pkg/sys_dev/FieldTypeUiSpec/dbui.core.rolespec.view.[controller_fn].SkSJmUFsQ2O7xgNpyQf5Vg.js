function ($scope, Dbui) {
    
    Dbui.getRoleMap().then(function(roleMap) {
        $scope.roleNames = [];
        _.forEach($scope.displayValue, function(roleId) {
           $scope.roleNames.push(roleMap[roleId]);
           $scope.roleNames.sort();
        });
    });
    
}