function (uibDateParser, $filter) {
    
    return {
        templateUrl:'dbui/core/helper/time_string_editor.html',
        restrict: 'E',
        
        scope: {
            elemId: '@',
            displayFormat: '@'
        },
        
        require: 'ngModel', 
        
        link: function(scope, iElement, iAttributes, ngModel) {
            
            var displayFormat = scope.displayFormat;
            
            var dateFormatter = $filter('date');
            
            var stringToDate = function(stringDate) {
                //14:48:00.000
                var parsed = /(\d{2}):(\d{2}):(\d{2}).(\d{3})/.exec(stringDate);
                var h = +parsed[1];
                var m = +parsed[2];
                
                //seconds/millis optional
                var s = parsed.length >= 4 ? +parsed[3] : 0;
                var ms = parsed.length >= 5 ? +parsed[4] : 0;
                
                //construct in **local time zone**
                return new Date(1900, 0, 1, h, m, s, ms);
                
            };
            
            //1. Wire up converter for ng-model object (ISO string segment)--> internal $viewValue representation (formatted string)
            ngModel.$formatters.push(function(modelValue) {
                if(modelValue) {
                    //modelValue is the time portion of an ISO String (the stuff after T, not including timezone)
                    var d =  stringToDate(modelValue);
                    return {value: dateFormatter(d, displayFormat)};  //format in **local time zone**
                }
                return {value:null};
            });
            
            //2. Wire up converter for internal $viewValue representation (formatted string) --> ng-model object (ISO string segment)
            ngModel.$parsers.push(function(viewValue) {
                if(viewValue && viewValue.value) {
                    try {
                        var dateObj = uibDateParser.parse(viewValue.value, displayFormat); //parsed to **local time zone**
                        if(dateObj instanceof Date && !isNaN(dateObj.getTime())) {
                            var h = dateObj.getHours();
                            var m = dateObj.getMinutes();
                            var s = dateObj.getSeconds();
                            var ms = dateObj.getMilliseconds();
                            
                            h = (h < 10) ? '0'+h : ''+h;
                            m = (m < 10) ? '0'+m : ''+m;
                            s = (s < 10) ? '0'+s : ''+s;
                            ms = (ms < 10) ? '00'+ms : ( (ms < 100) ? '0'+ms : ''+ms);
                            return h+':'+m+':'+s+'.'+ms;
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
            
            //For a cleaner interface, hightlight something helpful on focus:
            scope.onFocus = function($event) {
                var domElem = $event.target;
                if(domElem.value) {
                    var rMatch = /(:\d+)[: ]/.exec(domElem.value);
                    
                    if(rMatch) {
                        var selStart = rMatch.index+1; //just past first colon
                        var selEnd = rMatch.index + rMatch[1].length;
                        domElem.setSelectionRange(selStart, selEnd);   
                    }
                }
            };
        },
        
        controller: function($scope) {
            
            var displayFormat = $scope.displayFormat;
            if(!displayFormat) {
                displayFormat = $scope.displayFormat = 'h:mm a';
            }
            
            var dateFormatter = $filter('date');
            var iterDate = new Date(1900, 0, 1, 0, 0, 0, 0);
            
            $scope.times = [];
            for(var i=0; i < 24; i++) {
                $scope.times.push(dateFormatter(iterDate, displayFormat));
                iterDate.setHours(iterDate.getHours()+1);
            }
            
            
            
            $scope.selectTime = function(time) {
                if(!$scope.binding) {
                    $scope.binding = {};
                }
                $scope.binding.value = time;
            }
        }
    };
}