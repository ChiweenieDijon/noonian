function (expressionValue, testValue) {
    var expId = expressionValue;
    var testId = testValue;
    
    if(expressionValue && expressionValue._id)
        expId = expressionValue._id;
    if(testValue && testValue._id)
        testId = testValue._id;
        
    return expId !== testId;
}