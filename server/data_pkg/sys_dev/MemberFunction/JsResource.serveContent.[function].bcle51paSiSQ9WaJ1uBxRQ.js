function (outStream, nodeRequire) {
    //If outStream is an http response, set content-type appropriately
    if(typeof outStream.type === 'function') {
        outStream.type('application/javascript');
    }
    outStream.write(this.content);
    return outStream.end();
}