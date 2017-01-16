function (searchStr, typeDescMap, FieldTypeService) {

    var retCond = {$or:[]};
    var condList = retCond.$or;

    for(var fieldName in typeDescMap) {
        var td = typeDescMap[fieldName];
        if(fieldName.indexOf('_') === 0 || td instanceof Array)
            continue;

        var mongoType = FieldTypeService.getSchemaElem(td);

        if(!mongoType) {
          console.log("No typeMapper for "+td.type+" field "+fieldName);
          continue;
        }
        if(mongoType.textIndex) {
            var newCond = {};
            newCond[fieldName] = {$regex:searchStr, $options:'i'};
            condList.push(newCond);
        }

    }
    return retCond;
}