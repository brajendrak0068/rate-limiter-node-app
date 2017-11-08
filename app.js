var express = require('express');
var path = require('path');
var favicon = require('serve-favicon');
var logger = require('morgan');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');

var routes = require('./routes/index');
var users = require('./routes/users');
var ratelimiter =  require('./ratelimiter');
var redis  =  require('redis');
var app = express();


// Setup rate limits configurations for ABC and ECOM Clients 
var limitsConfig = {
    ECOM:{total: {week:[100, 604800], month:[600, 2628000], hour: [500, 3600], min:[20, 60]}, GET: { min: [20, 604800] }, '/status':{min: [20 ,60]} },
    ABC: {total: {week:[10, 604800], hour:[5, 3600], min: [5, 60] }, POST: { week:[ 20, 604800 ]}, '/pay':{min:[ 30, 60] } }
};


var REDIS_PORT = 6379;
var REDIS_HOST = "127.0.0.1";
var redisClient = redis.createClient(REDIS_PORT, REDIS_HOST);

// Since , actual client is not present, So i am adding the ECOM client in req headers before request actually goes to rate limiter middleware.
// I will help to test the rate limit module

app.use(function (req, res , next){
 req.headers['clientName'] = 'ECOM';
 next();
});

app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');

// uncomment after placing your favicon in /public
//app.use(favicon(path.join(__dirname, 'public', 'favicon.ico')));
app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

//finally initialiazing rate limit config 

app.use(ratelimiter(limitsConfig, redisClient));

app.use('/', routes);
app.use('/users', users);

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  var err = new Error('Not Found');
  err.status = 404;
  next(err);
});

// error handlers

// development error handler
// will print stacktrace
if (app.get('env') === 'development') {
  app.use(function(err, req, res, next) {
    res.status(err.status || 500);
    res.render('error', {
      message: err.message,
      error: err
    });
  });
}

// production error handler
// no stacktraces leaked to user
app.use(function(err, req, res, next) {
  res.status(err.status || 500);
  res.render('error', {
    message: err.message,
    error: {}
  });
});


module.exports = app;
