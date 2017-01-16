function () {
    return function (value) {
      if (!value) { return ''; }

      var strVal = ''+value;
      var dollars = '';
      var cents = '';
      var dotPos = strVal.indexOf('.');
      if(dotPos > -1) {
        dollars = strVal.substring(0, dotPos);
        cents = strVal.substring(dotPos+1);
        while(cents.length < 2) {
          cents += '0';
        }
        cents = '.'+cents;
      }
      else {
        dollars = strVal;
      }

      //Separate into thousands:
      var dollarsSep = '';
      var comma = '';
      var i = dollars.length;

      while(i-3 >= 0) {
        var currPiece = dollars.substring(i-3, i);
        dollarsSep = currPiece+comma+dollarsSep;
        comma = ',';
        i-=3;
      }

      if(i !== 0) {
        var finalPiece = dollars.substring(0, i);
        dollarsSep = finalPiece + comma + dollarsSep;
      }

      return '$'+dollarsSep+cents;
    };
  }