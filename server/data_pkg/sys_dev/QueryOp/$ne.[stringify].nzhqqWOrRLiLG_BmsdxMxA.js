function (expressionValue, typeDesc) {
    if(expressionValue && expressionValue._disp)
        return 'is not '+expressionValue._disp;
    else 
        return 'is not '+expressionValue;
}