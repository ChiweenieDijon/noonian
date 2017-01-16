function (Dbui, $q, I18n) {
  return {
    templateUrl: 'dbui/reusable/core/relatedviewer.html',
    restrict: 'E',
    scope: {
      theObject: '<',
      perspectiveName: '<?',
      relatedSpec: '<'
    },

    controller:function($scope) {

      var theObject = $scope.theObject;
      var perspectiveName = $scope.perspectiveName;
      
      var className = theObject._bo_meta_data.class_name;


      if(!perspectiveName)
        perspectiveName = $scope.perspectiveName = 'default';


      $scope.labels = I18n.getBoLabelGroup(className);
      $scope.labels.$promise
      .then(function() {
          var related = $scope.relatedSpec;
          
        //Build up $scope.relatedTables[title,class,perspective]
        var perspectivePromises = [];
        for(var i=0; i < related.length; i++) {
            var usePerspective = related[i].perspective || perspectiveName;
            perspectivePromises.push(Dbui.getPerspective(usePerspective+'.related['+className+'_'+related[i].field+']', related[i].class, 'list'));
        }

        $q.all(perspectivePromises).then(function(perspectiveArr) {
          var relatedTables = $scope.relatedTables = [];
          for(var i=0; i < perspectiveArr.length; i++) {
            var r = related[i];  //class and field
            var rp = perspectiveArr[i]; //full list perspective
            
            //since we may have a cached version of the perspective from Dbui.getPerspective, 
            // we need to avoid augmenting the filter multiple times!
            if(!rp.refFilter) {
                rp.refFilter = {};
                
                //apply it to the filter that will be used by <dbui-business-object-browser> directive
                if(rp.filter) {
                    rp.filter = {$and:[rp.refFilter, rp.filter]};
                }
                else {
                    rp.filter = rp.refFilter;
                }
            }
            
            rp.refFilter[r.field+'._id'] = theObject._id;

            var label = rp.title || $scope.labels['_related_'+r.class+'_'+r.field] || r.class;
            
            relatedTables.push({
              title:label,
              class:r.class,
              perspective:rp
            });

          }


        });
      });

    }
  };
}