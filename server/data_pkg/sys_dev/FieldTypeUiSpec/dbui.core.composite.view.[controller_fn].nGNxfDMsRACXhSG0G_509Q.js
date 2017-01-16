function ($scope, $stateParams, Dbui) {
    
    var displayValue = $scope.displayValue;
    
    //If composite field being viewed has a _disp, that's what is displayed.
    // otherwise a dbui-object-viewer directive is used.
    if(displayValue && !displayValue._disp) {
        //'composite' type descriptors have a 'construct' function which instantiates a proper BO-like 'sub-object'
        var td = $scope.typeDesc;
        var stub = td.construct({});
        
        Dbui.getPerspective($stateParams.perspective, stub._bo_meta_data.class_name, 'view').then(function(subPerspective) {
            $scope.subPerspective = subPerspective;
        });
    }
    
}