function ($scope, Config, Action) {
    //Get the config parameter
    $scope.loading = true;
    Config.getParameter('sys.dbui.homeAction').then(
      function(homeAction) {
        Action.invoke(homeAction);
      },
      function(err) {
        $scope.loading = false;
        console.log(err);
        $scope.message = "Home action not properly configured. Be sure to set config parameter 'dbui.homeAction'";
      }
    );
  }