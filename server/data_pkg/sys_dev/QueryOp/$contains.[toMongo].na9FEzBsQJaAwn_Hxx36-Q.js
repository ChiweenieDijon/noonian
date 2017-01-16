function (fieldName, clause) {
    var result = {};
    var targetId = clause;
    
    if(clause && clause._id)
        targetId = clause._id;
    
    result[fieldName+'._id'] = targetId;
    return result;
}