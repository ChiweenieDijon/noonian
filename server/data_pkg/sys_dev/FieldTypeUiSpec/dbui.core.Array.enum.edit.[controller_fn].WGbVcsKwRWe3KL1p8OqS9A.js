function ($scope, NoonI18n) {
    $scope.itemTypeDesc = $scope.typeDesc[0];
    
    var fc = $scope.fieldCustomizations;

    $scope.enumValues = [];

    NoonI18n.getEnumerationValues($scope.itemTypeDesc.enum).$promise.then(function(enumValues){
        
      if(fc && fc.restrict && fc.restrict.length > 0) {
        var keepVals = {};

        for(var i=0; i < fc.restrict.length; i++) {
          keepVals[fc.restrict[i]] = true;
        }

        for(var i=0; i < enumValues.length; i++) {
          var curr = enumValues[i];
          if(keepVals[curr.value] || curr.value === $scope.binding.value) {
            $scope.enumValues.push(curr);
          }
        }
      }
      else {
        $scope.enumValues = enumValues;
      }
    });



    $scope.selectedValues = {};

    var initialized = false;


    $scope.$watchCollection('selectedValues', function(newVal) {
      if(!initialized) return;

      var valArray = [];

      for(var v in $scope.selectedValues) {
        if($scope.selectedValues[v])
          valArray.push(v);
      }
      $scope.binding.value = valArray;
    });

    $scope.$watchCollection('binding.value', function(valArray) {
      var selectedValues = {};
      if(valArray) {
        for(var i=0; i < valArray.length; i++) {
          selectedValues[valArray[i]] = true;
        }
        $scope.selectedValues = selectedValues;
      }
      initialized = true;
    });

}