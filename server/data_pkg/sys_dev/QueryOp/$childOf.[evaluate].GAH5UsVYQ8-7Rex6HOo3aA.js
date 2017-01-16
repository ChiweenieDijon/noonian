function (expressionValue, testValue) {
    //is testValue a child of expressionValue ->
    // e.g. expressionValue='some.path', testValue='some.path.deeper'
    if(testValue) {
        return (''+testValue).indexOf(expressionValue) === 0;
    }
    
    return false;
}