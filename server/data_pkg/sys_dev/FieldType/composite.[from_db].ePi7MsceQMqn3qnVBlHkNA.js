function (value, typeDesc, fieldName) {
    if(!value)
    return value;
    var parent_meta = this._bo_meta_data;
    
    if(!value._bo_meta_data) {
        Object.defineProperty(value, '_bo_meta_data', { 
            enumerable:false, writable:false, 
            value: {
                type_desc_map:typeDesc.type_desc_map,
                class_name: parent_meta.class_name+'#'+fieldName,
                getTypeDescriptor:function(path) {
                    return parent_meta.getTypeDescriptor(fieldName+'.'+path)
                }
            }
        });
    }
    
    return value;
}