function (expressionValue, testValue) {
    //testValue is after expressionValue?
    var minusDays = +expressionValue;
    var expDate = new Date();
    
    expDate.setDate(expDate.getDate()-minusDays);
    
    var testDate = testValue;
    if(!(testDate instanceof Date)) {
        testDate = new Date(testValue);
    }
    
    return testDate.getTime() > expDate.getTime();
}