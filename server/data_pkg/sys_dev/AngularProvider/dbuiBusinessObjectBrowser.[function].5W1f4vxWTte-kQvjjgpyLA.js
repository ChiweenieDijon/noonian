function ($timeout, $q, db, NoonI18n, DbuiAction, Config,  Dbui, DbuiPerspectiveEditor, $stateParams, DbuiFieldType, DbuiAlert) {
  return {
    templateUrl: 'dbui/reusable/core/object_browser.html',
    restrict: 'E',
    scope: {
      boClass: '<',
      perspective: '<',
      enableSearch: '<?',
      enableQuery: '<?'
    },
    
    
    controller:function($scope) {
        
        var specialTableActions = {
            edit_perspective:{
                label:'Edit Perspective',
                icon:'fa-list-alt',
                fn: function(args) {
                    return DbuiPerspectiveEditor.showEditorDialog($scope.boClass, $scope.perspective, 'list').then($scope.loadData);
                }
            },
            refresh_data:{
                label:'Refresh Data',
                icon:'fa-refresh',
                fn: function(args) {
                    $scope.loadData();
                }
            }
        };
        
        /**
         * @private
         * Create a "stub" query for typeDescMap
         */
        var createStubQuery = function() {
            var typeDescMap = $scope.typeDescMap;
            var fieldName = $scope.perspective.fields[0];
            var td = $scope.typeDescMap[fieldName];
            
            
            var stub = {};
            
            var opList = DbuiFieldType.getOpList(td);
            if(opList && opList.length) {
                stub[fieldName] = {};
                stub[fieldName][opList[0].op] = '';
                return stub;
            }
            else {
                //The passed-in field isn't searchable; so we'll pick another:
                for(var field in typeDescMap) {
                    td = typeDescMap[field];
                    opList = DbuiFieldType.getOpList(td);
                    if(opList && opList.length) {
                        stub[field] = {};
                        stub[field][opList[0].op] = '';
                        return stub;   
                    }
                }
            }
        };
        
        var className = $scope.boClass;
        var perspective = $scope.perspective;
        
        var BoModel = db[className];
        $scope.objectMetaData = BoModel._bo_meta_data;
        $scope.typeDescMap = BoModel._bo_meta_data.type_desc_map;
        $scope.labels = NoonI18n.getBoLabelGroup(className);
        
        
        $scope.dataArray = [];
        
        
        if(perspective.recordActions) {
            perspective.recordActions = DbuiAction.unaliasActionList(perspective.recordActions);
        }
        
        if(perspective.tableActions) {
            perspective.tableActions = DbuiAction.unaliasActionList(perspective.tableActions, specialTableActions);
        }
        
        if(!perspective.sort) {
            perspective.sort = {};
        }
        
        if(!perspective.pageState) {
            
            perspective.pageState = {
                current:1,
                pageSize:10,
                totalRecords:0
            };
            
            Config.getParameter('sys.dbui.defaultPageSize').then(function(defaultPageSize) {
                perspective.pageState.pageSize = defaultPageSize;
            });
            
        }
        
        $scope.pageState = perspective.pageState;
        
        
        var searchPromise = null;
        var loadData = $scope.loadData = function() {
            
            if(searchPromise) {
                $timeout.cancel(searchPromise);
                searchPromise = null;
            }
            
            var pageSize = perspective.pageState.pageSize;
            var currPage = perspective.pageState.current;  //Bound to paginator
        
            var sort = perspective.sort;
            
            var queryDef = perspective.getEffectiveQuery();
            var selectObj = {}; //aka projection
            
            //Ask only for the fields we're showing
            for(var i=0; i <  perspective.fields.length; i++) {
                var f = perspective.fields[i];
                selectObj[f] = 1;
            }
        
            //Query options: limit, skip, sort, group-by
            var queryOpts = {limit:pageSize};
            if(currPage > 1) {
                queryOpts.skip = (currPage-1)*pageSize;
            }
            
            if(sort) {
                queryOpts.sort = sort;
            }
            
            if(perspective.groupBy) {
                queryOpts.groupBy = perspective.groupBy;
            }
            
            var stringifyPromise = queryDef ? Dbui.stringifyQueryClause(queryDef, className) : $q.resolve('');
            
            //Do the query!
            $scope.dataLoading = true;
            var resultList = BoModel.find(queryDef, selectObj, queryOpts);
            
            $scope.dataArray = resultList;
            $q.all([resultList.$promise, $scope.labels.$promise, stringifyPromise])
            .then( function(resultArr) {
                $scope.dataLoading = false;
                
                var result = resultArr[0];
                if(perspective.groupBy) {
                    var groupByField = perspective.groupBy;
                    var dataArray = [];
                    for(var i =0; i < result.length; i++) {
                        result[i].__group_header = true;
                        result[i][groupByField] = result[i].group[0][groupByField]; //copy the full value from the first member of the group
                        dataArray.push(result[i]);
                        
                        for(var j=0; j < result[i].group.length; j++) {
                            dataArray.push(result[i].group[j]);
                        }
                    }
                    
                    $scope.dataArray = dataArray;
                }
                
                $scope.filterDescription = resultArr[2];
                
                var pageState = perspective.pageState;
                pageState.totalRecords = result.nMatched; //result._meta.nMatched;
                pageState.totalPages = Math.ceil(pageState.totalRecords/pageState.pageSize);
                pageState.rangeStart = pageState.pageSize * (pageState.current - 1) + 1;
                
                var rangeEnd = pageState.rangeStart + pageState.pageSize - 1;
                if(rangeEnd > pageState.totalRecords) {
                    pageState.rangeEnd = pageState.totalRecords;
                }
                else {
                    pageState.rangeEnd = rangeEnd;
                }
            },
            function(err) {
                $scope.dataLoading=false;
                console.error('DATA RETRIEVE ERROR:', err);
                DbuiAlert.danger('Error retrieving data (see log) ');
            });
        };
        
        $scope.pageChanged = loadData; //Called by paginator event
        
        $scope.searchStringChanged = function() {
            if(searchPromise) {
                $timeout.cancel(searchPromise);
            }
            
            //execute search half a second after search string stops changing
            var ss = perspective.searchString;
            
            if(ss != null && (ss.length >= 3 || ss === '')) {
                searchPromise = $timeout(loadData, 500);
            } 
        };
        
        $scope.advancedSearch = function(enable) {
            perspective.isAdvancedSearch = enable;
            
            //If we switch to advanced search, and we don't have a searchQuery already on the scope,
            // initialize with a stub query
            if(enable) {
                if(!perspective.filter) {
                    perspective.filter = createStubQuery();
                }
                
                perspective.searchString = '';
            }
            
            if(!enable) {
                perspective.filter = null;
                loadData();
            }
        };
        
        $scope.execSearch = function() {
            loadData();
        };
        
        //The config object for the dbui-object-table:
        $scope.objectTableConfig = {
            cellEdit: false,
            onSort: loadData,
            aliasActions:specialTableActions
        };
        
        //Do the initial data load:
        loadData();

    }
  }
}