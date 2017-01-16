function ($scope, NoonI18n) {
    // var fc = $scope.fieldCustomizations;

    $scope.labelFor = {};

    NoonI18n.getEnumerationValues($scope.typeDesc.enum).$promise.then(function(enumValues){
        
      for(var i=0; i < enumValues.length; i++) {
        $scope.labelFor[enumValues[i].value] = enumValues[i].label;
      }
      
    });

}