function ($scope) {
    var fc = $scope.fieldCustomizations;
    
    if(fc && fc.dropdown) {
      var td = $scope.typeDesc;
      var min = td.min || 0;
      var max = td.max;
      $scope.valueRange = _.range(min, max+1);
    }
}