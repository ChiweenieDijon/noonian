function ($scope, $stateParams, NoonI18n, DbuiAction, listPerspective) {
    
    var className = $scope.boClass = $stateParams.className;
    
    //Load the labels for this class's fields
    $scope.labels = NoonI18n.getBoLabelGroup(className);
    
    //Put listPerspective (populated in $state object's "resolve" block) into scope
    $scope.listPerspective = listPerspective;
    
    // function(perspectiveObj, contextBo, actionObj, argsObj)
    $scope.invokeAction = DbuiAction.invokeAction.bind(DbuiAction, listPerspective, null);
    
    if(listPerspective.actions) {
        $scope.actionList = DbuiAction.unaliasActionList(listPerspective.actions);
    }
    
    if(listPerspective.title) {
        $scope.setPageTitle(listPerspective.title);
    }
    else {
        $scope.setPageTitle('List '+className);
    }
    
}