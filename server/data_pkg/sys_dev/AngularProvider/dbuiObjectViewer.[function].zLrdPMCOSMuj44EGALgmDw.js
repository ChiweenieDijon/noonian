function ($parse, Dbui, NoonI18n) {
  return {
    templateUrl: 'dbui/reusable/core/object_viewer.html',
    restrict: 'E',
    scope: {
      theObject: '=',
      perspective: '='
    },
    
    controller: function($scope) {
      var theObject = $scope.theObject;
      var perspective = $scope.perspective;
    
      var className = theObject._bo_meta_data.class_name;
      $scope.labels = NoonI18n.getBoLabelGroup(className);
      $scope.typeDescMap = theObject._bo_meta_data.type_desc_map;
    
      $scope.colClass = Dbui.columnClasses;
    
    
      var fieldCustomizations = perspective.fieldCustomizations || {};
      var displayCheckers = {};
    
      for(var f in fieldCustomizations) {
        if(fieldCustomizations[f].conditionalDisplay) {
          displayCheckers[f] = $parse(fieldCustomizations[f].conditionalDisplay);
        }
      }
    
      $scope.shouldShow  = function(field) {
    
        var dc = displayCheckers[field];
    
        if(!dc){
          var fieldValue = theObject[field];
          if(angular.isArray(fieldValue)) {
            return fieldValue.length > 0;
          }
          else {
            return fieldValue != null;
          }
        }
        else  {
          return dc($scope.theObject);
        }
      };
    }
  };
}