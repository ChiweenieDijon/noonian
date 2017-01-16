function ($compile, $injector, DbuiFieldType) {
    return {
        // template:'<div ng-include src="fieldTemplateUrl"></div>',
        template:'<div></div>',
        restrict: 'E',
        
        require:'ngModel',
        
        scope: {
            typeDesc: '<',
            elemId: '<',
            fieldCustomizations: '<?' //From perspective.field_customizations
        },
        
        link: function(scope, iElement, iAttributes, ngModel) {
            
            var td = scope.typeDesc;
            if(!td) {
                console.error('Missing typeDesc in dbuiFieldEditor directive');
                return;
            }
            
            
            DbuiFieldType.getSpec(td, 'edit').then(function(specObj){
                
                if(!specObj) {
                    console.error('Missing UI Spec in dbuiFieldEditor directive');
                    return;
                }
                
                //First, load up the proper type-specific template from DbuiFieldType service, 
                // get it compiled and attached to this directive:
                var childTemplate = specObj.template; 
                iElement.html($compile(childTemplate)(scope));
                
                //Next, handle custom linkage logic for type-specific UI Spec
                var performNgModelSetup = true; //Type-specific link can override our default ng-model binding.
                
                    
                if(specObj.link_fn) {
                    
                  //This fieldtype has a 'link' function defined: 
                  //  returns true if we should go ahead and set up default ngModel binding  
                  //     (lets the child simply update scope.binding.value)
                  //  returns false if it already took care of it 
                  //     (it set up some fancy custom ng-model setup for its own purposes)
                  
                  var fnString = specObj.link_fn;
                  try {
                      var toCall;
                      eval("toCall = "+fnString);
                      if(typeof toCall === 'function') {
                          performNgModelSetup = $injector.invoke(toCall, this, 
                            {scope:scope, iElement:iElement, iAttributes:iAttributes, ngModel:ngModel}
                            );
                      }
                      else {
                          console.error('bad link function for typeDesc', td);
                      }
                  }
                  catch(err) {
                      console.error('bad link function for typeDesc', td, err);
                  }
                  
                }
                
                
                if(performNgModelSetup) {
                    //Perform the 'default' ngModel setup: child template/controller can just assign to scope object binding.value
                    // "modelValue" is the object that is ultimately assigned to whatever our parent put in the ng-model directive
                    // "$viewValue" is the representation we manipulate internally; in this default case it's just a wrapper around modelValue
                    
                    //Four parts to setting it up:
                    
                    //1. Wire up converter for ng-model object --> internal $viewValue representation
                    ngModel.$formatters.push(function(modelValue) {
                        //  console.log('dbuiFieldEditor: formatting viewValue',modelValue);
                        return {value:modelValue};
                    });
                    
                    //2. Wire up converter for internal $viewValue representation --> ng-model object
                    ngModel.$parsers.push(function(viewValue) {
                        //  console.log('dbuiFieldEditor: parsing viewValue', viewValue);
                        return viewValue.value;
                    });
                    
                    //3. Wire up trigger for scope object --> $viewValue
                    scope.$watch('binding', function() {
                        //  console.log('dbuiFieldEditor: detected change in scope.binding:', scope.binding);  
                        //must *replace* the viewValue object in order for change to propogate to ng-model!
                        if(scope.binding) {
                            ngModel.$setViewValue({value:scope.binding.value});
                        }
                    }, 
                    true); //deep watch... TODO performace issue to deep watch all field values???
                    
                    //4. Wire up callback for $viewValue update --> scope object
                    ngModel.$render = function() {
                        //  console.log('dbuiFieldEditor: rendering viewValue to scope.binding:', ngModel.$viewValue);
                        
                        if(!scope.binding) {
                            scope.binding = {};
                        }
                        //scope object can refer directly to the ngModel viewValue (just not the other way around!)
                        scope.binding.value = ngModel.$viewValue.value;
                    };
                    
                }
                
                /* ngModel setup is now complete.  However, it was done asyncronously (having waited for 
                 * the DbuiFieldType.getSpec() promise) so its $viewValue may already contain data that has
                 * yet to be rendered...
                 */
                 if(typeof ngModel.$render === 'function') {
                     //Simulate the standard ngModel sequence
                     var initValue = ngModel.$viewValue;
                     _.forEach(ngModel.$formatters, function(formatter) {
                        if(typeof formatter === 'function') {
                            initValue = formatter(initValue);
                        }
                     });
                     ngModel.$setViewValue(initValue);
                     ngModel.$render();
                 }
                
            });
            
        },
        
      
      controller: function($scope) {
          
          DbuiFieldType.getSpec($scope.typeDesc, 'edit').then(function(specObj){
              
              if(specObj && specObj.controller_fn) {
                  var fnString = specObj.controller_fn;
                  try {
                      var toCall;
                      eval("toCall = "+fnString);
                      if(typeof toCall === 'function') {
                          return $injector.invoke(toCall, this, {$scope:$scope});
                      }
                      else {
                          console.error('bad controller function for typeDesc', $scope.typeDesc);
                      }
                  }
                  catch(err) {
                      console.error('bad controller function for typeDesc', $scope.typeDesc, err);
                  }
              }
          });
          
          
      }
      
    };
  }