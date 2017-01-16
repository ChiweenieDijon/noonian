function () {

      var URL = window.URL || window.webkitURL;

      var getResizeArea = function () {
          var resizeAreaId = 'fileupload-resize-area';

          var resizeArea = document.getElementById(resizeAreaId);

          if (!resizeArea) {
              resizeArea = document.createElement('canvas');
              resizeArea.id = resizeAreaId;
              resizeArea.style.visibility = 'hidden';
              document.body.appendChild(resizeArea);
          }

          return resizeArea;
      };

      var resizeImage = function (origImage) {
          var maxHeight = 300;
          var maxWidth = 250;

          var canvas = getResizeArea();

          var height = origImage.height;
          var width = origImage.width;

          // calculate the width and height, constraining the proportions
          if (width > height) {
              if (width > maxWidth) {
                  height = Math.round(height *= maxWidth / width);
                  width = maxWidth;
              }
          } else {
              if (height > maxHeight) {
                  width = Math.round(width *= maxHeight / height);
                  height = maxHeight;
              }
          }

          canvas.width = width;
          canvas.height = height;

          //draw image on canvas
          var ctx = canvas.getContext('2d');
          ctx.drawImage(origImage, 0, 0, width, height);

          return canvas.toDataURL('image/jpg', 0.7);
      };

      return {
          restrict: 'A',
          scope: {
              imageData: '=',
              resizeMaxHeight: '@?',
              resizeMaxWidth: '@?',
              resizeQuality: '@?',
              resizeType: '@?',
          },
          link: function postLink(scope, element, attrs, ctrl) {

              element.bind('change', function (evt) {
                //'change' event triggered when a file is selected.

                  var files = evt.target.files;
                  if(files.length > 0) {
                    var theFile = scope.file = files[0];

                    var imgObj = {
                      name: theFile.name,
                      type: theFile.type
                    };

                    //Transform it to data url; put it into our imgObj
                    var reader = new FileReader();
                    reader.onload = function (e) {
                        imgObj.data = e.target.result;
                    };
                    reader.readAsDataURL(theFile);

                    //Create the thumbnail
                    var image = new Image();

                    image.onload = function() {
                        var dataURL = resizeImage(image);
                        imgObj.thumbData = dataURL;
                        scope.$apply(function(){
                          scope.imageData = imgObj;
                        });
                    };
                    image.src = URL.createObjectURL(theFile); //Special way of addressing in-memory objects
                  }
              });
          }
      };
  }