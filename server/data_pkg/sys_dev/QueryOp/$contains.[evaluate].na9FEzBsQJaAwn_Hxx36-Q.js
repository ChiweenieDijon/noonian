function (expressionValue, testValue) {
    var expId = expressionValue;
    
    if(expressionValue && expressionValue._id)
        expId = expressionValue._id;
        
    if(testValue && testValue instanceof Array) {
        for(var i=0; i < testValue.length; i++) {
            if(testValue[i]._id === expId)
                return true;
        }
    }   
    return false;
}