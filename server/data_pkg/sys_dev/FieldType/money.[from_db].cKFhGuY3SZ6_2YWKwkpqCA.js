function (value) {
    //for new we're pretending like all money values are just USD, even though we're storing a more complex data structure.
    // in the future we need a more robust money data type
    if(value && 'object' === typeof value) {
        return value.amount;
    }
    
    return value;
}