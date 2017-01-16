function (fieldName, clause) {
    var result = {};
    result[fieldName] = {$not:{$eq:clause}};
    return result;
}