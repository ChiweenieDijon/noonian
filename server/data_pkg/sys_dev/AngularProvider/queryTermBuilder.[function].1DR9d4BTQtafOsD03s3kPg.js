function (DbuiFieldType, db, $timeout) {
    return {
      templateUrl: 'dbui/core/helper/querybuilder_term.html',
      restrict: 'E',
      scope: {
        fieldList: '<' //the augmented field list from Dbui.getAugmentedFieldList
      },
      require: 'ngModel',

      link: function(scope, element, attrs, ngModel) {

        //viewValue: {field:'name_of_field.possiblydotted', op:{op:'$someOp', ...}, value:'value from fieldeditor'}
        //modelValue: a valid mongo query term, e.g.
        //  {'field':{$op:'value'}}  <-- returned from DbuiTypeService

        var retainHashKey = function(src, dest) {
          //WTF: Retain $$hashKey so iteration in QueryBuilder template doesn't throw into an infinite format/parse loop!
          if(src && src.$$hashKey)
            dest.$$hashKey = src.$$hashKey;
        };


        //Turn a {'field':{'$op':'value'}} "queryClause" into a {fieldInfo:..., opInfo:..., value:'value'} "flattened" clause
        var flattenQueryClause = function(queryClause) {
            
            var fieldList = scope.fieldList;
            
            var term = {};
            
            for(var fieldSelector in queryClause) {
                //Scan past any junk:
                if(fieldSelector.indexOf('$$') === 0) { //if the incoming query is on a $scope, it gets a $$hashkey key.
                    continue;
                }
                
                var dotPos = fieldSelector.indexOf('.');
                var fieldBase = false;
                if(dotPos > -1) {
                    fieldBase = fieldSelector.substring(0, dotPos+1);
                }
                
                //Scan through fieldList to find matching fieldInfo
                for(var i=0; i < scope.fieldList.length; i++) {
                    var fi = scope.fieldList[i];
                    if(fi.fieldName === fieldSelector) {
                        term.fieldInfo = fi;
                    }
                    else if(fieldBase && fi.refPlaceholder && fi.fieldName === fieldBase) {
                        fi.expand();
                        i--;
                    }
                }
                
                var opArray = Object.keys(queryClause[fieldSelector]);
                
                if(opArray.length > 1)
                    console.log("WARNING: multi-condition clause being linked to a single queryTermBuilder!!!");
                    
                    if(opArray.length > 0) {
                        term.opInfo = DbuiFieldType.getOpInfo(term.fieldInfo.td, opArray[0]);
                        term.value = queryClause[fieldSelector][opArray[0]];
                    }
                    
                    break;
            }
            
            return term;
        };

        //$formatter: query term -> $viewValue
        ngModel.$formatters.push(function(queryClause) {
          // console.log('TB: formatting this clause to viewValue:', queryClause);


          var newViewValue = queryClause ? flattenQueryClause(queryClause) : {};
          // console.log('TB: heres what it came up with: ', newViewValue);

          retainHashKey(queryClause, newViewValue);

          return newViewValue;

        });

        //$parser: $viewValue -> query term
        ngModel.$parsers.push(function(viewValue) {
          // console.log('TB: parsing this viewValue into a clause:', viewValue);

          if(!viewValue || !viewValue.fieldInfo || !viewValue.opInfo)
            return null;

          var fieldName = viewValue.fieldInfo.fieldName;
          var op = viewValue.opInfo.op;
          var value = viewValue.value;

          //Unflatten viewValue: {'field':{'$op':'the value'}}
          var queryClause = {};
          queryClause[fieldName] = {};
          queryClause[fieldName][op] = value !== undefined ? value : true;


          retainHashKey(viewValue, queryClause);

          return queryClause;

        });

        //$watch: our scope -> $viewValue
        // ***it's important to watch ALL of scope that affects ngModel in a single expression;
        //  otherwise, you may get competing $setViewValue calls that stomp on one another
        // ***also important: don't assign the scope object directly as the view value!
        scope.$watch('term', function() {
          //When any part of the term changes ('true' param below is deep watch)
          //  replace the viewValue object with a new object
          var term = scope.term;
          var newViewValue = {fieldInfo:term.fieldInfo, opInfo:term.opInfo, value:term.value};
          retainHashKey(term, newViewValue);
          // console.log('TB: scope watch invoked -> setting view value: ', newViewValue);

          ngModel.$setViewValue(newViewValue);
        }, true );

        //$render: $viewValue -> our scope
        ngModel.$render = function() {
          // console.log('TB: rendering this viewValue to scope:', ngModel.$viewValue);
          //scope object can refer directly to the ngModel viewValue (just not the other way around!)

          var term = scope.term = ngModel.$viewValue;
          // console.log("rendering ", term);
          //Make sure UI elements are synced up to this view value:
          scope.fieldChanged(term.fieldInfo, false);
        };

      },

      controller:function($scope) {
        console.log($scope.fieldList);
        $scope.fieldChanged = function(fieldInfo, resetValue) {
            console.log('fieldChanged', fieldInfo, resetValue);
            
          if(fieldInfo.refPlaceholder) {
            return fieldInfo.expand();
          }

          $scope.fieldSelectorOpen = false;

          var term = $scope.term;
          term.fieldInfo = fieldInfo;

          //Update the OpList so that the op selector shows the appropriate ops for this field type:
          if(fieldInfo && fieldInfo.td) {
            var opList = $scope.opList = DbuiFieldType.getOpList(fieldInfo.td);
            
            //Make sure the term.opInfo is valid...
            var foundIt = false;
            var currOp = term.opInfo ? term.opInfo.op : null;
            for(var i=0; i < opList.length; i++) {
              if(opList[i].op === currOp) {
                foundIt = true;
                term.opInfo = opList[i];
                break;
              }
            }
            if(!foundIt) {
              term.opInfo = opList[0];
            }
            $scope.opChanged(resetValue);
          }

          if(resetValue)
            $scope.term.value = undefined;
        };

        var fundamentalTypeDesc = function(td) {
          return td instanceof Array ? td[0] : td;
        };

        $scope.opChanged = function(resetValue) {
           console.log('opChanged invoked', resetValue);
          var term = $scope.term;
          var opInfo = term.opInfo;

          if(opInfo) {

            var currType = $scope.fieldEditorTypeDesc ? $scope.fieldEditorTypeDesc.type : false;
            
            
            //If the op requires a specific editor, set the scope's typeDesc so that it is used...
            if(typeof opInfo.editor === 'boolean')
              $scope.fieldEditorTypeDesc = fundamentalTypeDesc(term.fieldInfo.td);
            else //editor is a typedesc object
              $scope.fieldEditorTypeDesc = opInfo.editor;
            
            // if(currType !== $scope.fieldEditorTypeDesc.type) {
                // $scope.fieldEditorVisible = false;
            // }
              

            //Nullify term value if type changed
            if(resetValue && ($scope.fieldEditorTypeDesc.type !== currType || !opInfo.editor)) {
              $scope.term.value = undefined;
            }
            
            //Coax angular into destroying the fieldEditor directive so it can be rebuilt using the new fieldEditorTypeDesc
            $scope.fieldEditorVisible = false;
            $timeout(function() {
                $scope.fieldEditorVisible = $scope.fieldEditorTypeDesc && $scope.term.opInfo && $scope.term.opInfo.editor;
            });
          }
        }



      }
    };
  }