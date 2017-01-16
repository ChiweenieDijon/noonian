function (db) {
    
    return function(res) {
        var wr = this;
        var fileId = wr.content.attachment_id;
        
        var onError = function(err)  {
            throw err;
        }
        
        console.log('getting file %s', fileId);
        return db._svc.GridFsService.getFile(fileId).then(function(f) {
    
          res.type(f.metadata.type);
          var rs = f.readstream;
    
          rs.on('error', onError);
          rs.setEncoding('base64');
          rs.on('data', function(chunk) {
            res.write(chunk, 'base64');
          });
          rs.on('end', function() {
            res.end();
          });
        });
    }

}