function (typeDesc) {
    var v = {
        validator:'isFloat',
        message: "$incompatible-type"
    }
    
    if(typeDesc.min || typeDesc.max) {
        v = [v];
        v.push({
            validator:'isFloat',
            arguments:[{min:td.min, max:td.max}],
            message: "$out-of-range"
        });
    }
    
    return v;
}