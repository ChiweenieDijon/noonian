function (db, _) {
    var ENGLISH_ID='-9vPfv2lEeSFtiimx_V4dw';
    var THIS = this;
    var labelGroupKey = 'db.enum.'+this.name;
    db.LabelGroup.findOne({key:labelGroupKey, language:ENGLISH_ID}).then(function(lg) {
        if(!lg) {
            console.log('Generating LabelGroup for '+labelGroupKey);
            var labelMap = {};
            lg = new db.LabelGroup({
               key:labelGroupKey,
               language:{_id:ENGLISH_ID},
               value:labelMap
            });
            
            _.forEach(THIS.values, function(val) {
                labelMap[val] = _.startCase(val);
            });
            lg.save();
        }    
    })
    
}