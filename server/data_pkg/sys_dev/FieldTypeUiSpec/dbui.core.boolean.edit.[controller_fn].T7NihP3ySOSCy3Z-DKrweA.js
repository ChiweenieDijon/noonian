function ($scope) {
    var fc = $scope.fieldCustomizations || {};
    var td = $scope.typeDesc;

    if(td.subtype === 'trinary') {
      var displayValue = fc.displayValue || {};
      if(!displayValue['false']) {
        displayValue['false'] = {text:'false'};
      }
      if(!displayValue['true']) {
        displayValue['true'] = {text:'true'};
      }
      if(!displayValue['null']) {
        displayValue['null'] = {text:'null'};
      }

      $scope.booleanValues = [
        {value:true, label:displayValue['true'].text},
        {value:false, label:displayValue['false'].text},
        {value:null, label:displayValue['null'].text}
      ];
    }

    $scope.$watch('binding.value', function(newValue) {
      if($scope.binding && newValue === undefined)
        $scope.binding.value = (td.subtype === 'trinary') ? null : false;
    });


}