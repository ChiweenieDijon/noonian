function ($scope, $state, db, DbuiAlert, DbuiAction, NoonI18n, theObject, editPerspective) {

    var className = $scope.boClass = $state.params.className;
    $scope.theObject = theObject;
    $scope.editPerspective = editPerspective;

    var boId = $scope.boId = theObject && theObject._id;
    
    var title; 
    
    if(boId) {
        title = 'Edit '+theObject._disp;
    }
    else {
        title = 'New '+className;
    }
    
    $scope.setPageTitle(title);

    var saveTheObject = function() {
      console.log('saving object: ', $scope.theObject);
      
      $scope.theObject.save().then(
        function(result) {
          DbuiAlert.success('Successfully saved '+className+' '+result._id);
          if(!boId) {
            $state.go('dbui.edit', {className:className, id:result._id, perspective:editPerspective.name});
          }
        },
        function(err) {
          DbuiAlert.danger('Problem saving: '+err);
        }

      );
    };

    var revert = function() {
      if(window.confirm('Are you sure?')) {
        theObject = $scope.theObject = db[className].findOne({_id:boId});
        
        //Need to re-bind the action invoker:
        $scope.invokeAction = DbuiAction.invokeAction.bind(DbuiAction, editPerspective, theObject);
      }
    };

    var specialActions = {
      save:{
        label:'Save',
        icon:'fa-save',
        fn: saveTheObject
      },
      revert:{
        label:'Revert',
        icon:'fa-undo',
        fn: revert
      }
    };


    $scope.labels = NoonI18n.getBoLabelGroup(className);
    
    
    // function(perspectiveObj, contextBo, actionObj, argsObj)
    $scope.invokeAction = DbuiAction.invokeAction.bind(DbuiAction, editPerspective, theObject);
    
    if(editPerspective.actions) {
        $scope.actionList = DbuiAction.unaliasActionList(editPerspective.actions);
    }
    
    if(editPerspective.recordActions) {
        $scope.recordActionList = DbuiAction.unaliasActionList(editPerspective.recordActions, specialActions);
    }

    
    if(editPerspective.onLoadAction) {
        DbuiAction.invokeAction(editPerspective, theObject, editPerspective.onLoadAction);
    }

  }