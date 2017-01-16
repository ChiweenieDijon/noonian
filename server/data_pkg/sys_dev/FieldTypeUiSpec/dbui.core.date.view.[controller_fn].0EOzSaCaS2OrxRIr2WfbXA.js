function ($scope) {

    var fc = $scope.fieldCustomizations;
    $scope.format = (fc && fc.format) ? fc.format : 'MMMM dd, yyyy';

  }