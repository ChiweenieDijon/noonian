function ($scope, NoonAuth, NoonConfig) {
    
    $scope.submitChange = function() {
        
        NoonAuth.changePassword($scope.pw).then(function(result) {
            if(result == 'success') {
                $scope.message = 'Password successfully changed';
                $scope.messageClass = 'alert-success';
                $scope.pw = $scope.pwConfirm = '';
            }
            else if(result == '$complexity_requirements') {
                $scope.messageClass = 'alert-danger';
                $scope.message = "Your password does not meet complexity requirements.";
                NoonConfig.getParameter('sys.password_complexity').then(function(spec) {
                     $scope.complexityRequirements = spec.description;
                });
            }
            else {   
                $scope.message = result;
                $scope.messageClass = 'alert-danger';
            }
        },
        function(err) {
            alert(err);
            $scope.message = err;
            $scope.messageClass = 'alert-danger';
        });
    };
    
    $scope.disableSumbit = function () {
        return !$scope.pw || ($scope.pw != $scope.pwConfirm);
    }
}