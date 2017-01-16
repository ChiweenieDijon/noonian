function (value) {
    
    if(value instanceof Date) {
        var datestr = value.toISOString();

        var parsed = /(\d{4}-\d{2}-\d{2}).*/.exec(datestr);
        if(parsed && parsed[1]) {
            return parsed[1];
        }
    }
    
    return value;
}