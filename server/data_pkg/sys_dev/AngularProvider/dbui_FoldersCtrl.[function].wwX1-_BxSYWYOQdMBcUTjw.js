function ($scope, $state, $stateParams, Dbui, folderPerspective) {

  $scope.folderPerspective = folderPerspective;

  Dbui.prepareScope($scope, folderPerspective);

}