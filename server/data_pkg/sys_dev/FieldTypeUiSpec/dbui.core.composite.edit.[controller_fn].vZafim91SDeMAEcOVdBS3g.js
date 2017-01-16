function ($scope, $stateParams, Dbui) {

    var fc = $scope.fieldCustomizations;
    var td = $scope.typeDesc;
    
    //'composite' type descriptors have a 'construct' function which instantiates a proper BO-like 'sub-object'
    var stub = td.construct({});
    
    Dbui.getPerspective($stateParams.perspective, stub._bo_meta_data.class_name, 'edit').then(function(subPerspective) {
        $scope.subPerspective = subPerspective;
    });
    
    //Watch for the initial assignment to binding.value... if null, construct an empty 'sub-object'.
    var unwatchFn = $scope.$watch('binding.value', function(newBinding) {
        if(!newBinding) {
            $scope.binding.value = stub;
        }
        console.log('COMPOSITE EDITOR', $scope.binding.value);
        unwatchFn();
    });

}