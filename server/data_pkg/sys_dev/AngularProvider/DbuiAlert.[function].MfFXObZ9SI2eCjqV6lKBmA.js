function ($rootScope, $timeout) {
    
    var THIS = this;
    
    var closeDbuiAlert = function(alertObj) {
        var arr = $rootScope.dbui_alerts;
        
        for(var i=0; i < arr.length; i++) {
            if(arr[i] === alertObj) {
                arr.splice(i, 1);
                break;
            }
        }
        
    }
    
    this.alert = function(type, message, timeout) {
        console.log('DbuiAlert.alert', type, message, timeout);
        if(!$rootScope.dbui_alerts) {
            //lazy init the alert queue
            $rootScope.dbui_alerts = [];
            $rootScope.closeDbuiAlert = closeDbuiAlert;
        }
        
        if(!timeout) {
            timeout = 5000;
        }
        
        var alertObj = {
            msg:message,
            type:type,
            dismiss_timeout:timeout
        };
        
        $rootScope.dbui_alerts.push(alertObj);
        
        $timeout(closeDbuiAlert.bind(null, alertObj), timeout);
        
        
    };
    
    this.success = function(msg, timeout) {
        THIS.alert('success', msg, timeout);
    };
    
    this.warning = function(msg, timeout) {
        THIS.alert('warning', msg, timeout);
    };
    
    this.danger = function(msg, timeout) {
        THIS.alert('danger', msg, timeout);
    };
    
    
}