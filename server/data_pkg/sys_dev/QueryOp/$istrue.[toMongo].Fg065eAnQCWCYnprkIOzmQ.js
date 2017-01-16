function (fieldName, clause) {
    var ret = {};
    ret[fieldName] = {$eq:true};
    return ret;
}