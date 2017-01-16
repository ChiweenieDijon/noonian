function (expressionValue) {
    if(expressionValue && expressionValue._disp)
        return 'contains '+expressionValue._disp;
    else 
        return 'contains '+expressionValue;
}