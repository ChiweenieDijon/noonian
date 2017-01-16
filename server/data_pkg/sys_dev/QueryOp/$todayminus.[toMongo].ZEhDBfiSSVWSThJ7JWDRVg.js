function (fieldName, clause) {
    var minusDays = +clause;
    var d = new Date();
    
    d.setDate(d.getDate()-minusDays);
    
    var ret = {};
    var parsed = /(\d{4}-\d{2}-\d{2}).*/.exec(d.toISOString());
    if(parsed && parsed[1]) {
        var day = parsed[1];
        
        ret[fieldName] = {$gte:day};
    }
    
    return ret;
}