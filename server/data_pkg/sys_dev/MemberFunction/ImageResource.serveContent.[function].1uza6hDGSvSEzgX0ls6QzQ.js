function (res) {
    var myContent = this.content;
    
    if(myContent && myContent.type && myContent.data) {
      res.type(myContent.type);

      var dataUri = myContent.data;
      var commaPos = dataUri.indexOf(',');
      return res.send(new Buffer(dataUri.substring(commaPos+1), 'base64'));
    }
    else {
        throw new Error('missing content');
    }
}