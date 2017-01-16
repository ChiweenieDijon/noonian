function (fieldName, clause) {
    var ret = {};
    // var datestr = clause.toISOString ? clause.toISOString() : clause;
    ret[fieldName] = {$lte:clause};
    return ret;
    
}