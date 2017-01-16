function (fieldName, clause) {
    var ret = {};
    ret[fieldName] = { $not: new RegExp(clause) };
    return ret;
}