function (getInputStream, outputStream, className, params, db, i18n, nodeRequire, Q, _) {
    var csv = nodeRequire('csv');
    var moment = nodeRequire('moment');
    var typeConverter = {
        _identity: function(val) {return val;},
        _array: function(val) {
            var conv = typeConverter[this.type] || typeConverter._identity;
            var ret = '', comma='';
            val = val || [];
            for(var i=0; i < val.length; i++) {
                ret += comma+conv(val[i]);
                comma=', ';
            }
            
            return ret;
        },
        date: function(val) {
            if(val) {
                return moment(val).format('LL');
            }
            
            return '';
        },
        reference: function(val) {
            return val ? val._disp : '';
        },
        boolean: function(val) {
            return val ? 'true' : 'false';
        },
        physical_address : function(val) {
            if(val) {
                return (val.address||'')+'\n'+(val.city||'')+', '+(val.state||'')+' '+(val.zip||'');
            }
            return '';
        }
    };
    
    var deferred = Q.defer();
    
    var metaData = db[className]._bo_meta_data;
    
    var fieldList = params.fields;
    
    if(!fieldList) {
      fieldList = Object.keys(metaData.type_descriptor);
    }
    else if(_.isString(fieldList)) {
        fieldList = JSON.parse(fieldList);
    }
    
    var lang = params.language || 'en';
    i18n.getBoLabelGroup(className, lang).then(function(labelGroup) {
        
        var columns = {};
        var fieldTypeConverters = {};
    
        _.forEach(fieldList, function(f) {
            columns[f] = labelGroup[f] || f;
            var td = metaData.getTypeDescriptor(f);
            // console.log("%s: %j", f, td);
            if(td) {
                if(_.isArray(td))
                    fieldTypeConverters[f] = typeConverter._array.bind(td[0]);
                else
                    fieldTypeConverters[f] = td ? typeConverter[td.type] : null;
            }
        });
        
        var stringifier = csv.stringify({ header: true, columns: columns });
        stringifier.pipe(outputStream);
        
        var inputStream = getInputStream();
        
        inputStream.on('data', function(obj) {
            var ret = {};
            _.forEach(fieldList, function(f) {
                var fieldVal = _.get(obj, f);
                var conv = fieldTypeConverters[f];
                if(conv != null) {
                    ret[f] = conv(fieldVal);
                }
                else {
                    ret[f] = fieldVal;
                }
            });
            stringifier.write(ret);
        });
        
        inputStream.on('end', function() {
            stringifier.end();
            deferred.resolve(true);
        });
        
        inputStream.on('error', function(err) {
            stringifier.end();
            deferred.reject(err);
        });
        
        inputStream.resume();
    });
    
    
    
    
    return deferred.promise;
}