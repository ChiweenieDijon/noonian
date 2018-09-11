/** 
  Web sockets "switchboard"
  @param server object returned from http.createServer(...)
*/

const _ = require('lodash');

const url = require('url');
const WebSocket = require('ws');

const db = require('./api/datasource');
const datatrigger = db._svc.DataTriggerService;
const auth = require('./api/auth');
const invokerTool = require('./tools/invoker.js');


var websocketBosByPath;

var onWebSocketConnection = function(ws, req) {
    
    const location = url.parse(req.url, true);
    
    console.log('WebSocket: requested location: %j', location);
    
    var path = location.pathname;
    var queryParams = location.query;
    
    var wsObj = websocketBosByPath[path];
    if(!wsObj) {
        ws.terminate();
        ws.emit('error', new Error('Bad location requested'));
        return;
    }
    
    console.log('matched WebSocket %s', wsObj._id);
    
    //Check permissions...
    auth.checkRoles(req, wsObj.rolespec).then(
      function() {
          var injectables = {
              ws:ws,
              req:req,
              queryParams:queryParams
          };
          
          var toCall = wsObj['on_connect'];
          console.log('invoking %s', toCall);
          
          invokerTool.invokeAndReturnPromise(toCall, injectables, wsObj).then(
            function(retVal) {
                //TODO Do anything with return value?
                console.log('on_connect returned %j', retVal);
            },
            function(err) {
              console.error('error invoking WebSocket on_connect for $s', path);
              console.error(err);
              ws.terminate();
              ws.emit('error', err);
              
            }
          );//end invokerTool.invoke

      },
      function(err) {
          ws.terminate();
          ws.emit('error', err);
      }
    );//end auth.checkRoles


}

module.exports = function(server) {
    
    if(!db.WebSocketServer) {
        console.error('Missing WebSocket Business Object class; upgrade system to use websockets');
        return;
    }
    
    db.WebSocketServer.find({}).then(function(wsBos) {
        websocketBosByPath = _.indexBy(wsBos, 'path');
    });
    
    //Watch WebSocket objects
    datatrigger.registerDataTrigger('sys.internal.websocket', db.WebSocketServer._bo_meta_data.bod_id, 'after', true, true, true, function(isCreate, isUpdate, isDelete) {
        if(isDelete) {
            delete websocketBosByPath[this._previous.path];
        }
        else if(isCreate || isUpdate) {
            websocketBosByPath[this.path] = this;
        }
        
        if(isUpdate && this._previous.path !== this.path) {
            delete websocketBosByPath[this._previous.path];
        }
        
        return null;
    });
        
    //Set up the server
    var wss = new WebSocket.Server({server});
    wss.on('connection', onWebSocketConnection);
    wss.on('error', function(err) {
        console.error('WEBSOCKET SERVER ERROR');
        console.error(err);
    });
}
