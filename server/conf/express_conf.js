/**
 * Express configuration
 */

'use strict';
var conf = require('./index');

var express = require('express');
var morgan = require('morgan');
var compression = require('compression');
var bodyParser = require('body-parser');
var methodOverride = require('method-override');
var cookieParser = require('cookie-parser');
var errorHandler = require('errorhandler');
var path = require('path');
var passport = require('passport');

module.exports = function(app) {

  app.engine('html', require('ejs').renderFile);
  app.set('view engine', 'html');

  app.use(compression());

  app.use(/.*_raw_postbody.*/, bodyParser.text({type: '*/x-www-form-urlencoded'})); 
  app.use(bodyParser.urlencoded({ extended: false }));
  app.use(bodyParser.json({limit:'10mb'}));

  app.use(methodOverride());
  app.use(cookieParser());
  app.use(passport.initialize());

  if(conf.urlBase) {
    app.use(conf.urlBase, express.static(path.join(conf.root, 'client')));
  }
  else {
    app.use(express.static(path.join(conf.root, 'client')));
  }

  // app.use(express.static(path.join(conf.root, '.tmp')));
  // app.use(express.static(path.join(conf.root, 'client')));

  app.set('appPath', 'client');

  if(conf.dev) {
    app.use(morgan('dev'));
    app.use(errorHandler()); // Error handler - has to be last
  }

};
