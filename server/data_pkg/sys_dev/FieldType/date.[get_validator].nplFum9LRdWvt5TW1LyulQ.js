function () {
    return {
        validator:function(v) {
            return /\d{4}-\d{2}-\d{2}/.test(v);
        },
        message: "$incompatible-type"
    };
}