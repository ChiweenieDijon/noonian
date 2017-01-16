function ($scope, NoonI18n) {
    $scope.itemTypeDesc = $scope.typeDesc[0];

    NoonI18n.getEnumerationValues($scope.itemTypeDesc.enum)
      .$promise.then(function(result) {
        var labelMap = {};
        for(var i=0; i < result.length; i++) {
          labelMap[result[i].value] = result[i].label;
        }
        $scope.enumLabels = labelMap;
    });

}