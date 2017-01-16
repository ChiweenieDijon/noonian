function (expressionValue, typeDesc) {
    if(expressionValue && expressionValue._disp)
        return '= '+expressionValue._disp;
    else 
        return '= '+expressionValue;
}