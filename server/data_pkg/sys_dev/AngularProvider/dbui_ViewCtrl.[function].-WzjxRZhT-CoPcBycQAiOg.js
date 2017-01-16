function ($stateParams, $scope, DbuiAction, NoonI18n, theObject, viewPerspective) {

    
    var className = $scope.boClass;
    
    if(!className) {
        className = $scope.boClass = $stateParams.className;
    }
    
    $scope.theObject = theObject;
    $scope.viewPerspective = viewPerspective;


    $scope.labels = NoonI18n.getBoLabelGroup(className);
    
    
    // function(perspectiveObj, contextBo, actionObj, argsObj)
    $scope.invokeAction = DbuiAction.invokeAction.bind(DbuiAction, viewPerspective, theObject);
    
    if(viewPerspective.actions) {
        $scope.actionList = DbuiAction.unaliasActionList(viewPerspective.actions);
    }
    
    if(viewPerspective.recordActions) {
        $scope.recordActionList = DbuiAction.unaliasActionList(viewPerspective.recordActions);
    }
    
    if($scope.setPageTitle)
        $scope.setPageTitle('View '+theObject._disp);

}