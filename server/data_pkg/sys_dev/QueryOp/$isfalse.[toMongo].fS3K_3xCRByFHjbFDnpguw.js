function (fieldName, clause) {
    var ret = {};
    ret[fieldName] = {$eq:false};
    return ret;
}