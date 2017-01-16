function ($scope, DbuiAction) {
    $scope.viewRefObj = function() {
      var td = $scope.typeDesc;
      var displayValue = $scope.displayValue;
      if(displayValue) {
          var action = DbuiAction.unalias('dialog-view');
          var args = {
              className:  td.ref_class || displayValue.ref_class,
              targetObj: displayValue
          };
          DbuiAction.invokeAction(null, null, action, args);
      }
    };

}