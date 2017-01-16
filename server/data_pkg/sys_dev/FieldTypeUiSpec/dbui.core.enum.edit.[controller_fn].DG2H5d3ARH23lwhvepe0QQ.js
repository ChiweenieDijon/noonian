function ($scope, NoonI18n) {
    
    var fc = $scope.fieldCustomizations;

    $scope.enumValues = [];

    NoonI18n.getEnumerationValues($scope.typeDesc.enum).$promise.then(function(enumValues){

      if(fc && fc.restrict && fc.restrict.length > 0) {
        var keepVals = {};

        for(var i=0; i < fc.restrict.length; i++) {
          keepVals[fc.restrict[i]] = true;
        }

        for(var i=0; i < enumValues.length; i++) {
          var curr = enumValues[i];
          if(keepVals[curr.value] || ($scope.binding && curr.value === $scope.binding.value)) {
            $scope.enumValues.push(curr);
          }
        }
      }
      else {
        $scope.enumValues = enumValues;
      }
    });

}