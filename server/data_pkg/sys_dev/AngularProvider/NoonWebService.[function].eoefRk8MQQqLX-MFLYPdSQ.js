function ($http, $q) {

    var doCall = function(conf) {
      var deferred = $q.defer();

      $http(conf).then(
        function(resp) {

          if(resp.data.error) {
            deferred.reject(resp.data.error);
          }
          else {
            deferred.resolve(resp.data);
          }
        },
        function(resp) { //An http error code was returned...
          if(resp.data.error)
            deferred.reject(resp.data.error);
          else
            deferred.reject(resp.data);
        }
      );

      return deferred.promise;
    };

    var massagePath = function(path) {
    //   if(path.indexOf('/sys/') ===0 )
    //       return path.substring(5);
    //     else
          return 'ws/'+path;
    }


    return {

      call: function(path, params) {
        return doCall({method:'GET', url:massagePath(path), params:params});
      },

      post: function(path, params, postObj) {
        return doCall({method:'POST', url:massagePath(path), params:params, data:postObj});
      }

    };

  }