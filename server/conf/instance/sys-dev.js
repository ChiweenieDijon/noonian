
module.exports = {
  instanceId:'sys',
  instanceName:'sys-dev',

  serverListen: {
    port: 9000,
    host: '127.0.0.1'
  },

  // MongoDB connection options
  mongo: {
    uri: 'mongodb://localhost/noonian-sys-dev'
  },

  useHttps:false,

  ssl: {
    keyFile: 'server.key',
    certFile: 'server.crt'
  },

  // Secret for session, TODO configure to use PKI
  secrets: {
    session: 'change-to-something-random'
  },
  
  enablePackaging: true,
  
  // To configure filesystem-persistence for packages
  //  maps package key to directory (can be absolute or relative to noonian base)
  
  packageFsConfig:{
    'sys':'server/data_pkg/sys_dev'
  },
  
  urlBase:'sys-dev',
  dev:true

};
