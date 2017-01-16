function (scope, iElement, iAttributes, ngModel) {
    
    //Sets $viewValue directly when ace editor value changes
    scope.updateNgModel = function(valueStr) {
        //Content of editor changed -> update binding.value
        try {
          var valueObj = angular.fromJson(valueStr);

          if(valueObj === '') {
            ngModel.$setViewValue(null);
            scope.valid = true;
          }
          else {
            ngModel.$setViewValue(valueObj);
            scope.valid = true;
          }
        } catch(e) {
          scope.valid = false;
        }
      };
      
      //When a change to ngModel occurs, $render is called to notify us to update the UI
      ngModel.$render = function() {
          //Grab $viewValue, tell the controller about it
          scope.onModelChange(ngModel.$viewValue);
      };
      
      
        // ngModel.$formatters.push(function(modelValue) {
        //     console.log('format', modelValue);
        //     return {value:modelValue};
        // });
        
        // ngModel.$parsers.push(function(viewValue) {
        //     console.log('parse', viewValue);
        //     return viewValue.value;
        // });
      
    
    //Communicate to dbuiFieldEditor to SKIP set-up of ngModel binding to scope.binding.value:
    return false; 
}