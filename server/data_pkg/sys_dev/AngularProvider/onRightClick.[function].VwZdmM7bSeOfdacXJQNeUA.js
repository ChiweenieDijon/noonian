function ($parse) {
    return function(scope, element, attrs) {
        var fn = $parse(attrs.onRightClick);
        element.bind('contextmenu', function(event) {
            scope.$apply(function() {
                event.preventDefault();
                fn(scope, {$event:event});
            });
        });
    };
}