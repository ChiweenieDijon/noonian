function (NoonAction, DbuiAlert, $q, $stateParams, $rootScope, $uibModal, $state, db) {

    var derivedService = Object.create(NoonAction);
    
    var dbuiCoreActions = {
      'new':{
        label:'New',
        state:'dbui.create',
        icon:'fa-plus-square'
      },
      'list':{
        label:'List',
        state:'dbui.list',
        icon:'fa-list'
      },
      'folder_list':{
        label:'List',
        state:'dbui.folders',
        icon:'fa-folder-o'
      },
      'view':{
        label:'View',
        state:'dbui.view',
        icon:'fa-eye'
      },
      'edit':{
        label:'Edit',
        state:'dbui.edit',
        icon:'fa-pencil-square-o'
      },
      'delete':{
        label:'Delete',
        icon:'fa-times-circle',
        fn: function(args) {
          if(window.confirm('Are you sure you wish to delete this record?')) {
            return args.targetObj.remove().then(function() {
              $state.go('dbui.list', {className:args.className, perspective:args.perspective});
            },
            function(err) {
              alert('error deleting: '+err);
            });
          }

          return null;
        }
      },
      'dialog-view': {
        label:'View',
        icon:'fa-eye',
        fn: function(args) {

          var modalInstance;
          var scope = $rootScope.$new(true);

          var className = scope.boClass = args.className;
          var perspectiveName = scope.perspectiveName = args.perspective;
          var boId = scope.boId = args.targetObj._id || args.targetObj;

          modalInstance = $uibModal.open({
            templateUrl:'dbui/core/view-dialog.html',
            controller:'dbui_ViewCtrl',
            size:'lg',
            scope: scope,
            resolve: {
              theObject: function() {
                return db[className].findOne({_id:boId}).$promise;
              },
              viewPerspective:  function(Dbui) {
                return Dbui.getPerspective(perspectiveName, className, 'view');
              }
            }
          });
        }
      }

    };
    
    /**
     * DbuiAction.init
     */
    derivedService.init = function() {
        NoonAction.registerAliases(dbuiCoreActions);
        
    };
    
    
    
    /**
     * DbuiAction.invokeAction
     * Invokes actionObj, adding in parameters from $stateParams and contextBo.
     * How contextBo is added to params is dependent on the type of action:
     *   state and ws actions -> "id" is populated w/ contextBo._id 
     *   fn and UiAction actions -> "targetObj" is populated w/ contextBo
     */
    derivedService.invokeAction = function(perspectiveObj, contextBo, actionObj, argsObj) {
        
        // console.log('DbuiAction.invokeAction', perspectiveObj, actionObj, contextBo);
        if(!actionObj) {
            throw new Error('null actionObj not allowed');
        }
        
      //Append the standard DBUI params to the action object
      var params = actionObj.params ? _.clone(actionObj.params) : {};
      
      //Always pass className and perspective:
      if(!params.className) {
          params.className = $stateParams.className;
      }
      if(!params.perspective) {
          if(perspectiveObj) {
              params.perspective = perspectiveObj.name;
          }
          else {
              params.perspective = $stateParams.perspective || 'default';  
          }
      }
      
      
      //depending on type of action, we add either targetId or targetObj
      if(actionObj.state || actionObj.ws) {
          if(contextBo && contextBo._id)
            params.id = contextBo._id;
          else
            params.id = contextBo;
      }
      else if(actionObj.fn || actionObj.ui_action) {
          params.targetObj = contextBo;
          params.perspectiveObj = perspectiveObj;
      }
      
      
      //Anything in argsObj supercedes the actionObj.params
      if(argsObj) {
          _.assign(params, argsObj);
      }
      
      return NoonAction.invoke(actionObj, params).then(
          function(result) {
            if(result) {
              if(result.error) {
                // alert(result.error);
                DbuiAlert.danger(result.error);
              }
              
              if(result.message) {
                // alert(result.message);
                DbuiAlert.success(result.message);
              }
              
              if(result.warning) {
                  DbuiAlert.warning(result.warning);
              }
              
              if(result.action) {
                  console.log('Chaining action: ', result.action);
                  return NoonAction.invoke(result.action);
              }
            }
            
            return result;
          },
          function(err) {
              var msg = 'Error invoking action';
              console.log('DbuiAction: '+msg, actionObj, err);
              DbuiAlert.danger(msg+' '+err);
          }

        );
    };
    
    return derivedService;
}