function ($timeout, $q, db, NoonI18n, DbuiAction, NoonConfig, Dbui) {
  return {
    templateUrl: 'dbui/reusable/core/object_treelist.html',
    restrict: 'E',
    scope: {
      boClass: '=',
      perspective: '='
    },
    
    controller: function($scope) {
        
          var collapse = function() {
            this.expanded = false;
        
            if(this.children) {
              for(var i=0; i < this.children.length; i++) {
                this.children[i].collapse();
              }
            }
          };
        
          var createPathElements = function(prefix, indent, parent, prefixMap, elemArray) {
            var infoObj = prefixMap[prefix];
        
            var pathPieces = prefix.split($scope.pathSeperator);
        
            //First push my row...
            var me = {disp:pathPieces[pathPieces.length-1], prefix:prefix, count:infoObj.count, indent:indent, parent:parent, collapse:collapse};
            elemArray.push(me);
        
            //... then my children
            if(infoObj.children) {
              me.children = [];
              for(var i=0; i < infoObj.children.length; i++) {
                var child = infoObj.children[i];
                me.children.push(
                  createPathElements(child, indent+1, me, prefixMap, elemArray)
                );
              }
            }
        
            return me;
        
          };
        
          $scope.filterDef = {};
          $scope.labels = I18n.getLabelGroup('sys.dbui.bo.'+$scope.boClass);
        
          $scope.$watch('perspective', function() {
            if(!$scope.perspective) return;
        
        
            var boClass = $scope.boClass;
            var perspective = $scope.perspective;
        
            Dbui.prepareScope($scope, perspective);
        
            $scope.dispFields = perspective.fields;
            $scope.pathField = perspective.pathField;
            $scope.viewField = perspective.viewField;
        
            $scope.typeDescMap = db[boClass]._meta.type_descriptor;
            $scope.pathSeperator = $scope.typeDescMap[$scope.pathField].seperator || '/';
        
        
            // if(perspective.filter) {
            //   $scope.filterDef.query = perspective.filter;
            // }
        
            // if(perspective.recordActions) {
            //   var recordActions = $scope.recordActions = [];
            //   if(perspective.recordActions) {
            //     for(var i=0; i < perspective.recordActions.length; i++) {
            //       var a = perspective.recordActions[i];
            //       if(angular.isString(a))
            //         recordActions.push(Dbui.getCoreActionDef(a));
            //       else
            //         recordActions.push(a);
            //     }
            //   }
            // }
        
            Dbui.getAggregatePaths($scope.boClass, $scope.pathField, $scope.filterDef.query).then(function(prefixMap) {
              var pathSep = $scope.pathSeperator;
        
              var pathElems = $scope.pathElements = [];
        
              var prefixes = Object.keys(prefixMap);
              prefixes.sort();
        
              //The top-level at the root
              var rootNode = {expanded:true};
              for(var i=0; i < prefixes.length; i++) {
                if(prefixes[i].indexOf(pathSep) === -1) {
                  createPathElements(prefixes[i], 0, rootNode, prefixMap, pathElems);
                }
              }
        
              // console.log(pathElems);
            });
        
          }); //end $watch perspective
        
          $scope.toggleCollapse = function(elemObj) {
            if(elemObj.expanded)
              elemObj.collapse();
            else {
              elemObj.expanded = true;
        
              if(!elemObj.loaded) {
                elemObj.loaded = true;
                var dbModel = db[$scope.boClass];
        
                var queryObj = {where:{}};
                queryObj.where[$scope.pathField] = elemObj.prefix;
                if($scope.perspective.sort) {
                  queryObj.sort = $scope.perspective.sort;
                }
                dbModel.query(queryObj).$promise.then(function(results) {
                  if(results && results.length > 0) {
                    var newSection = [];
                    for(var i=0; i < results.length; i++) {
                      newSection.push(
                        {disp:results[i]._disp, indent:elemObj.indent+1, parent:elemObj, bo:results[i]}
                      );
                    }
        
                    var elemArr = $scope.pathElements;
                    var targetIndex = -1;
                    for(i=0; i < elemArr.length; i++) {
                      if(elemArr[i] === elemObj) {
                        targetIndex = i;
                        break;
                      }
                    }
                    var spliceFn = elemArr.splice.bind(elemArr, targetIndex+1, 0);
                    spliceFn.apply(elemArr, newSection);
        
                  }
                });
              }
            }
        
          }
        
          $scope.getFieldLabel = function(f) {
            if($scope.labels && $scope.labels[f])
              return $scope.labels[f];
            return f;
          };
        
          $scope.invokeAction = function(actionObj, recordObj) {
            Dbui.invokeAction(actionObj, $scope.boClass, recordObj);
          };

    }
  };
}