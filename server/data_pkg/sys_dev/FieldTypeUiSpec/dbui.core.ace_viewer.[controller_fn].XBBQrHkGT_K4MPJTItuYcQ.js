function ($scope, $filter) {
    var td = $scope.typeDesc;
    var fc = $scope.fieldCustomizations;

    var modeMap = {
      'function':'javascript',
      'object':'json',
      'sourcecode':(td.language ? td.language : 'javascript')
    };
    
    var mode = modeMap[td.type];

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
    


    var aceLoaded = function(editor) {
        
      $scope.aceEditor = editor;
      editor.$blockScrolling = Infinity;
      
      var valueObj = $scope.displayValue;
      if(td.type === 'object') {
        valueObj = (valueObj != null) ? $filter('json')(valueObj) : '';
      }
      
      editor.setValue(valueObj, -1);
    };

    $scope.aceInit = {
      theme:theme,
      mode:mode,
      useWrapMode : true,
      showGutter: true,
      onLoad: aceLoaded
    };

}