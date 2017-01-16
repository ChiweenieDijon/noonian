function ($scope) {
    var fc = $scope.fieldCustomizations;
    $scope.displayFormat = (fc && fc.format) ? fc.format : 'MMMM dd, yyyy';


}