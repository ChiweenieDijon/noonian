function (value) {
    //https://docs.mongodb.org/manual/faq/developers/#dollar-sign-operator-escaping
    //Escape any keys that start with $ or contain one or more dots
    var ud = '\uFF04';
    var udot = '\uFF0E';
    
    var callStack = [];
    var escapeDollars = function(obj) {
        if(typeof obj === 'object' && callStack.indexOf(obj) === -1) {
            callStack.push(obj);
            for(var key in obj) {
                if(!obj.hasOwnProperty(key)) {
                    continue;
                }
                escapeDollars(obj[key]);
                if(typeof key === 'string') {
                    if(key.indexOf('$')===0) {
                        var newKey = ud+key.substring(1);
                        obj[newKey] = obj[key];
                        delete obj[key];
                    }
                    if(key.indexOf('.') > -1) {
                        var newKey = key.replace(/\./g, udot);
                        obj[newKey] = obj[key];
                        delete obj[key];
                    }
                }
            }
            callStack.pop();
        }
    };
    
    escapeDollars(value);
    return value;
}