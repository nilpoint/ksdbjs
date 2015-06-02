var passport = require('passport'),
    BasicStrategy = require('passport-http').BasicStrategy,
    IpStrategy = require('../middleware/passport-ip').IpStrategy,
    User = require('../models/user'),
    Ip = require('../models/ip');

passport.use(new BasicStrategy(
  function (username, password, callback) {
    User.findOne({ username: username }, function (err, user) {
      if (err) { return callback(err); }

      if (!user) { return callback(null, false); }

      user.verifyPassword(password, function (err, isMatch) {
        if (err) { return callback(err); }
        if (!isMatch) { return callback(null, false); }
        return callback(null, user);
      });
    });
  }
));

passport.use(new IpStrategy(
  function (address, done) {
    Ip.findOne({address: address}, function (err, ip) {
      if (err) { return done(err); }
      if (!ip) { return done(null, false); }
      return done(null, ip);
    })
  }
));

exports.isAuthenticated = passport.authenticate(['basic', 'ip'], { session: false });
