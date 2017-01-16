function ($scope, $filter) {
    
    var td = $scope.typeDesc;
    var fc = $scope.fieldCustomizations;


    var theme = 'dawn';
    if(fc && fc.displayTheme) {
        
        if(typeof fc.displayTheme === 'string'){
            theme = fc.displayTheme;
        }
        else {
            var appliesKey = td.applicable || 'default';
            if(fc.displayTheme[appliesKey]) {
                theme = fc.displayTheme[appliesKey];
            }
        }
        
    }
    
    $scope.aceInit = {
      theme:theme,
      mode: 'json',
      useWrapMode : true,
      showGutter: true
    };
    
    
    $scope.aceInit.onLoad = function(editor) {
        $scope.aceEditor = editor;
        editor.$blockScrolling = Infinity;
        // var session = editor.getSession(); //http://ajaxorg.github.io/ace/#nav=api&api=edit_session
    };
    
    
    $scope.aceInit.onChange = function() {
        $scope.updateNgModel($scope.aceEditor.getValue());
    };
    
    
    //called when underlying ngModel changes.
    $scope.onModelChange = function(valueObj) {
        var valueStr = (valueObj !== null) ? $filter('json')(valueObj) : '';
        
        if(valueStr === undefined) {
            valueStr = '';
        }
        
        $scope.aceEditor.setValue(valueStr, -1);
    };

}