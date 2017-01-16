function (expressionValue, testValue) {
        
    if(testValue && testValue instanceof Array) {
        for(var i=0; i < testValue.length; i++) {
            if(testValue[i] === expressionValue)
                return true;
        }
    }   
    return false;
}