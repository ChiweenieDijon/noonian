function (Dbui, I18n) {
  return {
      
    templateUrl: 'dbui/reusable/core/object_editor.html',
    
    restrict: 'E',
    scope: {
      theObject: '=',  //Object being displayed (a model instance from datsource)
      perspective: '='
    },
    
    controller:function($scope, $parse) {

      var theObject = $scope.theObject;
      var perspective = $scope.perspective;

      var className = theObject._bo_meta_data.class_name;

      $scope.labels = I18n.getBoLabelGroup(className);
      $scope.typeDescMap = theObject._bo_meta_data.type_desc_map;


      $scope.colClass = Dbui.columnClasses;

      //Set up getter/setter function with ngModel;
      // allows us to have dotted subfields in the layout,
      // resulting in editable subfields
      var getterSetterFn = function(fieldName, value) {

        if(arguments.length > 1) {
          //called as setter
          // console.log('setter!!!!!!!', fieldName, value);
          _.set(theObject, fieldName, value);
        }

        return _.get(theObject, fieldName);

      };

      var getterSetter = $scope.getterSetter = {};

      //Traverse the normalized layout: section -> rows -> field names
      _.forEach(perspective.layout, function(section) {
        _.forEach(section.rows, function(row) {
          for(var i=0; i < row.length; i++) {
            var f = row[i];
            getterSetter[f] = getterSetterFn.bind(null, f);
          }
        });
      });


      var fieldCustomizations = perspective.fieldCustomizations || {};
      var displayCheckers = {};

      for(var f in fieldCustomizations) {
        if(fieldCustomizations[f].conditionalDisplay) {
          displayCheckers[f] = $parse(fieldCustomizations[f].conditionalDisplay);
        }
      }

      $scope.shouldShow  = function(field) {
          if(!$scope.getTypeDesc(field)) {
              return false;
          }
          var dc = displayCheckers[field];
          if(!dc) {
              return true;
          }
          else {
              return dc($scope.theObject);
          }
      };
      
      var tdCache = {};
      $scope.getTypeDesc = function(field) {
          if(!tdCache[field]) {
              tdCache[field] = $scope.typeDescMap.getTypeDescriptor(field);
          }
          
          return tdCache[field];
      };

    }
  };
}