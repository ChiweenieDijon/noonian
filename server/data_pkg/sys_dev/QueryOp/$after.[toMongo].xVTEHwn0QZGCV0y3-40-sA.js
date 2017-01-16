function (fieldName, clause) {
    var ret = {};
    ret[fieldName] = {$gte:clause};
    return ret;
}