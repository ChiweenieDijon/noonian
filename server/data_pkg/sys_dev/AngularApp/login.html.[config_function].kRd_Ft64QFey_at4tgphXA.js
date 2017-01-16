function ($controllerProvider, $locationProvider) {
    
    $locationProvider.html5Mode(true);
    
    $controllerProvider.register('LoginController', function($scope, $http, $location, $window) {
        console.log('LoginController');
        
        document.cookie = 'access_token=; expires=Thu, 01 Jan 1970 00:00:01 GMT;';
        
        $scope.message = "Please enter username and password below";
        $scope.postData = {};
        
        var urlParams = $location.search();
        
        
        $scope.submit = function() {
            
            $http({
                method:'POST',
                url:'auth/login',
                data:$scope.postData
            }).then(
                //Success:
                function(resp) {
                    console.log('Login response: ', resp);
                    var redirectLink = (urlParams && urlParams.originalUrl) || '.';
                    $window.location.href = redirectLink;
                },
                //ERROR
                function(resp) {
                    console.log('ERROR', resp);
                    if(resp.data && resp.data.error === '$invalid_credentials') {
                        $scope.message = 'Invalid login credentials.  Please try again.';
                    }
                    else {
                        $scope.message = (resp.data && resp.data.error) || resp.statusText
                    }
                }
            );
            
        }
    })
}