function (scope, ngModel) {
  //viewValue: selectedValues
  //modelValue: [ 'role_id1', ...]

  //$formatter: formats ng-model value -> $viewValue
  ngModel.$formatters.push(function(modelValue) {
      var selectedValues = {};
      
      if(modelValue) {
          for(var i=0; i < modelValue.length; i++) {
              selectedValues[modelValue[i]] = true;
          }
      }
    
    return [selectedValues];
  });

  //$parser: parses $viewValue -> ng-model value
  ngModel.$parsers.push(function(viewValue) {
      var idArray = [];
      var selectedValues = viewValue && viewValue.length ? viewValue[0] : {};
      
      if(selectedValues) {
          for(var v in selectedValues) {
              if(selectedValues[v])
                idArray.push(v);
          }
      }
      
      return idArray;
  });

  //$watch: our scope -> $viewValue
  scope.$watch('selectedValues', function() {
    ngModel.$setViewValue([scope.selectedValues]);

  }, true );

  //$render: $viewValue -> our scope
  ngModel.$render = function() {
    scope.selectedValues = ngModel.$viewValue[0];
  };
  
  return false;
}