function (expressionValue, testValue) {
    if(testValue)
        return (''+testValue).indexOf(expressionValue) > -1;
    else
        return false;
}