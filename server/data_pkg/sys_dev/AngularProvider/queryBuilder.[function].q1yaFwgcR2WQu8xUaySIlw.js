function (DbuiFieldType, db) {
    return {
      templateUrl: 'dbui/reusable/core/querybuilder.html',
      restrict: 'E',
      scope: {
        boClass: '<', //The full field name -> type descriptor map (definition from BusinessObjectDef)
        onClose: '&'
      },
      require: 'ngModel',

      link: function(scope, element, attrs, ngModel) {
        

            
        var oppositeConj = {$and:'$or', $or:'$and'};

        var isCompatibleQuery = function(query) {
          //TODO: make sure query is one outer and/or containing opposite terms
          // if incompatible -> viewValue is {plainQuery:'...'}, edited w/ object editor.
        };

        var isConjunction = function(key) {
          return !!oppositeConj[key];
        };

        var getKey = function(term) {
          var keyArr = Object.keys(term);
          if(keyArr.length === 0)
            return null;
          else
            return keyArr[0];
        };

        //$formatter: query -> $viewValue
        ngModel.$formatters.push(function(queryObj) {
          // console.log('QB: formatting this query to viewValue: ', queryObj);

          if(!queryObj)
            return null;

          var outerKey = getKey(queryObj);

          if(!outerKey)
            return {};

          if(!isConjunction(outerKey)) {
            //Single term query -> one clauseGroup consisting of the solitary term
            return {clauseGroups:[[queryObj]]};
          }

          //Now we know we're dealing w/ an and/or query...
          var vv = {};
          var outerTerms = queryObj[outerKey];

          //... but are there multiple clause groups?
          var multiGroup = false;
          for(var i=0; i < outerTerms.length; i++) {
             var innerKey = getKey(outerTerms[i]);
             if(isConjunction(innerKey)) {
              multiGroup = true;
              vv.outerConj = outerKey;
              vv.innerConj = innerKey;
              break;
             }
          }

          if(!multiGroup) {
            vv.inerConj = outerKey;
            vv.outerConj = oppositeConj[outerKey];
            //outerTerms should be pulled into one clause expression:
            vv.clauseGroups = [outerTerms];
          }
          else {
            //multi group: each item in outerTerms is treated as one clauseGroup
            vv.clauseGroups = [];
            for(var i=0; i < outerTerms.length; i++) {
              var innerKey = getKey(outerTerms[i]);
              if(isConjunction(innerKey)) {
                var innerTerms = outerTerms[i][innerKey];
                vv.clauseGroups.push(innerTerms);
              }
              else {
                vv.clauseGroups.push([outerTerms[i]]);
              }
            }
          }
          // console.log('...resulting vv: ', vv);
          return vv;

        });

        //$parser: $viewValue -> query term
        ngModel.$parsers.push(function(vv) {
          // console.log('QB: parsing view value: ', vv);
          if(!vv || !vv.clauseGroups)
            return null;

          if(vv.plainQuery)
            return vv.plainQuery;

          //Single term:
          if(vv.clauseGroups.length == 1 && vv.clauseGroups[0].length == 1) {
            return vv.clauseGroups[0][0];
          }


          //Turn clauseGroups into a query!
          var query = {};
          var outerTerms = query[vv.outerConj] = [];

          for(var i=0; i < vv.clauseGroups.length; i++) {
            var clauseGroup = vv.clauseGroups[i];
            if(clauseGroup.length == 1) {
              outerTerms.push(clauseGroup[0]);
            }
            else {
              var innerClause = {};
              innerClause[vv.innerConj] = clauseGroup;
              outerTerms.push(innerClause);
            }
          }

          // console.log('...resulting query: ', outerTerms.length===1 ? outerTerms[0] : query);

          if(outerTerms.length == 1)
            return outerTerms[0]; // don't need the outer conj
          else
            return query;
        });

        //$watch: our scope -> $viewValue
        // watch via function due to complexity of watching an array of arrays...
        // this function flattens all objects in to a single array for angular to examine
        var flattenedClauseGroups = function() {
          var cg = scope.queryModel ? scope.queryModel.clauseGroups : null;
          if(!cg)
            return null;

          var flattened = [];
          for(var i=0; i < cg.length; i++) {
            for(var j=0; j < cg[i].length; j++) {
              flattened.push(cg[i][j]);
            }
          }
          return flattened;
        };

        scope.$watchCollection(flattenedClauseGroups, function() {
          var qm = scope.queryModel ? scope.queryModel: {};
          var vv = {
            outerConj:qm.outerConj,
            innerConj:qm.innerConj,
            clauseGroups:qm.clauseGroups,
            plainQuery:qm.plainQuery
          };
          // console.log('QB scope model changed; updating vv:', vv);
          ngModel.$setViewValue(vv);
        }, true );

        //$render: $viewValue -> our scope
        ngModel.$render = function() {
          // console.log('QB: rendering this viewValue to scope:',ngModel.$viewValue);
          var vv = ngModel.$viewValue;

          //WTF: Fix viewvalue - innerConj for some reason goes away when i added stateStorage to the dataTable
          if(vv.outerConj && !vv.innerConj)
            vv.innerConj = oppositeConj[vv.outerConj];
          if(vv.innerConj && !vv.outerConj)
            vv.outerConj = oppositeConj[vv.innerConj];

          scope.queryModel = ngModel.$viewValue;
        };

      },

      controller: function($scope) {
          
        DbuiFieldType.getAugmentedFieldList($scope.boClass, true, true).then(function(fieldList) {
            $scope.fieldList = fieldList;
        });
        
        var typeDescMap = db[$scope.boClass]._bo_meta_data.type_desc_map;

        var oppositeConj = {$and:'$or', $or:'$and'};
        $scope.conjLabels = {$and:'and', $or:'or'};

        //Acertain some info to create a sensible "default" query when new terms are added
        var allFields = Object.keys(typeDescMap);
        allFields.sort();
        for(var i=0; i < allFields.length; i++) {
          var td = typeDescMap[allFields[i]];
          var opList = td && DbuiFieldType.getOpList(td);
          
          if(td && allFields[i].indexOf('$') !== 0 &&
            allFields[i].indexOf('_') !== 0 && opList) {

            $scope.stubField = allFields[i];
            $scope.stubQueryClause = {};
            $scope.stubQueryClause[opList[0].op]='';
            break;
          }
        }

        var newStubQuery = function() {
          //Copy from clausegroup[0][0]
          var copyFrom = $scope.queryModel.clauseGroups[0][0];
          var stub = {};
          for(var k in copyFrom) {
            if(k.indexOf('$$') === -1)
              stub[k] = copyFrom[k];
          }
          // console.log('copy from:', copyFrom);
          // console.log('new stub query:', stub);
          return stub;
        };

        //Add a new term to a clauseGroup
        $scope.newTerm = function(clauseGroup, conj) {
          var qm = $scope.queryModel;
          if(conj) {
            qm.innerConj = conj;
            qm.outerConj = oppositeConj[conj];
          }
          clauseGroup.push(newStubQuery());
        };

        //Add a new clauseGroup to the query
        $scope.newClauseGroup = function() {
          var qm = $scope.queryModel;
          qm.clauseGroups.push([newStubQuery()]);
        };

        $scope.removeTerm = function(clauseGroup, index) {
          var cg = $scope.queryModel.clauseGroups;

          if(clauseGroup.length === 1) {
            for(var i=0; i < cg.length; i++) {
              if(cg[i] === clauseGroup) {
                cg.splice(i, 1);
                break;
              }
            }
          }
          else {
            clauseGroup.splice(index, 1);
          }

          if(cg.length === 1 && cg[0].length === 1)
            $scope.queryModel.outerConj = $scope.queryModel.innerConj = null;

          if(cg.length === 0) {
            $scope.onClose();
          }
        };


      }
    };
  }