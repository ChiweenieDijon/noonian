function ($rootScope, $http, $q, db, $state, $cookies, AuthInterceptor) {

    var currentUser = null;
    var authToken = null;
    var initPromise = false;
    
    return {
      init: function() {
        if(initPromise)
          return initPromise;
    
        console.log('initializing Auth');
        var authToken = $cookies.get('access_token');
    
        if(authToken) {
          //we have an auth token -
          // send it to auth/login webservice to retreive user data
    
          var deferred = $q.defer();
          initPromise = deferred.promise;
    
          $http.post('auth/login', {}).then(
            function(resp) {
              var responseObj = resp.data;
              if(responseObj.error) {
                deferred.reject(responseObj.error);
              }
              else {
                authToken = responseObj.token;
                AuthInterceptor.setAuthToken(authToken);
                currentUser = responseObj.user;
                deferred.resolve(true);
                $rootScope.$emit('login', currentUser);
              }
            },
            function(err) {
              var responseObj = err.data;
              if(responseObj) {
                err = responseObj.error;
              }
              deferred.reject(err);
            }
          );
    
        }
        else {
          //No auth token...
          initPromise = $q.resolve(true);
        }
    
        return initPromise;
      },
    
      login: function(username, password, remember) {
        var deferred = $q.defer();
        var paramObj = {username:username, password:password};
        $http.post('auth/login', paramObj).then(
          function(resp) {
            var responseObj = resp.data;
            if(responseObj.error) {
              deferred.reject(responseObj.error);
            }
            else {
              authToken = responseObj.token;
              AuthInterceptor.setAuthToken(authToken);
              currentUser = responseObj.user;
              deferred.resolve(true);
              $rootScope.$emit('login', currentUser);
            }
          },
          function(err) {
            var responseObj = err.data;
            if(responseObj) {
              err = responseObj.error;
            }
            deferred.reject(err);
          }
        );
    
        return deferred.promise;
      },
    
      logout: function() {
        currentUser = null;
        authToken = null;
        AuthInterceptor.setAuthToken(authToken);
        $rootScope.$emit('logout');
      },
    
      newUser: function() {
    
      },
    
      changePassword: function(newPassword) {
        var deferred = $q.defer();
        var paramObj = {password:newPassword};
        $http.post('auth/changePassword', paramObj).then(
          function(resp) {
            var responseObj = resp.data;
            if(responseObj.error) {
              deferred.reject(responseObj.error);
            }
            else {
              deferred.resolve(responseObj.result);
            }
          },
          function(err) {
            var responseObj = err.data;
            if(responseObj) {
              err = responseObj.error;
            }
            deferred.reject(err);
          }
        );
    
        return deferred.promise;
      },
    
      isLoggedIn: function() {
        return currentUser !== null;
      },
    
      getCurrentUser: function() {
        return currentUser;
      },
    
      onLogin: function(fn) {
        $rootScope.$on('login',fn);
        if(currentUser !== null) {
          fn(null, currentUser);
        }
      },
    
      onLogout: function(fn) {
        $rootScope.$on('logout',fn);
      }
    
    
    
    };
    
}