function ($scope) {
    var origValue = false;
    $scope.newPassword = '';

    $scope.valueChanged = function() {
      if(!origValue)
        origValue = $scope.binding.value;

      $scope.binding.value = $scope.newPassword || origValue;
    }
}