function () {
    var persp = this.perspectiveObj;
    
    var url='export/Vs_E0HrSSk6_aNtNUvexaw/'+this.className+'?';
    var queryStr = null;
    
    var select = persp.fields;
    var where = persp.filter;
    var sort = persp.sort;
    
    var appendToQueryStr = function(str) {
        queryStr = queryStr ? queryStr+'&'+str : str;
    }
    
    if(persp.fields) {
        appendToQueryStr('fields='+angular.toJson(persp.fields));
        
        var selectObj = {};
        for(var i=0; i < persp.fields.length; i++) {
          var f = persp.fields[i];
          selectObj[f] = 1;
        }
        appendToQueryStr('select='+angular.toJson(selectObj));
    }
    
    if(persp.filter || persp.searchString) {
        appendToQueryStr('where='+angular.toJson(persp.getEffectiveQuery()));
    }
    
    if(persp.sort) {
        appendToQueryStr('sort='+angular.toJson(persp.sort));
    }
    

    window.open(url+queryStr);
}