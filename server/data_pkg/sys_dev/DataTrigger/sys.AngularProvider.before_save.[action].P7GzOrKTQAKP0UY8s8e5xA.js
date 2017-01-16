function () {
    if(this.function) {
        if(!this.parameters || !this.parameters.length) {
            
              var paramRegex = /\(([\s\S]*?)\)/; //Captures the string between open and close paren
              var splitRegex = /[ ,\n\r\t]+/;     //Matches whitespace and commas to split the param list into param names
            
              var execResult = paramRegex.exec(this.function);
            
              if(!execResult || !execResult[1])
                return;
            
              var paramString = execResult[1].trim();
            
              if (paramString.length === 0)
                return;
            
            
            this.parameters = paramString.split(splitRegex);
        }
    }
}