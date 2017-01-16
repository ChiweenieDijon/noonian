function ($rootScope, $scope, Dbui, Action, Auth, $timeout) {

    Auth.onLogin( function() {
      Dbui.getSidebarMenu().then(function(menu) {
        $scope.menu = menu;
        
        $rootScope.$emit('sidebarMenuLoaded', menu);
        // $timeout( function() {
        //   //idiotic work-around for improperly-sized accordion panels...
        //   for(var i=0; i < menu.length; i++) {
        //       menu[i].isOpen = true;
        //     }
        // }, 200);
      });
    });



    Auth.onLogout( function() {
      $scope.menu = null;
    });


    $scope.invokeAction = function(actionObj) {
      Action.invoke(actionObj);
    };
  }