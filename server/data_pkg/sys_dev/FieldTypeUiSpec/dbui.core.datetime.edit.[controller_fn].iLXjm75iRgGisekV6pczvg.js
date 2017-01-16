function ($scope) {
    $scope.dateOptions = {
      formatYear: 'yyyy'
    };
    var fc = $scope.fieldCustomizations;
    $scope.dateFormat = (fc && fc.dateFormat) ? fc.dateFormat : 'MMMM dd, yyyy';
    $scope.timeFormat = (fc && fc.timeFormat) ? fc.timeFormat : 'h:mm a';

}