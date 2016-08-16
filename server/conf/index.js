'use strict';

var path = require('path');
var _ = require('lodash');


// All configurations will extend these options
// ============================================
var baseConfig = {

  // Root path of server
  root: path.normalize(__dirname + '/../..'),

  // Server listen port/host - defaults to 9000 (overwritten by instance conf)
  serverListen: {
    port: 9000,
    host: '127.0.0.1'
  },

  useHttps:false,

  // Secret for session, you will want to change this and make it an environment variable
  secrets: {
    session: 'noonian-secret'
  },

  // MongoDB connection options
  mongo: {
    options: {
      db: {
        safe: true
      }
    },
    uri: 'mongodb://localhost/noonian-dev'
  },


  instanceName:'Unspecified',
  instanceId:'0',
  urlBase:'',



  instance: 'localhost', //overridden via commandline

  dev:true

};



exports.init = function(commandline) {
  if(commandline.urlBase) {
    var ub = commandline.urlBase;
    if(ub.indexOf('/') !== 0) {
      ub = '/'+ub;
    }
    baseConfig.urlBase = ub;
  }

  var instance = commandline.instance || baseConfig.instance;

  if(instance) {
    baseConfig = _.merge(
      baseConfig,
      require('./instance/' + instance + '.js') || {});
  }

  console.log('Loading Configuration:');
  console.log('  instance \t "%s" (%s)', baseConfig.instanceName, baseConfig.instanceId);
  console.log('  URL base \t %s', baseConfig.urlBase || '/');
  console.log('  Listening on \t %s:%s', baseConfig.serverListen.host, baseConfig.serverListen.port);
  console.log('  server root \t %s', baseConfig.root);
  console.log('  mongo uri \t %s', baseConfig.mongo.uri);


  _.assign(exports, baseConfig);
}

