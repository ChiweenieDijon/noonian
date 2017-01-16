function ($parse, $http) {
    return {
      restrict: 'A',
      link: function(scope, element, attrs) {
        var model = $parse(attrs.attachmentUploader);
        var modelSetter = model.assign;

        scope.initiateUpload = function() {
          element.click();
        }

        element.bind('change', function() {
          scope.$apply(function() {
            //A file has been selected

            var file = element[0].files[0];

            var metaObj = {
              filename:file.name,
              size:file.size,
              type:file.type
            };

            var fd = new FormData();
            fd.append('metadata', JSON.stringify(metaObj));
            fd.append('file', file);

            scope.uploading = true;

            var httpConfig = {
              transformRequest: angular.identity,
              headers: {'Content-Type': undefined}
            };

            var uploadWs = 'attachment_ws/upload';
            if(scope.typeDesc.mode) {
              uploadWs += '?mode='+scope.typeDesc.mode+'&resource_path='+(scope.typeDesc.resource_path || '');
            }

            $http.post(uploadWs, fd, httpConfig)
            .then(function(result) {
              scope.uploading = false;

              modelSetter(scope, result.data.result);
            },
            function(err) {
              console.log(err);
            });
          });
        });

        scope.clearFile = function() {
          element[0].value = '';
        }
      }
    };
  }