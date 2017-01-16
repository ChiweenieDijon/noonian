function ($rootScope, $scope, $location, $state, db, Auth, Action, Dbui, NoonConfig) {

    $scope.loggedIn = false;
    $scope.isAdmin = false;

    $scope.appTitle = $rootScope.instanceName;
    
    Auth.onLogin( function(evt, userObj) {

      $scope.loggedIn = true;
      $scope.currentUser = userObj;
      $scope.isAdmin = userObj.isAdmin;


      if($scope.isAdmin) {
        //TODO: eventually want to allow for non-admin navbar menu!
        Dbui.getNavbarMenu().then(function(navbarMenu) {
            $scope.navbarMenu  = navbarMenu;
        });
        
        var pkgConfig;
        NoonConfig.getParameter('sys.enablePackaging').then(function(value) {
            $scope.enablePackaging = value;
            if(value) {
                db.BusinessObjectPackage.find({}, null, {sort:{name:1}}).$promise.then(function(result) {
                $scope.pkgList = [{key:false, name:'*none*'}].concat(result);
        
                db.Config.findOne({key:'sys.currentPackage'}).$promise.then(function(cfgObj) {
                    pkgConfig = cfgObj;
                    for(var i=0; i < $scope.pkgList.length; i++)
                      if($scope.pkgList[i].key == pkgConfig.value) {
                        $scope.currPkg = $scope.pkgList[i];
                      }
                  });
                });
                
            }
        });
        
        
        $scope.switchPkg = function(pkg) {
          pkgConfig.value = pkg.key;
          pkgConfig.save().then(function() {
            $scope.currPkg = pkg;
          },
          function(err) {
            alert('Problem saving change: '+err);
          });
        };
        
      }


      //Redirect to home if we're looking at the login screen:
      if($location.path() === '/login')
        $location.path('/');
    });

    Auth.onLogout( function() {
      $scope.loggedIn = false;
      $scope.isAdmin = false;
    });


    $scope.isCollapsed = false;


    $scope.logout = function() {
      Auth.logout();
      window.location.reload();
    };

    $scope.isActive = function(stateName) {
      return stateName === $state.$current.name;
    };

    $rootScope.$on('sidebarMenuLoaded', function(e, menu){
      $scope.sidebarMenu = menu;
    });

    $scope.invokeAction = function(action) {
        $scope.boMenuOpen = false;
      Action.invoke(action);
    };
    
    $scope.appTitleRightClick = function() {
        var myUrl = $location.absUrl();
        window.open(myUrl);
    };
    
    $scope.toggleSidebar = function() {
        $rootScope.sidebarCollapsed = !$rootScope.sidebarCollapsed;    
    };
  }