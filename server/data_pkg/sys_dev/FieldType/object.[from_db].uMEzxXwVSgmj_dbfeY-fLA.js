function (value) {
    //Unescape any keys that start with uFF04 (unicode $)
    // or have unicode period
    var ud = '\uFF04';
    var udot = '\uFF0E';
    
    var callStack = [];
    var unescapeDollars = function(obj) {
        if(typeof obj === 'object' && callStack.indexOf(obj) === -1) {
            callStack.push(obj);
            for(var key in obj) {
                if(!obj.hasOwnProperty(key)) {
                    continue;
                }
                unescapeDollars(obj[key]);
                if(typeof key === 'string') {
                    if(key.indexOf(ud)===0) {
                        var newKey = '$'+key.substring(1);
                        obj[newKey] = obj[key];
                        delete obj[key];
                    }
                    if(key.indexOf(udot) > -1) {
                        var newKey = key.replace(/\uFF0E/g, '.');
                        obj[newKey] = obj[key];
                        delete obj[key];
                    }
                }
            }
            callStack.pop();
        }
    };
    
    unescapeDollars(value);
    return value;
}