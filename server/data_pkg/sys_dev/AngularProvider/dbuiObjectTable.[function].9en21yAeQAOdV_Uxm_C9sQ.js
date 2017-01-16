function (DbuiAction, NoonI18n) {
  return {
    templateUrl: 'dbui/reusable/core/object_table.html',
    restrict: 'E',
    scope: {
      perspective: '<',
      objectMetaData: '<',
      config: '<?'
    },
    require: 'ngModel',


    link: function(scope, element, attrs, ngModelCtrl) {

      //Sync up an objectArray on the scope with ng-model binding.

      //$formatter: formats ng-model value -> $viewValue
      ngModelCtrl.$formatters.push(function(modelValue){
        // console.log('ObjectTable: formatting viewValue',modelValue);
        //We can transform the ng-model value to something we use internally
        return {vv:modelValue};
      });

      //$parser: parses $viewValue -> ng-model value
      ngModelCtrl.$parsers.push(function(viewValue){
        // console.log('ObjectTable: parsing viewValue', viewValue);
        //Transform internal value to what ultimately gets assigned to the ng-model value
        return viewValue.vv;
      });

      //$watch: our scope -> $viewValue
      scope.$watch('objectArray', function() {
        //replace the viewValue object:
        ngModelCtrl.$setViewValue({vv:scope.objectArray});
      }, true); //deep watch

      //$render: $viewValue -> our scope
      ngModelCtrl.$render = function() {
        // console.log('ObjectTable: rendering viewValue to scope:', ngModelCtrl.$viewValue);
        //scope object can refer directly to the ngModel viewValue (just not the other way around!)
        scope.objectArray = ngModelCtrl.$viewValue.vv;
      };
    },
    
    
    controller: function ($scope) {
        
        var perspective = $scope.perspective;
        var objectMetaData = $scope.objectMetaData;
        var config = $scope.config || {};
        
        $scope.labels = NoonI18n.getBoLabelGroup(objectMetaData.class_name);
        
        
        
        
        //////////////////////////////////////////
        //Data Accessors
        //////////////////////////////////////////
        
        $scope.getValue = function(dataObj, field) {
            return _.get(dataObj, field);
        };
        
        $scope.getTypeDesc = function(field) {
            return objectMetaData.type_desc_map.getTypeDescriptor(field);
        };
        
        $scope.getFieldLabel = function(field) {
            var labels = $scope.labels;
            
            if(labels) {
                return (labels._abbreviated && labels._abbreviated[field]) || labels[field] || field;
            }
        
            return fieldName;
        };
        
        //////////////////////////////////////////
        // Column Sort/Group
        //////////////////////////////////////////
        //TODO sync up to the inital sort definition...
        
        $scope.allowSort = !!config.onSort;
        var columnDecorations = $scope.columnDecorations = {};
        
        var sortSeq = {
            asc:'desc',
            desc:'none',
            none:'asc'
        };
        
        var decorationMap = {
            asc:'fa-chevron-circle-down',
            desc:'fa-chevron-circle-up',
            none:''
        }
        
        if(perspective.sort) {
            var sd = perspective.sort;
            var sortFields = Object.keys(sd);
            for(var i=0; i < sortFields.length; i++) {
                var f = sortFields[i];
                columnDecorations[f] = decorationMap[sd[f]];
            }
        }
        
        if(config.onSort && !perspective.sort) {
            perspective.sort = {};
        }
        
        
        $scope.colHeaderClick = function($event, field) {
            var appendTerm = $event.shiftKey;
            var sd = perspective.sort;
            var currSortField = sd[field];
        
            if(!appendTerm) {
                var sortFields = Object.keys(sd);
                for(var i=0; i < sortFields.length; i++) {
                    var f = sortFields[i];
                    delete sd[f];
                    delete columnDecorations[f];
                }
            }
            
            if(currSortField) {
                sd[field] = sortSeq[currSortField];
            }
            else {
                sd[field] = sortSeq.none;
            }
            
            columnDecorations[field] = decorationMap[sd[field]];
        
            if(sd[field] === 'none') {
                delete sd[field];
            }
        
            if($scope.perspective.groupBy === field) {
                $scope.perspective.groupBy = null;
            }
            
            config.onSort();
        };
        
        
        $scope.colHeaderRightClick = function($event, field) {
            if(perspective.groupBy === field) {
                perspective.groupBy = null;
                columnDecorations[field] = '';
            }
            else {
                perspective.groupBy = field;
                columnDecorations[field] = 'fa-clone';
            }
            
            config.onSort();
        };
        
        
        
        //////////////////////////////////////////
        // Cell edit
        //////////////////////////////////////////
        
        var globalCellEdit = (config.cellEdit === true);
        var fieldSpecificEdit = config.cellEdit || {};
        
        var allowEdit = $scope.allowEdit = function(field) {
            return globalCellEdit || fieldSpecificEdit[field];
        };
        
        var editing = {};
        $scope.editing = function(obj, field) {
            return obj.$$hashKey === editing.item && field === editing.field;
        };
        
        $scope.cellClicked = function(obj, field) {
            if(allowEdit(field)) {
                editing = {
                    item:obj.$$hashKey,
                    field:field
                };
            }
        };
        
        
        //////////////////////////////////////////
        // Action invocatation: used for tableActions, recordActions
        //////////////////////////////////////////
        
        //Pull together recordActions and tableActions
        var specialActions = config.aliasActions || {};
        
        $scope.recordActions = config.recordActions || [];
        if(perspective.recordActions) {
            $scope.recordActions = DbuiAction.unaliasActionList($scope.recordActions.concat(perspective.recordActions), specialActions);
        }
        
        $scope.tableActions = config.tableActions || [];
        if(perspective.tableActions) {
            $scope.tableActions = DbuiAction.unaliasActionList($scope.tableActions.concat(perspective.tableActions), specialActions);
        }
        
        $scope.invokeRecordAction = function(dataObj, action, index) {
            //attach extra action "base parameters" from actionConfig 
            var params = {index:index, className:objectMetaData.class_name};
            if(config.baseParams) {
                _.assign(params, config.baseParams);
            }
            
            
            //Invoke via DbuiAction, including 'index' parameter
            return DbuiAction.invokeAction(perspective, dataObj, action, params);
        };
        
        $scope.invokeTableAction = $scope.invokeRecordAction.bind(null, null);
        
    }
  }
}