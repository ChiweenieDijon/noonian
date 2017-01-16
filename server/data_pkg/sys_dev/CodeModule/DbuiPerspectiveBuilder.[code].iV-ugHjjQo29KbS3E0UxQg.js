function (db, auth, config, Q, _) {
    var exports = {};
    
    //Manual 'hoisting' of functions
    var autogenPerspective;
    var getPerspective;
    var getDisplayOptions;
    
    
    
    //Map perspective type to a function that generates a default perspective of that type:
    var perspectiveGenerators = {  
        
        list:function(targetTypeDescMap, perspectiveConfigItem) {
            perspectiveConfigItem.list.fields = [];
            for(var f in targetTypeDescMap) {
                if(f.indexOf('_') === 0) continue;
                perspectiveConfigItem.list.fields.push(f);
            }
        },
        
        picker_list:function(targetTypeDescMap, perspectiveConfigItem) {
            if(perspectiveConfigItem.list) {
                perspectiveConfigItem.picker_list = perspectiveConfigItem.list;
            }
            else {
                perspectiveConfigItem.picker_list.fields = [];
                for(var f in targetTypeDescMap) {
                    if(f.indexOf('_') === 0) continue;
                    perspectiveConfigItem.picker_list.fields.push(f);
                }
            }
        },
        
        view:function(targetTypeDescMap, perspectiveConfigItem) {
            perspectiveConfigItem.view.layout = [];
              for(var f in targetTypeDescMap) {
                  if(f.indexOf('_') === 0) continue;
                  perspectiveConfigItem.view.layout.push(f);
              }
        },
        
        edit: function(targetTypeDescMap, perspectiveConfigItem) {
            perspectiveConfigItem.edit.layout = [];
              for(var f in targetTypeDescMap) {
                  if(f.indexOf('_') === 0) continue;
                  perspectiveConfigItem.edit.layout.push(f);
              }
        }
    };
    
    /**
     * @private
     */
    var getTypeDescMap = function(boClass) {
        
        if(db[boClass]) {
            return db[boClass]._bo_meta_data.type_desc_map;
        }
        else if(boClass.indexOf('#') > 0) {
            var hashPos = boClass.indexOf('#');
            var baseClass = boClass.substring(0, hashPos);
            var subField = boClass.substring(hashPos+1, boClass.length).replace(/#/g, '.');
            
            var fieldTd = db[baseClass]._bo_meta_data.getTypeDescriptor(subField);
            if(fieldTd) {
                if(fieldTd instanceof Array) {
                    fieldTd = fieldTd[0];
                }
                return fieldTd.type_desc_map;
            }
        }
        else {
            throw new Error('Invalid class name '+boClass);
        }
        
    };
    
    /**
     * DbuiPerspectiveBuilder.autogenPerspective
     */
    autogenPerspective = 
    exports.autogenPerspective = function(boClass, perspectiveName, perspectiveType, perspectiveConfigItem) {
      console.log("Auto-generating perspective: "+perspectiveName+"."+boClass+"."+perspectiveType);
    
      var td = getTypeDescMap(boClass); //db[boClass]._bo_meta_data.type_descriptor;
      var key = 'sys.dbui.perspective.'+perspectiveName+'.'+boClass;
    
    
      if(!perspectiveConfigItem)
        perspectiveConfigItem = {};
    
      var deferred = Q.defer();
    
      //If we're not generating the default perspective, see if there's one to copy...
      if(perspectiveName !== "default") {
        var defaultKey = 'sys.dbui.perspective.default.'+boClass;
    
        config.getParameter(defaultKey, false)
          .then( function(defaultConfigItem) {
            if(defaultConfigItem && defaultConfigItem[perspectiveType]) {
              //We found the default... copy from it in below then().
              return defaultConfigItem;
            }
            else {
              //No default for this perspective/type; auto-generate and copy from it..
              return autogenPerspective(boClass, 'default', perspectiveType);
            }
    
          })
          .then(function(perspectiveToCopyFrom) {
            perspectiveConfigItem[perspectiveType] = perspectiveToCopyFrom[perspectiveType];
            config.saveParameter(key, perspectiveConfigItem).then(
              function() {deferred.resolve(perspectiveConfigItem)}
            );
          });
      }
      else { //Generating a default perspective
        
        if(!perspectiveGenerators[perspectiveType]) {
            deferred.reject("bad perspectiveType: "+perspectiveType);
        }
        else {
            perspectiveConfigItem[perspectiveType] = {};
            
            perspectiveGenerators[perspectiveType](td, perspectiveConfigItem);
            
            config.saveParameter(key, perspectiveConfigItem).then(
                function() {deferred.resolve(perspectiveConfigItem);},
                function(err) {deferred.reject(err)}
            );
        }
        
      }
    
      return deferred.promise;
    }
    
    /**
     * DbuiPerspectiveBuilder.getDisplayOptions
     * @private
     *  Merges sys.dbui.displayoptions w/ sys.dbui.displayoptions.SpeecificClass
     *  @return an object: {field_name:{customizations}}
     **/
    getDisplayOptions = function(boClass, userId, perspectiveName, perspectiveType) {
      var rootKey = 'sys.dbui.displayoptions';
      var classKey = rootKey+'.'+boClass;
    
    
      var promiseArray = [
          config.getCustomizedParameter(rootKey, userId),
          config.getCustomizedParameter(classKey, userId)
      ];
        
      //Also, incorporate composite field 'sub-perspectives' 
      var typeDescMap = getTypeDescMap(boClass);//db[boClass]._bo_meta_data.type_descriptor;
    //   var composites = [];
      
    //   _.forEach(typeDescMap, function(td, fieldName) {
    //       if(td.type === 'composite') {
    //           composites.push(fieldName);
    //           promiseArray.push(getPerspective(boClass+'#'+fieldName, perspectiveName, perspectiveType, userId));
    //       }
    //       //TODO check for named composites???
    //   });
    
      return Q.all(promiseArray).then(function(resultArr) {
        var rootObj = resultArr[0] || {};
        var classObj = resultArr[1] || {};
        var result = {};
        
        //the base sys.dbui.displayoptions contains params for specific field types.
        // the class-specific one contains params based on field name...
    
        //Iteratate through the type descriptor's to map params to appropriate field names:
        _.forEach(typeDescMap, function(td, fieldName) {
          if(classObj[fieldName]) {
            result[fieldName] = rootObj[td.type] ? _.clone(rootObj[td.type]) : {};
            _.merge(result[fieldName], classObj[fieldName]);
          }
          else if(rootObj[td.type]) {
            result[fieldName] = _.clone(rootObj[td.type]);
          }
        });
        
        //Merge any composite 'sub-perspectives' into result
        // var arrIndex = 2; //remainder of resultArr are result of getPerspective() calls
        // _.forEach(composites, function(fieldName) {
        //     if(!result[fieldName]) {
        //         result[fieldName] = {};
        //     }
        //     if(!result[fieldName].perspective) {
        //         result[fieldName].perspective = {};
        //     }
        //     result[fieldName].perspective[perspectiveType] = resultArr[arrIndex];
        //     arrIndex++;
        // });
    
        return result;
      });
    }
    
    /**
     * DbuiPerspectiveBuilder.getPerspective
     */
    getPerspective = 
    exports.getPerspective = function(boClass, perspectiveName, perspectiveType, userId) {
    
      var rootKey = 'sys.dbui.perspective';
      var baseKey = rootKey+'.'+perspectiveName;
      var classKey = baseKey+'.'+boClass;
      
      //Skip merging of rootKey and baseKey perspectives for composite perspectives
      var skipMerge = boClass.indexOf('#') > -1; //e.g. BoClass#compositeField
    
      return config.getCustomizedParameter(classKey, userId).then(function(result) {
    
        var promiseArray;
        
        if(!skipMerge) {
            promiseArray = [
              config.getCustomizedParameter(rootKey, userId),
              config.getCustomizedParameter(baseKey, userId)
            ];
        }
        else {
            promiseArray = [Q(false), Q(false)];
        }
    
        if(result && result[perspectiveType]) {
          promiseArray.push(Q(result));
        }
        else {
          promiseArray.push(
            autogenPerspective(boClass, perspectiveName, perspectiveType, result)
          );
        }
    
        //Finally add in displayoptions:
        promiseArray.push(getDisplayOptions(boClass, userId, perspectiveName, perspectiveType));
    
        return Q.all(promiseArray);
      })
      .then(function(configArray) {
    
        //so _.merge() behaves properly w/ array values:
        var arrayMerger = function(objectVal, sourceVal) {
          if(_.isArray(sourceVal))
            return sourceVal;
          else
            return undefined; //default merger
        }
    
        var root = configArray[0] || {};
        var base = configArray[1] || {};
        var clazz = configArray[2];
        var displayOptions = configArray[3];
    
        // console.log('ROOT %j BASE %j CLAZZ %j', root, base, clazz);
    
        var merged = _.merge(root, base, arrayMerger); //base onto root...
        _.merge(merged, clazz, arrayMerger);
    
        var perspectiveObj = merged[perspectiveType];
    
        if(!perspectiveObj.fieldCustomizations) {
          perspectiveObj.fieldCustomizations = {};
        }
    
        //merge fieldCustomizations atop more general displayOptions
        _.merge(displayOptions, perspectiveObj.fieldCustomizations);
        perspectiveObj.fieldCustomizations = displayOptions;
    
        return perspectiveObj;
    
    
      });
    
    
    };
    
    
    return exports;
}