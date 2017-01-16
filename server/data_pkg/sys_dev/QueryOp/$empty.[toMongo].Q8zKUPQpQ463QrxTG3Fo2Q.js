function (fieldName) {
    var ret = {$or:[{},{}]};
    ret.$or[0][fieldName] = {$exists:false};
    ret.$or[1][fieldName] = null;
    return ret;
}