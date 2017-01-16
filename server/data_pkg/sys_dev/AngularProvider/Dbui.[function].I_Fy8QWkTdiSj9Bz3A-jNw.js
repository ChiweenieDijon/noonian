function ($http, $q, $rootScope, NoonWebService,DbuiFieldType, DbuiAction, NoonI18n, db, NoonConfig) {
    
    
    /**
     * Dbui.init
     */
    this.init = function() {
        
        console.log('initializing Dbui');
        
        var instanceName = $rootScope.instanceName = 'NoonianDBUI'; 
        $rootScope.setPageTitle = function(title) {
            $rootScope.pageTitle = instanceName+(title ? ' | '+title : '');    
        };
        
        NoonConfig.getParameter('sys.instanceName').then(function(cfgName) {
            if(cfgName) {
                instanceName = $rootScope.instanceName = cfgName;
            }
        });
        
        return DbuiFieldType.init().then(DbuiAction.init);
    };
    
    /**
     * Dbui.getSidebarMenu
     */
    this.getSidebarMenu = function() {
        return NoonWebService.call('dbui/getSidebarMenu');
    };
    
    /**
     * Dbui.getNavbarMenu
     */
    this.getNavbarMenu = function() {
        return NoonWebService.call('dbui/getNavbarMenu');
    };
    
    /**
     * Dbui.stringifyQueryClause
     */
    this.stringifyQueryClause = function(queryObj, className) {
        return NoonWebService.call('dbui/stringifyQuery', {className:className, queryObj:queryObj});
    };
    
    
    var roleMap;
    /**
     * Dbui.getRoleMap
     */
    this.getRoleMap = function() {
        var deferred = $q.defer();
        
        if(roleMap) {
            deferred.resolve(roleMap);
        }
        else {
            db.Role.find({}).$promise.then(function(roles){
                roleMap = {};
                _.forEach(roles, function(r) {
                    roleMap[r._id] = r.name;
                });
                deferred.resolve(roleMap);
            });
        }
        
        return deferred.promise;
    };
    
    
    /**
     * perspective.getEffectiveQuery
     * 
     */
    var getEffectiveQuery = function() {
      var textSearch = false;

      //From the text search
      if(this.searchString) {
        textSearch = {
          "$fulltextsearch":this.searchString
        };
      }

      if(this.filter) {
        if(textSearch) {
          return {"$and":[
            textSearch,
            this.filter
          ]};
        }
        else {
          return this.filter; //Just the query
        }
      }
      else { //No query...
        return textSearch || {}; //Just text search, if it exists
      }
    };
    
    
    /**
     * Dbui.normalizeLayout
     * @private
     * convert an 'abbreviated' version of a perspective layout (e.g. simple string array of field names)
     * into 'normalized' layout (array of rows) 
     */
    var normalizeLayout = function(layout) {
      //Crete an array of subsection objects
      var result = [];
      var currSection; //refers to the section being built as we iterate

      //First pass: convert into an array of "subsection" objects
      for(var i=0; i < layout.length; i++) {
        if(angular.isObject(layout[i]) && !angular.isArray(layout[i])) {
          //it's a non-array object: defines an explicit subsection
          currSection = null; //stop appending to the current one
          result.push(layout[i]);
        }
        else {
          if(!currSection) {
            //We're not currently building a section; initialize
            currSection = {rows:[]};
            result.push(currSection);
          }
          currSection.rows.push(layout[i]);
        }
      }

      //Second pass: convert all row elements to arrays
      for(i=0; i < result.length; i++) {
        var sectionRows = result[i].rows || [];
        for(var j=0; j< sectionRows.length; j++) {
          if(!angular.isArray(sectionRows[j])) {
            sectionRows[j] = [ sectionRows[j] ];
          }
        }
      }

      return result;
    };
    
    
    var perspectiveCache = {}; //cache[name/class/type] = {...}
    
    /**
     * Dbui.getPerspective
     */
    this.getPerspective = function(name, className, type) {

      var key = name+'/'+className+'/'+type;
      
      if(perspectiveCache[key]) {
        return $q.resolve(perspectiveCache[key]);
      }
      
      return NoonWebService.call('dbui/getPerspective', {name:name, class_name:className, type:type}).then(function(persp) {
        // console.log('GetPerspective', key, persp);
        persp.getEffectiveQuery = getEffectiveQuery;
        
        var dotPos = name.indexOf('.');
        if(dotPos > -1) {
            persp.name = name.substring(0, dotPos);
        }
        else {
            persp.name = name;
        }

        if(persp.layout) {
          persp.layout = normalizeLayout(persp.layout);
        }
        
        //NormalizeLayout for composites' "sub-perspectives"

        perspectiveCache[key] = persp;
        return persp;
          
      });
      
    };
    
    var customPageCache = {};
    this.getCustomPage = function(key) {
        
        var obj = customPageCache[key];
        
        if(obj) {
            return $q.resolve(obj);
        }
        else {
            return NoonWebService.call('dbui/getCustomPage', {key:key}).then(function(resultObj) {
                if(resultObj) {
                    customPageCache[key] = resultObj;
                }
                return resultObj;
            });
        }
    };
    
      
    
    /**
     *  Used to determine which bootstrap classes should be used when 
     *  displaying forms w/ dynamic column counts
     */
    this.columnClasses = {
          top:[
            'col-md-12',
            'col-md-12',
            'col-md-6',
            'col-md-4',
            'col-md-3'
          ],
          label:[
            '',
            'col-sm-2',
            'col-sm-4',
            'col-sm-6',
            'col-sm-6'
          ],
          value:[
            '',
            'col-sm-10',
            'col-sm-8',
            'col-sm-6',
            'col-sm-6'
          ],
        };
    
}