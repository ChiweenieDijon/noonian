function (scope, ngModel, $filter, uibDateParser) {
    var formatter = $filter('date');
    var dateFormat = 'yyyy-MM-dd';
    var timeFormat = 'HH:mm:ss.sss';
    var fullFormat = dateFormat + ' ' + timeFormat;
    
    var splitDate = function(d) {
        return {dateStr: formatter(d, dateFormat), timeStr: formatter(d, timeFormat)};  //format in **local time zone**
    }
    
    //1. Wire up converter for ng-model object (Date object or iso string)--> internal $viewValue representation (binding{dateStr,timeStr})
    ngModel.$formatters.push(function(modelValue) {
        if(modelValue) {
            
            if(typeof modelValue === 'string') {
                modelValue = new Date(modelValue);
            }
            
            if(modelValue instanceof Date && !isNaN(modelValue.getTime())) {
                return splitDate(modelValue);
            }
        }
        return {dateStr:null, timeStr:null};
    });
    
    //2. Wire up converter for internal $viewValue representation (binding{dateStr,timeStr}) --> ng-model object (Date object)
    ngModel.$parsers.push(function(viewValue) {
        if(viewValue) {
            try {
                var defaultVals;
                if(!viewValue.dateStr || !viewValue.timeStr) 
                    defaultVals = splitDate(new Date());
                    
                var dateStr = viewValue.dateStr || defaultVals.dateStr;
                var timeStr = viewValue.timeStr || defaultVals.timeStr;
                var fullStr = dateStr + ' ' + timeStr;
                
                return uibDateParser.parse(fullStr, fullFormat); //parsed to **local time zone**
                
            } catch(e) {console.error(e);}
        }
        
        return null;
    });
    
    //3. Wire up trigger for scope object --> $viewValue
    scope.$watch('binding', function() {
        //must *replace* the viewValue object in order for change to propogate to ng-model!
        if(scope.binding) {
            ngModel.$setViewValue({dateStr:scope.binding.dateStr, timeStr:scope.binding.timeStr});
        }
    }, 
    true); 
    
    //4. Wire up callback for $viewValue update --> scope object
    ngModel.$render = function() {
        scope.binding = ngModel.$viewValue;
    };
    
    return false;
}