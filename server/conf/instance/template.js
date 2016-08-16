
module.exports = {
  instanceId:'#instanceID#',
  instanceName:'#instance#',

  serverListen: {
    port: 9000,
    host: '127.0.0.1'
  },

  // MongoDB connection options
  mongo: {
    uri: 'mongodb://localhost/noonian-#instance#'
  },

  useHttps:false,

  ssl: {
    keyFile: 'server.key',
    certFile: 'server.crt'
  },

  // Secret for session, TODO configure to use PKI
  secrets: {
    session: '#instanceSECRET#'
  },

  dev:true

};
