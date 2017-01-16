function ($scope) {
    
    var td = $scope.typeDesc;
    var fc = $scope.fieldCustomizations;

    var modeMap = {
      'function':'javascript',
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
    

    $scope.aceInit = {
      theme:theme,
      mode: mode,
      useWrapMode : true,
      showGutter: true
    };
    
    $scope.aceInit.onLoad = function(editor) {
        $scope.aceEditor = editor;
        editor.$blockScrolling = Infinity;
        // var session = editor.getSession(); //http://ajaxorg.github.io/ace/#nav=api&api=edit_session
    };
    
    

}