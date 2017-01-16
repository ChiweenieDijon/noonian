function (fieldName, clause) {
    //{ "fieldName":{$satisfiedBy:['role_id1','role_id2']} }
    // roleSpec: ['role_id1', ...]
    
    var roleList = clause; 
    
    //Create a query that says:
    //  "all reccords where field is empty 
    //     OR
    //   field contains at least one of items in roleList"
    
    var query = {$or:[{},{}]};
    
    //... where field is empty:
    query.$or[0][fieldName] = {$exists:false};
    query.$or[1][fieldName] = {$size:0};
    

    //... field contains at least one of items in roleList
    if(roleList) {
        for(var i=0; i < roleList.length; i++) {
            var r = roleList[i];
            var qc = {};
            
            if(r._id)
                qc[fieldName] = r._id;
            else 
                qc[fieldName] = r;
                
            query.$or.push(qc);
        }
    }
    
    return query;
    
}