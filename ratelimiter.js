/*!
 * Rate-Limiter module works for large scale distributed systems
 * Created by Brajendra
 */

/**
 * Module dependencies.
 */
var url = require('url');

/**
 * Parse client from req.headers and apply throttling logic for that client
 *
 * @param {Object} [limits]
 * @param {Object} [redisClient]
 * @return {Function}
 * @api public
 */
var RateLimiter = function (limits, redisClient) {
  this.limitsConfig = limits;  //Clients rate limits configurations
  this.client = redisClient;   //Redis client
  /**** Error messege default object *******/
  this.errorMsg = {
    message: "Limit(s) reached! Request not allowed.",
    client: "",
    reachedLimits: ""
  };

  var _this = this;
  return function (req, res, next) {
    var multi = redisClient.multi(); //initialize redis multi command for atomicity
    var requestKeyNames = [];

    var clientName = req.headers.clientName; //Parsing the client name from headers

    var config = _this.limitsConfig[clientName];
    var method = req.method;
    var pathname = url.parse(req.url).pathname;
    var currIteKeysMapping = [];
    var allowedIteMaxCallsMapping = [];
    var key = clientName + '_' + 'total_limit';

    incCounterAndSetTTL(key, config.total);
    if (config[method] && config[pathname]) {
      incCounterAndSetTTL(clientName + '_' + method, config[method]);
      incCounterAndSetTTL(clientName + '_' + pathname, config[pathname]);
    } else if (config[method]) {
      incCounterAndSetTTL(clientName + '_' + method, config[method]);
    } else if (config[pathname]) {
      incCounterAndSetTTL(clientName + '_' + pathname, config[pathname]);
    }
    function incCounterAndSetTTL(key, arrayTimestamps) {
      for (var i in arrayTimestamps) {
        var finalKey = key + '_' + i + '_limit';
        currIteKeysMapping.push(finalKey);
        allowedIteMaxCallsMapping.push(arrayTimestamps[i][0]);
        multi.incr(finalKey)
          .ttl(finalKey, function (err, res) {
            if (res < 0)
              redisClient.expire(finalKey, arrayTimestamps[i][1]);
          })
      }
    }

    /***** After queuing the requests excute all the commands and validate the response ********/
    multi.exec(function (err, response) {
      if (err) {
        throw new Error("An error occured. Request was not recorded.");
      }
      var errorMsg = {msg: "", counts: 0};
      var monthAllowedLimit = 0;
      var weekAllowedLimit = 0;
      var hourAllowedLimit = 0;
      var minAllowedLimit = 0;
      var secAllowedLimit = 0;
      var monthCurrLimit = 0;
      var weekCurrLimit = 0;
      var hourCurrLimit = 0;
      var minCurrLimit = 0;
      var secCurrLimit = 0;
      var isLimitReached = false;
      var totalCounts = 0;

      for (var i = 0; i < currIteKeysMapping.length; i++) {
        if (response[i * 2] > allowedIteMaxCallsMapping[i]) {
          isLimitReached = true;
          errorMsg.msg = currIteKeysMapping[i].split("_").join(" ") + ' exceeded';
          errorMsg.counts = response[i * 2];
          break;
        }
        if (currIteKeysMapping[i].indexOf('month') >= 0) {
          monthAllowedLimit = monthAllowedLimit + allowedIteMaxCallsMapping[i];
          monthCurrLimit = monthCurrLimit + response[i * 2];

        } else if (currIteKeysMapping[i].indexOf('week') >= 0) {
          weekAllowedLimit = weekAllowedLimit + allowedIteMaxCallsMapping[i];
          weekCurrLimit = weekCurrLimit + response[i * 2];
        } else if (currIteKeysMapping[i].indexOf('hour') >= 0) {
          hourAllowedLimit = hourAllowedLimit + allowedIteMaxCallsMapping[i];
          hourCurrLimit = hourCurrLimit + response[i * 2];
        } else if (currIteKeysMapping[i].indexOf('min') >= 0) {
          minAllowedLimit = minAllowedLimit + allowedIteMaxCallsMapping[i];
          minCurrLimit = minCurrLimit + response[i * 2];

        } else if (currIteKeysMapping[i].indexOf('second') >= 0) {
          secAllowedLimit = secAllowedLimit + allowedIteMaxCallsMapping[i];
          secCurrLimit = secCurrLimit + response[i * 2];
        }
      }
      if (isLimitReached) {
        sendResLimitExceeded(errorMsg);
        return;
      }
      if (monthCurrLimit > monthAllowedLimit) {
        errorMsg.msg = "Monthly limits are exceeded";
        errorMsg.counts = monthCurrLimit;
        isLimitReached = true;
      } else if (weekCurrLimit > weekAllowedLimit) {
        errorMsg.msg = "Weekely limits are exceeded";
        errorMsg.counts = weekCurrLimit;
        isLimitReached = true;
      } else if (hourCurrLimit > weekAllowedLimit) {
        errorMsg.msg = "Hourly limits are exceeded";
        errorMsg.counts = hourCurrLimit;
        isLimitReached = true;
      } else if (minCurrLimit > minAllowedLimit) {
        errorMsg.msg = "Minutes limits are exceeded";
        errorMsg.counts = minCurrLimit;
        isLimitReached = true;
      } else if (secCurrLimit > secAllowedLimit) {
        errorMsg.msg = "Seconds limits are exceeded";
        errorMsg.counts = secCurrLimit;
        isLimitReached = true;
      }
      if (isLimitReached) {
        sendResLimitExceeded(errorMsg);
      }

      /***** either reject the request if limits exceeded or by pass the requets for further processing***/
      function sendResLimitExceeded(errorMsg) {
        _this.errorMsg.client = clientName;
        _this.errorMsg.reachedLimits = errorMsg.counts;
        _this.errorMsg.errorMsg = errorMsg.msg;
        res.status(429);
        res.send(_this.errorMsg);
        return;
      }

      return next();
    });
  };
};

module.exports = RateLimiter;

