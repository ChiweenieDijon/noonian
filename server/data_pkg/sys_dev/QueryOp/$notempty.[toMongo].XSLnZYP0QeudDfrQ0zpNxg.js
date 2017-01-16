function (fieldName) {
    var ret = {$and:[]};
    
    var innerClause = {};
    innerClause[fieldName] = {$exists:true};
    ret.$and.push(innerClause);
    
    innerClause = {};
    innerClause[fieldName] = {$ne:null};
    ret.$and.push(innerClause);
    
    innerClause = {};
    innerClause[fieldName] = {$not:{$size:0}};
    ret.$and.push(innerClause);
    
    return ret;
}