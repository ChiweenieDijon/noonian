function (fieldName) {
    var ret = {$and:[{},{}]};
    ret.$and[0][fieldName] = {$exists:true};
    ret.$and[1][fieldName] = {$ne:null};
    return ret;
}