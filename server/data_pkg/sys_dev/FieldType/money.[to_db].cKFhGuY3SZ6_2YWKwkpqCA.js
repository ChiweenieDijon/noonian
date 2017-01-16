function (value) {
    if(!value) {
        return null;
    }
    
    if('object' === typeof value) {
        return value;
    }
    
    if('string' === typeof value) {
        value = +value;
    }
    
    if(isNaN(value)) {
        return null;
    }
    
    return {
        amount:value,
        currency:'USD'
    };

    
}