function () {
  return {
    template:'<span></span>',
    restrict:'E',
    scope: {
      indent: '='
    },
    link: function (scope, element) {
      if(scope.indent > 0) {
        var indentAmt = 30*scope.indent;
        element.append('<i style="padding-left:'+indentAmt+'px"></i>');
      }
    }
  };
}