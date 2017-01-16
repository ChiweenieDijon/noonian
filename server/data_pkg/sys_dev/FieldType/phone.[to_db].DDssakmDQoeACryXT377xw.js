function (value) {
    if(value && 'string' === typeof value) {
        //remove all non-digits
        var pieces = value.split(/\D/);
        value = pieces.join('');
    }
    
    return value;
}