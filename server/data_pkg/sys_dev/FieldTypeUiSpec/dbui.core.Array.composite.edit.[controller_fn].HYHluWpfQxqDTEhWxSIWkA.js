function ($scope, $stateParams, Dbui) {

    //Little editable datatable
    
    var fc = $scope.fieldCustomizations;
    var td = $scope.typeDesc[0];
    
    var stub = td.construct({});
    
    $scope.objMetaData = stub._bo_meta_data;
    
    
    //Action object to remove an item from the array:
    var removeAction = {
      icon:'fa-remove',
      fn:function(args) {
        if(args) {
          $scope.binding.value.splice(args.index, 1);
        }
        return true;
      }
    };
    
    //Config object for 
    $scope.tableConfig = {
      cellEdit:true,    //allow 'global' edit (all fields editable) TODO configure from fieldCustomizations
      recordActions:[     //actions to be appended to any perspective actions.
          removeAction
      ]
    };
    
    //Use 'list' perspective for editing an array of composites:
    Dbui.getPerspective($stateParams.perspective, stub._bo_meta_data.class_name, 'list').then(function(subPerspective) {
        $scope.subPerspective = subPerspective;
    });
    
    
    //Ensure empty array binding when binding.value is null:
    var unwatchFn = $scope.$watch('binding.value', function(newBinding) {
        if(!newBinding) {
            $scope.binding.value = [];
        }
        unwatchFn();
    });
    
    
    
    $scope.addItem = function() {
      var newObj = td.construct({});
      $scope.binding.value.push(newObj);
    }

}