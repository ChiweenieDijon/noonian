function ($q, $cookieStore, $window) {
    
  var authToken = null;

  return {

    // Intercept 401s and redirect you to login
    responseError: function(response) {
        console.log('AuthInterceptor responseError', response);
      if(response.status === 401) {
        console.log('We got a 401 response...');
        $window.location.reload(true);
        // $location.url('/login');
        return response;
        // remove any stale tokens
        // $cookieStore.remove('token');
        //return $q.reject(response);
      }
      else {
        return $q.reject(response);
      }
    },
    setAuthToken:function(newToken) {
      authToken = newToken;
      //Placing it in a cookie for the time being, to allow for <img> tags to pass auth info
      // (this auth intercepter seems to not intercept browser requests for img source,
      // therefore not setting the Authorization header ... try using ng-src attrbitue??)
      if(authToken)
        $cookieStore.put('access_token', authToken);
      else
        $cookieStore.remove('access_token');
    }
  };
}