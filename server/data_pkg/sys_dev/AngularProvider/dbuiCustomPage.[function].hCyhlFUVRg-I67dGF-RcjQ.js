function ($compile, $injector, Dbui) {
    return {
      template: '<div></div>',
      restrict: 'E',
      
      scope: {
        key: '@'
      },
      
      link: function (scope, element, attrs) {
          var key = scope.key;
          
          if(!key) {
              console.error('Missing typeDesc in dbuiFieldEditor directive');
              return;
          }
          
          Dbui.getCustomPage(key).then(function(customPageObject){
              
              var templateHtml = customPageObject.body;
              var compiledTemplate = $compile(templateHtml);
              
              element.append(compiledTemplate(scope));
          });

      },
       
      controller: function($scope) {
          
          Dbui.getCustomPage($scope.key).then(function(customPageObject){
              
              if(customPageObject && customPageObject.controller) {
                  var fnString = customPageObject.controller;
                  try {
                      var toCall;
                      eval("toCall = "+fnString);
                      if(typeof toCall === 'function') {
                          return $injector.invoke(toCall, this, {$scope:$scope});
                      }
                      else {
                          console.error('bad controller function for customPage', $scope.key);
                      }
                  }
                  catch(err) {
                      console.error('bad controller function for customPage', $scope.key, err);
                  }
              }
          
          });
      }
      
    };
  }