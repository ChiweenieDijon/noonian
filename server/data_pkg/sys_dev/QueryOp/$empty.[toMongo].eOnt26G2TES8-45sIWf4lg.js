function (fieldName) {
    var ret = {$or:[]};
    
    var innerClause = {};
    innerClause[fieldName] = {$exists:false};
    ret.$or.push(innerClause);
    
    innerClause = {};
    innerClause[fieldName] = null;
    ret.$or.push(innerClause);
    
    innerClause = {};
    innerClause[fieldName] = {$size:0};
    ret.$or.push(innerClause);
    
    return ret;
}