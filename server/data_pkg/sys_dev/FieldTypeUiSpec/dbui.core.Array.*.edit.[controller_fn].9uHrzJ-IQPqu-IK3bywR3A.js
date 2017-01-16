function ($scope) {

    $scope.itemTypeDesc = $scope.typeDesc[0];

    $scope.editing = -1;

    $scope.addItem = function() {
      if(!$scope.binding.value) {
        $scope.binding.value = [];
      }
      
      var objArray = $scope.binding.value;

      objArray.push(null);
      $scope.editing = objArray.length-1;
    };

    $scope.editItem = function(index) {
      $scope.editing = index;
    };

    $scope.removeItem = function(index) {
      $scope.binding.value.splice(index, 1);
    };

    $scope.doneEditing = function() {
      $scope.editing = -1;
    };

  }