function () {
    return {
        templateUrl:'dbui/core/helper/date_string_editor.html',
        
        restrict: 'E',
        
        require:'ngModel',
        
        scope: {
            displayFormat: '@',
            elemId:'@'
        },
        
        
        link: function(scope, iElement, iAttributes, ngModel) {
    
            
            var stringToDate = function(stringDate) {
                //GOD I F'ING HATE DATES SO MUCH
                var parsed = /(\d{4})-(\d{2})-(\d{2})/.exec(stringDate);
                var year = +parsed[1];
                var month = (+parsed[2])-1;
                var day = +parsed[3]
                return new Date(Date.UTC(year, month, day, 12, 0, 0));
                
            };
            
            //1. Wire up converter for ng-model object (string)--> internal $viewValue representation (date)
            ngModel.$formatters.push(function(modelValue) {
                if(modelValue) {
                    var d =  stringToDate(modelValue);
                    return {value:d};
                }
                return {value:null};
            });
            
            //2. Wire up converter for internal $viewValue representation (date) --> ng-model object (string)
            ngModel.$parsers.push(function(viewValue) {
                if(viewValue && viewValue.value instanceof Date) {
                    try {
                        var datestr = viewValue.value.toISOString();
            
                        var parsed = /(\d{4}-\d{2}-\d{2}).*/.exec(datestr);
                        if(parsed && parsed[1]) {
                            return parsed[1];
                        }
                    } catch(e) {}
                }
                
                return null;
            });
            
            //3. Wire up trigger for scope object --> $viewValue
            scope.$watch('binding', function() {
                //must *replace* the viewValue object in order for change to propogate to ng-model!
                if(scope.binding) {
                    ngModel.$setViewValue({value:scope.binding.value});
                }
            }, 
            true); 
            
            //4. Wire up callback for $viewValue update --> scope object
            ngModel.$render = function() {
                if(!scope.binding) {
                    scope.binding = {};
                }
                scope.binding.value = ngModel.$viewValue.value;
                
            };
        },
        
      
      controller: function($scope) {
          
        $scope.dateOptions = {
          formatYear: 'yyyy'
        };
        
        $scope.ngModelOptions = {
            timezone: 'Z'
        };
        
        if(!$scope.displayFormat) {
            $scope.displayFormat = 'MMMM dd, yyyy'; 
        }
        
        $scope.pickerOpen = false;
    
        $scope.togglePicker = function() {
            $scope.pickerOpen = !$scope.pickerOpen;
        };
          
          
      }
      
    };
  }