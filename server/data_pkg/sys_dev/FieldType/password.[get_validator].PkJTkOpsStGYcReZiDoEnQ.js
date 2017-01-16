function (typeDesc) {
    return function(value) {
        return (typeof value === 'string') ||
            ( typeDesc.hash &&
            typeof value === 'object' &&
            value.hasOwnProperty("hash")
            );
    }
}