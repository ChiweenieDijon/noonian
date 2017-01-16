function (NoonWebService, NoonI18n, db, $q) {
    var THIS = this;
    
    //Map fieldtype name to appropriate FieldTypeUiSpec object
    var viewSpecs = {};
    var editSpecs = {};
    var viewArrSpecs = {};
    var editArrSpecs = {};
    
    var specMaps = {view:viewSpecs, edit:editSpecs};
    var arrSpecMaps = {view:viewArrSpecs, edit:editArrSpecs};
    
    var queryOpLabels;
    var queryOpMap = {}; //Map fieldtype name to list of queryop
    
    var cachePromises = {}; //keep track of classes for whom we've called cache()
    
    /**
     * DbuiFieldType.init
     * 
     */
    this.init = function() {
        console.log('initializing DbuiFieldType'); 
        
        //Pull in queryop metadata
        return NoonWebService.call('dbui/getQueryOpMetadata').then(function(result) {
            
            _.forEach(result, function(editorSpec) {
                _.forEach(editorSpec.types, function(typeName) {
                   queryOpMap[typeName] = editorSpec.queryops; 
                });
            });
            
        });
        
    };
    
    /**
     * 
     * @private
     */
    var getTypeName = function(typeDesc) {
        if(typeDesc instanceof Array) {
            return typeDesc[0].type+'[]';
        }
        else if(typeDesc) {
            return typeDesc.type;
        }
    };
    
    var applicableWildcard = function(typeDesc) {
        return typeDesc instanceof Array ? '*[]' : '*';
    };
    
    /**
     * DbuiFieldType.cacheTypeInfo
     * call getFieldTypeMetadata to cache templates/controllers/etc. for a fieldtype or fieldtypes of a specific class
     * @private
     */
    var cacheTypeInfo = function (wsParams, viewEdit) {
        // console.log('cacheTypeInfo', wsParams, viewEdit);
        return NoonWebService.call('dbui/getFieldTypeMetadata', wsParams).then(function(resultObj) {
            
            _.forEach(resultObj.result, function(specObj) {
                var typeList;
                if(specObj.fieldtypes && specObj.fieldtypes.length) {
                    typeList = specObj.fieldtypes;
                }
                else {
                    typeList = ['*'];
                }
                
                var specMap;
                if(specObj.for_array) {
                    specMap = arrSpecMaps[viewEdit];
                }
                else {
                    specMap = specMaps[viewEdit];
                }
                
                _.forEach(typeList, function(typeName) {
                    // console.log('saving template for ', typeName);
                    specMap[typeName] = specObj;
                });
            });
            
        },
        function(err) {
            console.error('Bad result for cacheTypeInfo ', wsParams, err);
        });
    };
    
    /** 
     * DbuiFieldType.cacheTypeInfoForFieldtype
     * Retrieves and caches FieldTypeUiSpec data for fields of specified fieldtype
     */
    var cacheTypeInfoForFieldtype = function(typeDesc, viewEdit) {
        return cacheTypeInfo( {field_type:getTypeName(typeDesc),view_or_edit:viewEdit}, viewEdit );
    };
    
    /** 
     * DbuiFieldType.cacheTypeInfoForClass
     * Retrieves and caches FieldTypeUiSpec data for fields of specified class
     */
    this.cacheTypeInfoForClass = function(className) {
        if(!cachePromises[className]) {
            cachePromises[className] = cacheTypeInfo({class_name:className,view_or_edit:'view'}, 'view')
                .then(cacheTypeInfo.bind(null, {class_name:className,view_or_edit:'edit'}, 'edit'));
        }
        return cachePromises[className];
    };
    
    
    var getSpecFromCache = function(typeDesc, viewEdit) {
        var typeName;
        var specMap;
        if(typeDesc instanceof Array) {
            specMap = arrSpecMaps[viewEdit];
            typeName = typeDesc[0].type;
        }
        else {
            specMap = specMaps[viewEdit];
            typeName = typeDesc.type;
        }
        
        if(specMap[typeName]) {
           return specMap[typeName];
        }
        else if(specMap['*']) {
            return specMap['*'];
        }
    };
    
    /**
     * DbuiFieldType.getSpec
     */
    this.getSpec = function(typeDesc, viewEdit) {
        var specObj = getSpecFromCache(typeDesc, viewEdit);
        if(specObj) {
            return $q.resolve(specObj);
        }
        
        //Not cached, retrieve it from server:
        return cacheTypeInfoForFieldtype(typeDesc, viewEdit).then(function() {
            return getSpecFromCache(typeDesc, viewEdit);
        });
        
    };
    
    
    /**
     * 
     */
    var getOpList =
    this.getOpList = function(typeDesc) {
        var typeName = getTypeName(typeDesc);
        if(queryOpMap[typeName]) {
            return queryOpMap[typeName];
        }
        else {
            var wc = applicableWildcard(typeDesc);
            if(queryOpMap[wc]) {
                return queryOpMap[wc];
            }
        }
    };
    
    /**
     * 
     */
    this.getOpInfo = function(typeDesc, opName) {
        var opInfoList = getOpList(typeDesc);
        for(var i=0; i < opInfoList.length; i++) {
            if(opName === opInfoList[i].op) {
                return opInfoList[i];
            }
        }
    };
    
    
    
    
    var expandRefPlaceholder = function(fieldList, boLabelGroup, denormOnly) {
        var myPos;
        for(myPos=0; myPos < fieldList.length ; myPos++) {
          if(fieldList[myPos] === this)
            break;
        }
        //Remove the placeholder
        fieldList.splice(myPos, 1);

        //Insert the items for the ref fields
        var namePrefix = this.fieldName;
        var refTd = db[this.td.ref_class]._bo_meta_data.type_desc_map;

        var refFieldList = denormOnly ? (this.td.denormalize_fields || []) : Object.keys(refTd);

        for(var i=0; i < refFieldList.length; i++) {
          var refFieldName = refFieldList[i];
          var qualifiedSubfield = namePrefix+refFieldName;
          var fi = {
            fieldName:qualifiedSubfield,
            fieldLabel: boLabelGroup[namePrefix.substring(0, namePrefix.length-1)]+'.'+(boLabelGroup[qualifiedSubfield] || refFieldName),
            td:refTd[refFieldName]
          };

          fieldList.splice(myPos, 0, fi);
        }

      };
      
    /**
     * DbuiFieldType.getAugmentedFieldList
     *  returns a promise -> array of objects describing the fields of bo className
     *  {
     *    fieldName:'field name - dotted if ref sub-field',
     *    fieldLabel:'from i18n getBoLabelGroup, for language of current user',
     *    td: typedesc object copied from bo metadata
     *    refPlaceholder: boolean - true if this is a placeholder for a reference field,
     *    expand: function to expand this placeholder into entries for reference fields
     *  }
     **/
    this.getAugmentedFieldList = function(className, denormOnly, searchableOnly) {

      return NoonI18n.getBoLabelGroup(className).$promise.then(function(boLabelGroup) {
        var Model = db[className];
        var typeDescMap = Model._bo_meta_data.type_desc_map;
        var resultList = [];

        boLabelGroup._abbreviated = boLabelGroup._abbreviated || {};

        for(var f in typeDescMap) {
          if(f.indexOf('_') === 0)
            continue;
          
          var td = typeDescMap[f];
          
          if(searchableOnly && !getOpList(td)) 
            continue;

          
          var fieldLabel = boLabelGroup._abbreviated[f] || boLabelGroup[f] || f;
          var fieldInfo = {
            fieldName:f,
            fieldLabel:fieldLabel,
            td:td
          };
          resultList.push(fieldInfo);

          if(td.type === 'reference' && (!denormOnly || td.denormalize_fields)) {
            var fiPlaceholder = {
              fieldName:f+'.',
              fieldLabel:fieldLabel+'...',
              td:td,
              refPlaceholder:true
            };

            fiPlaceholder.expand = expandRefPlaceholder.bind(fiPlaceholder, resultList, boLabelGroup, denormOnly);
            resultList.push(fiPlaceholder);
          }

        }//end typeDescMap iteration

        resultList.sort(function(a, b) {
          if (a.fieldLabel < b.fieldLabel)
            return -1;
          if (a.fieldLabel > b.fieldLabel)
            return 1;
          return 0;
        });


        return resultList;
      });


    };
    

}