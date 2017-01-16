function ($http, $q, db, $state, $injector, $window, NoonWebService) {

    var errObj = function(key, err) {
      return {error:'Error invoking action '+key+' - '+err};
    };
    var uiActionCache = {};

    var invokeUiAction = function(actionObj, params, thisArg) {
      var key = actionObj.ui_action;
      var deferred = $q.defer();

      var queryPromise;

      if(uiActionCache[key]) {
        queryPromise = $q.when(uiActionCache[key]);
      }
      else {

        queryPromise = NoonWebService.call('sys/getUiAction', {key:key}).then(
          function(actionObj) {
            
            if(!actionObj) {
              return deferred.resolve({error:'No UiAction with key '+key});
            }

            var fnString = actionObj.function;
            try {
              var toCall;
              eval("toCall = "+fnString);
              if(typeof toCall === 'function') {
                uiActionCache[key] = toCall;
                return toCall;
              }
              else {
                deferred.resolve(errObj(key, "function parse failed"));
              }
            }
            catch(err) {
              deferred.resolve(errObj(key, err));
            }
          },
          function(err) {
            deferred.resolve(errObj(key, err));
          }
        );
      }

      queryPromise.then(
        function(actionFn) {
          if(typeof actionFn === 'function') {
            try {
              var callResult = $injector.invoke(actionFn, params);
              deferred.resolve(callResult);
              // deferred.resolve(actionFn.call(thisArg, parameters));
            }
            catch(err) {
              deferred.resolve(errObj(key, err));
            }
          }
        });

      return deferred.promise;
    };

    var invokeWsCall = function(actionObj, params) {
      var parameters = {};
      _.assign(parameters, actionObj.params || {}, params || {});

      if(!actionObj.origIcon) {
        actionObj.origIcon = actionObj.icon;
      }
      actionObj.icon = 'fa-spinner fa-spin';
      return NoonWebService.call(actionObj.ws, parameters).then(function(result){

        actionObj.icon = actionObj.origIcon;
        return result;
      });
    };

    var aliases = {};

    this.invoke = function(actionObj, actionArgs, thisArg) {
    //   console.log('NoonAction.invoke', actionObj, actionArgs, thisArg);
      if(typeof actionObj === 'string') {
        actionObj = aliases[actionObj];
      }

      if(!actionObj) {
        var err = 'Invalid actionObj parameter';
        console.error(err);
        return $q.reject(err);
      }

      var passedArgs = {};
      _.assign(passedArgs, actionObj.params||{}, actionArgs||{});

      if(actionObj.state) {
        $state.go(actionObj.state, passedArgs);
        return $q.resolve(true);
      }
      else if(actionObj.ui_action) {
        return invokeUiAction(actionObj, passedArgs, thisArg);
      }
      else if(actionObj.ws) {
        return invokeWsCall(actionObj, passedArgs);
      }
      else if(actionObj.fn) {
        return $q.resolve(actionObj.fn.apply(thisArg || actionObj, [passedArgs]));
      }
      else if(actionObj.external) {
        //TODO allow for parameter substituion via passedArgs
        return $window.open(actionObj.external);
      }
    };
    
    this.registerAlias = function(alias, actionObj) {
        
        if(alias && actionObj) {
          aliases[alias] = _.clone(actionObj);
        }
    };
    
    this.registerAliases = function(aliasMap) {
        _.forEach(aliasMap, function(actionObj, alias) {
            aliases[alias] = _.clone(actionObj);
        });
    };
    
    this.unalias = function(aliasString) {
        return aliases[aliasString];  
    };
    
    this.unaliasActionList = function(actionList, otherAliases) {
        otherAliases = otherAliases || {};
        
        var result = [];
        _.forEach(actionList, function(a) {
            if(angular.isString(a)) {
                var resolved = otherAliases[a] || aliases[a];
                if(resolved) {
                    result.push(resolved);
                }
            }
            else {
                result.push(a);
            }
        })
        
        return result;
    };


    // return {
    //   invoke: function(actionObj, thisArg) {
    //     return invoke(actionObj, null, thisArg);
    //   },

    //   invokeNow: invoke,

    //   registerAlias: function(alias, actionObj) {
    //     if(alias && actionObj) {
    //       aliases[alias] = _.clone(actionObj);
    //     }

    //   }

    // };

  }