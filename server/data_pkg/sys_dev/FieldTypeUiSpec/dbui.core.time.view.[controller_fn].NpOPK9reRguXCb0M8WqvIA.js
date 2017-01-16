function ($scope) {

    var fc = $scope.fieldCustomizations;
    $scope.format = (fc && fc.format) ? fc.format : 'h:mm a';

    $scope.$watch('displayValue', function() {
        var parsed = /(\d{2}):(\d{2}):(\d{2}).(\d{3})/.exec($scope.displayValue);
        if(parsed && parsed.length >= 3) {
            var h = +parsed[1];
            var m = +parsed[2];
            
            //seconds/millis optional
            var s = parsed.length >= 4 ? +parsed[3] : 0;
            var ms = parsed.length >= 5 ? +parsed[4] : 0;
            
            
            $scope.displayDate = new Date(1900, 0, 1, h, m, s, ms);
        }
        else {
            $scope.displayDate = $scope.displayValue;
        }    
    });
            
  }