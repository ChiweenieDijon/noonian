function (expressionValue, testValue) {
    //testValue is before expressionValue?
    var expDate = new Date(expressionValue);
    var testDate = testValue;
    if(!(testDate instanceof Date)) {
        testDate = new Date(testValue);
    }
    
    return testDate.getTime() < expDate.getTime();
}