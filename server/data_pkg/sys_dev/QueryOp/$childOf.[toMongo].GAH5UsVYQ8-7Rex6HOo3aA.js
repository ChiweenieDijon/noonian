function (fieldName, clause) {
    var ret = {};
    ret[fieldName] = {$regex:'^'+clause};
    return ret;
}