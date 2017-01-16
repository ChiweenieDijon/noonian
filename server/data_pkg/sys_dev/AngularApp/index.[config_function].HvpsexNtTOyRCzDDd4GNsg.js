function ($stateProvider, $urlRouterProvider, $locationProvider, $httpProvider, $controllerProvider) {
    console.log('noonian.dbui config()');
    var appUrlBase = '/dbui/index';
    
    $urlRouterProvider
      .otherwise(appUrlBase);
    
    $locationProvider.html5Mode({enabled:true, requireBase:true});

    // $httpProvider.interceptors.push('NoonAuthInterceptor');
    
    //Allow dynamical adding of controllers...
    //noonianAppModule.registerController = $controllerProvider.register;

    //Function used by DBUI to query for theObject for className/id stateParams
    var resolveTheObject = function($stateParams, db) {
        return db.init().then(function() {
            
          var className = $stateParams.className;
          var boId = $stateParams.id;
          if(className) {
             var Model = db[className];
              if(boId && Model) {
                return Model.findOne({_id:boId}).$promise;
              }
              else if(Model) {
                return new Model({});
              }
              else {
                return null;
              }
          }
    
          return null;
        });
      
    };
    
    
    var resolvePerspectiveObj = function(perspectiveType, $stateParams, Dbui) {
      var className = $stateParams.className;
      var perspectiveName = $stateParams.perspective || 'default';

      if(className) {
        return Dbui.getPerspective(perspectiveName, className, perspectiveType);
      }
      else {
        return null;
      }

    };
    
    $stateProvider
      .state('dbui', {
        abstract:true,
        views: {
          'navBar' : {
            templateUrl: 'dbui/core/navbar.html'
          },
          'sideBar' : {
            templateUrl: 'dbui/core/sidebar.html'
          },
          'mainContainer' : {
            template: '<ui-view/>' //Child states populate this
          }
        },
        resolve: {
            //IF DBUI SILENTLY FAILS TO LOAD:
            // check these injected providers for errors arising from using identifiers that haven't been declared
            initApi: function(db, NoonAuth, Dbui) {
                console.log('Initializing "dbui" ui-router state...');
                return db.init().then(NoonAuth.init).then(Dbui.init);
            }
        }
      })
      .state('dbui.home', {
        url:appUrlBase,
        templateUrl: 'dbui/core/state/home.html',
        controller:'dbui_HomePageCtrl'
      })
    //   .state('dbui.login', {
    //     url:appUrlBase+'/login',
    //     templateUrl: 'dbui/core/login.html'
    //   })
      .state('dbui.list', {
        url:appUrlBase+'/list/:className/:perspective',
        templateUrl: 'dbui/core/state/list.html',
        controller:'dbui_ListCtrl',
        resolve: {
          listPerspective:  function($stateParams, Dbui, DbuiFieldType) {
            return DbuiFieldType.cacheTypeInfoForClass($stateParams.className, 'view')
                .then(resolvePerspectiveObj.bind(null,'list', $stateParams, Dbui));
          }
        }
      })
      .state('dbui.folders', {
        url:appUrlBase+'/folders/:className/:perspective',
        templateUrl: 'dbui/core/state/folders.html',
        controller:'dbui_FoldersCtrl',
        resolve: {
          folderPerspective:  function($stateParams, Dbui, DbuiFieldType) {
            return DbuiFieldType.cacheTypeInfoForClass($stateParams.className, 'view')
                .then(resolvePerspectiveObj.bind(null,'folder', $stateParams, Dbui));
          }
        }
      })
      .state('dbui.view', {
        url:appUrlBase+'/view/:className/:id/:perspective',
        templateUrl: 'dbui/core/state/view.html',
        controller:'dbui_ViewCtrl',
        resolve: {
          theObject: resolveTheObject,
          viewPerspective:  function($stateParams, Dbui, DbuiFieldType) {
            return DbuiFieldType.cacheTypeInfoForClass($stateParams.className, 'view')
                .then(resolvePerspectiveObj.bind(null,'view', $stateParams, Dbui));
          }
        }
      })
      .state('dbui.edit', {
        url:appUrlBase+'/edit/:className/:id/:perspective',
        templateUrl: 'dbui/core/state/edit.html',
        controller:'dbui_EditCtrl',
        resolve: {
          theObject: resolveTheObject,
          editPerspective:  function($stateParams, Dbui, DbuiFieldType) {
            return DbuiFieldType.cacheTypeInfoForClass($stateParams.className, 'edit')
                .then(resolvePerspectiveObj.bind(null, 'edit', $stateParams, Dbui));
          }
        }
      })
      .state('dbui.create', {
        url:appUrlBase+'/create/:className/:perspective',
        templateUrl: 'dbui/core/state/edit.html',
        controller:'dbui_EditCtrl',
        resolve: {
          theObject: resolveTheObject,
          editPerspective:  function($stateParams, Dbui, DbuiFieldType) {
            return DbuiFieldType.cacheTypeInfoForClass($stateParams.className, 'edit')
                .then(resolvePerspectiveObj.bind(null, 'edit', $stateParams, Dbui));
          }
        }
      })
      .state('dbui.custompage', {
        url:appUrlBase+'/custompage/:key',
        templateUrl: 'dbui/core/state/custompage.html',
        params:{
          id:null,
          key:null,
          resourcePath:null,
          perspective:null,
          extraParams:null
        }
      })
      ;
}