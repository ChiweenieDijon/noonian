function ($compile,  DbuiFieldType, $injector) {
    return {
      template: '<div></div>',
      restrict: 'E',
      
      scope: {
        displayValue: '=',
        typeDesc: '<',
        abbreviated: '<?',
        fieldCustomizations: '<?' //From perspective.field_customizations
      },
      
      link: function (scope, element, attrs, ngModel) {
          var td = scope.typeDesc;
          if(!td) {
              console.error('Missing typeDesc in dbuiFieldEditor directive');
              return;
          }
          
          DbuiFieldType.getSpec(td, 'view').then(function(specObj){
              var templateHtml = specObj.template;
              var compiledTemplate = $compile(templateHtml);
              
              element.append(compiledTemplate(scope));
          });

      },
       
      controller: function($scope) {
          DbuiFieldType.getSpec($scope.typeDesc, 'view').then(function(specObj){
              
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