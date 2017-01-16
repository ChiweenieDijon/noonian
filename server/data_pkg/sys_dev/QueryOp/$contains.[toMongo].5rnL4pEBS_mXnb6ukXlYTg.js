function (fieldName, clause) {
    var result = {};
    result[fieldName] = {$eq:clause};
    return result;
}