function (value) {
    //Allow for case-insensitive string values "false"
    if(typeof value === 'string') {
        var valMap = {
            'false':false,
            'true':true,
            'null':null
        };
    	return valMap[value.toLowerCase()];
    }
    
    if(value === undefined)
        value = null;
    
    return value;
}