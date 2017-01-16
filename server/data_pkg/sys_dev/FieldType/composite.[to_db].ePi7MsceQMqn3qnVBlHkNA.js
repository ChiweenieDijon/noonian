function (value, typeDesc, fieldName) {
    var ret = value;
    if(value._bo_meta_data) {
        ret = {};
        var myTd = typeDesc.type_desc_map;
        for(var f in myTd) {
            if(f.indexOf('_') !== 0)
                ret[f] = value[f];
        }
    }
    return ret;
}