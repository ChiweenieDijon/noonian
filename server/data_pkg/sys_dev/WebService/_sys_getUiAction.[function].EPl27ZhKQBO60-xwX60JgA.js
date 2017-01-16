function (queryParams, db) {
  var key = queryParams.key;

  if(!key) {
    throw new Error('missing key param');
  }
  
  return db.UiAction.findOne({key:key});
}