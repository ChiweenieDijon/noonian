function ($scope, $stateParams, db, Dbui, DbuiObjectPicker) {
    var td = $scope.typeDesc;
    var refClass = td.ref_class;

    $scope.getRefs = function(val) {
      //Text search for val; limit to a handful, sort so that those with _disp values containing val are at the top.
      return db[refClass].find({$fulltextsearch:val}, {}, {limit:10}).$promise;
    };

    $scope.onSelect = function($item) {
        $scope.binding.value = {_id:$item._id, _disp:$item._disp};
    };

    $scope.lostFocus = function() {
        var boundVal = $scope.binding.value;
        if( !boundVal || $scope.refDisplayText !== boundVal._disp) {
          $scope.binding.value = null;
          $scope.refDisplayText = '';
        }
    }

    $scope.showPicker = function() {
        DbuiObjectPicker.showPickerDialog(refClass, $stateParams.perspective, true, $scope.onSelect);
    }

    $scope.$watch('binding.value', function(newValue) {
        if(newValue)
          $scope.refDisplayText = newValue._disp;
        else
          $scope.refDisplayText = '';
    });

}