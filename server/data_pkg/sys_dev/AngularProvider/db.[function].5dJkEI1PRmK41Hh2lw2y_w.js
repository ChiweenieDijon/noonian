function ($http, $q) {

  var initPromise = false; //Fulfilled when this factory is fully initialized
  var modelCache = {};  //Maps both BusinessObjectDef id AND classname to Model object
  var modelArr = [];

  /**
   * Constructor for type descriptor maps: special dynamic versions of BO definitions
   * @constructor
   * @param {!Object.<string, Object>} fieldToTd A plain object version of the typeDesc map
   **/
  var TypeDescMap = function(fieldToTd) {
    if(!this || !(this instanceof TypeDescMap)) {
      return new TypeDescMap(fieldToTd);
    }
    _.assign(this, fieldToTd);

    //Recursively Object-ify type_desc_map's stashed in any composite td's
    for(var fieldName in fieldToTd) {
      if(this[fieldName].type_desc_map) {
        this[fieldName].type_desc_map = new TypeDescMap(this[fieldName].type_desc_map);
      }
      else if(this[fieldName] instanceof Array && this[fieldName].length > 0 && this[fieldName][0].type_desc_map) {
        this[fieldName][0].type_desc_map = new TypeDescMap(this[fieldName][0].type_desc_map);
      }
    }
  };

  /**
   * @function TypeDescMap#getTypeDescriptor
   *
   * Retrieves a type descriptor for a particular field/sub-field
   * @param {string} path can be a simple fieldname or dotted into reference or composite fields, e.g.:
   *   db.SomeBusinessObj._bo_meta_data.getTypeDescriptor('refField.blah');
   */
  Object.defineProperty(TypeDescMap.prototype, 'getTypeDescriptor', {
     enumerable:false, writable:false,
     value:function(path) {
        var dotPos = path.indexOf('.');
        if(dotPos === -1) { //no dot -> just a field name
          // console.log('getTypeDescriptor', path+'->',this[path]);
          return this[path];
        }
        // console.log('getTypeDescriptor', path);

        var localField = path.substring(0, dotPos);
        var subPath = path.substring(dotPos+1);

        var localTd = this[localField];

        if(!localTd) {
          console.error('invalid fieldname for td', localField, this);
          return null;
        }


        if(localTd.type === 'reference') {
          var RefModel = modelCache[localTd.ref_class];
          if(!RefModel) {
            console.error('invalid reference class in type descriptor:', localTd);
            return null;
          }

          return RefModel._bo_meta_data.type_desc_map.getTypeDescriptor(subPath);
        }
        else if(localTd.type === 'composite') {  //TODO: td.isComposite() enhancement for TypeDescMap's
          var subTd = localTd.type_desc_map;
          if(!subTd) {
            console.error('composite type descriptor missing sub-type_desc_map', localTd);
          }

          return subTd.getTypeDescriptor(subPath);
        }
        else if(localTd instanceof Array && localTd.length > 0 && localTd[0].type === 'composite') {
          var subTd = localTd[0].type_desc_map;
          if(!subTd) {
            console.error('composite type descriptor missing sub-type_desc_map', localTd);
          }

          return subTd.getTypeDescriptor(subPath);
        }
        else {
          //dotted into a non-reference or a non-existent field:
          console.log('invalid subfield specifier for this type descriptor', this, subPath);
          return null;
        }

      } //end function
  });



  /**
   * Constructor for fields that are of type 'composite',
   * Basically a 'mini-BusinessObject', in that it has metadata w/ a TypeDescMap.
   * @constructor
   * @param {string} ownerClass
   * @param {Object} fieldTd type descriptor for the field
   * @param {string} fieldName
   * @param {Object} initObj values for the data fields
   **/
  var CompositeSubmodel = function(ownerClass, fieldTd, fieldName, initObj) {
    if(!this || !(this instanceof CompositeSubmodel)) {
      //This constructor was called directly, not w/ 'new' operator...
      return new CompositeSubmodel(ownerClass, fieldTd, fieldName, initObj);
    }
    // console.log('CompositeSubmodel: ', ownerClass, fieldTd, fieldName, initObj);
    //this._bo_meta_data = ...
    var myMetaObj = {
      class_name: ownerClass+'#'+fieldName,
      type_desc_map: fieldTd.type_desc_map
    };

    Object.defineProperty(this, '_bo_meta_data', { enumerable:false, writable:false, value:myMetaObj });

    if(fieldTd.type_desc_map._disp) {
        Object.defineProperty(this, '_disp_template', {
           enumerable:false,
           value: _.template(this._bo_meta_data.type_desc_map._disp).bind(null, this)
        });
        
      Object.defineProperty(this, '_disp', {
        enumerable:false,
        get:function() {
            var retVal;
            try {
                retVal = this._disp_template();
            }
            catch(err) {
                retVal = angular.toJson(this);
            }
            return retVal;
        }
      });
    }

    if(initObj) {
      _.assign(this, initObj);
    }
  };




  /**
   * Convience to check/handle errors returned by webservice.
   * @private
   **/
  var handleWsCallError = function(method, md, response) {
    //An http error code was returned...
    console.log('ERROR response in ws call '+method, md, response);
    if(response.data.error)
      this.reject(response.data.error);
    else
      this.reject(response);
  };


  //modelStaticFunctions collection-level data access: find, count, batch update & remove.
  //  *these functions must be called w/ a this = _bo_meta_data
  var modelStaticFunctions = {

    /**
     * @function db.BusinessObjectModel.find
     * find a set of BusinessObjects
     *
     * @param {Object} conditions - query conditions (MongoDb style)
     * @param {?Object} projection - to include/exclude specific fields (MongoDb style)
     * @param {?Object} options - sort, limit, skip, group-by
     * @return {Array} A placeholder array that will be populated by the result objects on completion of call.
     *                 Contains $promise property that is fulfilled once webservice call is completed.
     */
    find:function(conditions, projection, options) {
      var deferred = $q.defer();

      var returnArr = [];
      returnArr.$promise = deferred.promise;

      var boMetaData = this;
      // console.log('Executing find: ', boMetaData, conditions, projection, options);

      var wsParams = {
        where:conditions,
        select:projection
      };
      _.assign(wsParams, options);

      $http({
        method:'GET',
        url:'db/'+boMetaData.class_name,
        params:wsParams
      }).then(

        function(response) {
          var responseData = response.data;

          if(responseData.error) {
            throw responseData.error;
          }

          returnArr.nMatched = responseData.nMatched;
          returnArr._bo_meta_data = boMetaData;

          var MyModel = modelCache[boMetaData.class_name];

          _.forEach(responseData.result || [], function(resultObj) {
            if(!resultObj.group) {
              returnArr.push(new MyModel(resultObj));
            }
            else {
              //Handle group-by
              var groupObj = {
                _id: resultObj._id,
                count: resultObj.count,
                group:[]
              };
              returnArr.push(groupObj);
              _.forEach(resultObj.group, function(obj) {
                groupObj.group.push(new MyModel(obj));
              });
            }
          });

          deferred.resolve(returnArr);
        },
        handleWsCallError.bind(deferred, 'db.find()', boMetaData)
      );

      return returnArr;
    },

    /**
     * @function db.BusinessObjectModel.findOne
     * find a single BusinessObject
     *
     * @param {Object} conditions - query conditions (MongoDb style)
     * @param {?Object} projection - to include/exclude specific fields (MongoDb style)
     * @param {?Object} options - sort, limit, skip, group-by
     * @return {BusinessObjectModel} A placeholder BusinessObjectModel instance that will be populated by the result object on completion of call.
     *                 Contains $promise property that is fulfilled once webservice call is completed.
     */
    findOne: function(conditions, projection, options) {
      // console.log('findOne', this, conditions);
      var deferred = $q.defer();

      var boMetaData = this;
      var MyModel = modelCache[boMetaData.class_name];

      var returnObj = new MyModel();
      returnObj.$promise = deferred.promise;

      var wsParams = {
        where:conditions
      };

      if(projection)
        wsParams.select = projection;
      if(options)
        _.assign(wsParams, options);

      wsParams.limit = 1;

      // console.log('Executing findOne: ', boMetaData, wsParams);
      $http({
        method:'GET',
        url:'db/'+boMetaData.class_name,
        params:wsParams
      }).then(

        function(response) {
          var responseData = response.data;

          if(responseData.error) {
            throw responseData.error;
          }

          if(responseData.result && responseData.result.length > 0) {
            // _.assign(returnObj, responseData.result[0]);
            returnObj.initialize(responseData.result[0]);
            deferred.resolve(returnObj);
          }
          else {
            deferred.resolve(null);
          }
        },

        handleWsCallError.bind(deferred, 'db.findOne()', boMetaData)
      );

      return returnObj;
    },

    /**
     * @function db.BusinessObjectModel.count
     * count a set of BusinessObjects
     *
     * @param {Object} conditions - query conditions (MongoDb style)
     * @return {promise} fulfilled once webservice call is completed; resolves to a number representing count of matching objects.
     */
    count: function(conditions) {

    }

  };

  //modelInstanceFunctions - object-level db access: save, remove
  // called w/ this containing properties
  var modelInstanceFunctions = {
    /**
     * @function db.BusinessObjectModel#save
     * Create or update 'this' BO
     * @return {promise} fulfilled once webservice call is completed; resolves to 'this'
     */
    save:function() {
      var deferred = $q.defer();
      var boMetaData = this._bo_meta_data;
      var theObject = this;
      var copyObj = {};

      for(var f in boMetaData.type_desc_map) {
        copyObj[f] = this[f];
      }
      if(this._id) {
        copyObj._id = this._id;
      }


      $http({
        method:'POST',
        url:'db/'+boMetaData.class_name,
        data:copyObj
      }).then(
        function(response) {
          var responseData = response.data;

          if(responseData.error || !responseData.result) {
            throw responseData.error || 'Object update failed; no result returned';
          }

          _.assign(theObject, responseData.result);

          deferred.resolve(theObject);
        },
        handleWsCallError.bind(deferred, 'db.save()', boMetaData)
      );
      return deferred.promise;
    },

    /**
     * @function db.BusinessObjectModel#remove
     * delete 'this' BO
     * @return {promise} fulfilled once webservice call is completed; resolves to ws response result
     */
    remove:function() {
      var deferred = $q.defer();
      var boMetaData = this._bo_meta_data;
      var theObject = this;

      if(!theObject._id) {
        deferred.reject('Unable to delete BusinessObject; missing _id');
        return deferred.promise;
      }

      $http({
        method:'DELETE',
        url:'db/'+boMetaData.class_name+'/'+theObject._id
      }).then(
        function(response) {
          var responseData = response.data;

          if(responseData.error || !responseData.result) {
            throw responseData.error || 'Object update failed; no result returned';
          }

          deferred.resolve(responseData.result);
        },
        handleWsCallError.bind(deferred, 'db.remove()', boMetaData)
      );
      return deferred.promise;
    }
  };


  /**
   * Build _bo_meta_data object from a BOD's definition.
   * @private
   */
  var prepareMetadataObj = function(bod) {
    var boMetaData = {
      class_name: bod.class_name,
      type_desc_map: new TypeDescMap(bod.definition),
      bod_id:bod._id
    };

    //Merge in superclass field type descriptors
    if(bod.superclass) {
      var superModel = modelCache[bod.superclass._id];
      if(superModel)
        _.merge(boMetaData.type_desc_map, superModel._bo_meta_data.type_desc_map);
      else
        console.error('ERROR couldnt properly initialize subclass Model; missing superclass');
    }

    return boMetaData;
  };

  /**
   * Create the DB Model object for a particular business object definition:
   * the DB Model is akin to a mongoose model, used to query a particular class of BusinessObject's, and to update/delete objects
   * @private
   **/
  var createAndCacheModel = function(bod) {

    /**
     * BusinessObjectModel
     *  This is what will ultimately accessed via the db.SomeParticularBoClass API.
     *
     *  db.SomeParticularBoClass.find({}).then(function(queryResults) {...});
     *
     *  var newObj = new db.SomeParticularBoClass({...});
     *  newObj.save();
     * @constructor
     */
    var NewModel = function(initObj) {
      // console.log('Initializing object: ', JSON.stringify(initObj));
      // console.log(' _bo_meta_data: ', JSON.stringify(this._bo_meta_data));
      this.initialize(initObj);
        // _.assign(this, initObj);
    };

    /**
     * @function BusinessObjectModel#initialize
     * @private
    **/
    Object.defineProperty(NewModel.prototype, 'initialize', {
      enumerable:false, writable:false,
      value:function(initObj) {
        if(initObj) {
          var THIS = this;
          this._id = initObj._id;
          this.__ver = initObj.__ver;
          _.forEach(this._bo_meta_data.type_desc_map, function(td, fieldName) {

            if(td.construct) {
              THIS[fieldName] = td.construct(initObj[fieldName]);
            }
            else if(initObj.hasOwnProperty(fieldName)) {
              THIS[fieldName] = initObj[fieldName];
            }
          });
        }
      }
    });


    var boMetaData = prepareMetadataObj(bod);
    var propertyConfig = { enumerable:false, writable:false, value:boMetaData };

    Object.defineProperty(NewModel, '_bo_meta_data', propertyConfig);
    Object.defineProperty(NewModel.prototype, '_bo_meta_data', propertyConfig);


    //Reference the 'static' functions, binding metadata object for class of interest:
    for(var fn in modelStaticFunctions) {
      NewModel[fn] = modelStaticFunctions[fn].bind(boMetaData);
    }

    //Reference the 'instance' functions in BoModel's prototype.
    // save, remove, etc. can be executed against a specific Business Object instance
    for(var fn in modelInstanceFunctions) {
      NewModel.prototype[fn] = modelInstanceFunctions[fn];
    }

    //Wire up _disp getter for the Class
    if(bod.definition._disp) {
      try {
        NewModel.prototype._disp_template = _.template(bod.definition._disp);
      }
      catch(err) {
        console.log('ERROR COMPILING _disp TEMPLATE', err);
      }
    }

    /**
     * @function BusinessObjectModel#_disp
     *
    **/
    Object.defineProperty(NewModel.prototype, '_disp',
    {
      get: function() {
        var td = this._bo_meta_data.type_desc_map || {};

        if(this._disp_template) {
          try {
            return this._disp_template(this);
          }
          catch(err) {
            console.log(err);
          }
        }
        else if(td.name) {
          if(this.name) return ''+this.name;
        }
        else if(td.key) {
          if(this.key) return ''+this.key;
        }
        else if(td.title) {
          if(this.title) return ''+this.title;
        }

        return this._bo_meta_data.class_name+'['+this._id+']';

      }
    }); //End Object.defineProperty


    //Process composite field types as special subtypes.  To set a composite field value, you must instantiate a special "sub-model"
    // var compValue = new SomeBo.compfield({initObj:...});
    // someBoInstance.compfield = compValue
    _.forEach(boMetaData.type_desc_map, function(td, fieldName) {
      if(td.type === 'composite' || (td instanceof Array && td[0].type === 'composite') ) {
        var myTd = td instanceof Array ? td[0] : td;
        //Define "sub-model" constructor to allow for creation of objects that can be assigned to this field
        NewModel[fieldName] = CompositeSubmodel.bind(undefined, NewModel._bo_meta_data.class_name, myTd, fieldName);

        //Make it accessible via the type descriptor, so composite values can be instantiated
        Object.defineProperty(myTd, 'construct', {
          enumerable:false, writable:false, value:NewModel[fieldName]
        });

        if(td instanceof Array) {
          Object.defineProperty(td, 'construct', {
            enumerable:false, writable:false,
            value:function(initArr) {
              var thisTd = this[0];
              var ret = [];
              _.forEach(initArr, function(initObj) {
                ret.push(thisTd.construct(initObj));
              });
              return ret;
            }
          });
        }

        //Define getter/setter for composite fields:
        // var hiddenFieldName = '_cmp_'+fieldName;
        // Object.defineProperty(NewModel.prototype, hiddenFieldName, {enumerable:false, writable:true});
        // Object.defineProperty(NewModel.prototype, fieldName, {
        //   enumerable:true,
        //   get:function() {
        //     return this[hiddenFieldName];
        //   },
        //   set:function(newVal) {
        //     if(newVal != null && !(newVal instanceof CompositeSubmodel)) {
        //       newVal = td.construct(newVal);
        //     }
        //     this[hiddenFieldName] = newVal;
        //   }
        // });
      }
    });

    Object.freeze(NewModel); //Disallow further changes to its properties
    modelCache[bod._id] = modelCache[bod.class_name] = NewModel;
    modelArr.push(NewModel);
  };


  modelCache.getModelArr = function() {
      return modelArr;
  }

  /**
   * @function db.init
   *  Initialize db layer on start-up; calls web service to obtain system metadata, populates the api model objects
   * @return {promise} fulfilled on completion
   */
  modelCache.init = function() {

    if(!initPromise) {
      console.log('initializing ndb');

      initPromise =
        $http({
          method:'GET',
          url:'ws/dbui/getSysMetadata'
        }).then(

          function(response) {
            var responseData = response.data || {};

            if(responseData.error) {
              throw responseData.error;
            }

            var bodArray = responseData.result;

            //Get superclasses first on the list
            bodArray.sort(function(x,y) {
              if(!y.abstract === !x.abstract) return 0;
              else if(y.abstract && !x.abstract) return 1;
              else return -1;
            });

            _.forEach(bodArray, function(bod) {
              createAndCacheModel(bod);
            });

          }
        );


    }
    return initPromise;
  };


  //Return the API for the db layer:
  return modelCache;

}