function ($scope) {
    $scope.$watch('displayValue', function() {
        
        var fc = $scope.fieldCustomizations;
        var dv = $scope.displayValue;
        
        if($scope.abbreviated) {
            var maxShown = fc && fc.abbrevDisplayMax || 5;
            if(dv && dv.length > maxShown) {
                $scope.displayArr = [];
                $scope.ellipsis = true;
                
                for(var i=0; i < maxShown; i++) {
                    $scope.displayArr.push(dv[i]);
                }
                return;
            }
        }
        
        $scope.displayArr = dv;
    });
}