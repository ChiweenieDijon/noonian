function (fieldName) {
    
    var ret = { $nor:[{},{},{}]};
    
    ret.$nor[0][fieldName] = {$exists:false};
    ret.$nor[1][fieldName] = '';
    ret.$nor[2][fieldName] = null;
    
    return ret;
}