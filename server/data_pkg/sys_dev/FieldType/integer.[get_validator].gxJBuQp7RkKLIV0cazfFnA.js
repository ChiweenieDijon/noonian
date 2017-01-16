function (typeDesc) {
    var v = {
        validator:'isInt',
        message: "$incompatible-type"
    };
    
    if(typeDesc.min || typeDesc.max) {
        v = [v];
        v.push({
            validator:'isInt',
            arguments:[{min:typeDesc.min, max:typeDesc.max}],
            message: "$out-of-range"
        });
    }
    
    return v;
}