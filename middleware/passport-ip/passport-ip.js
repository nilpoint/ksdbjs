var util = require('util'),
    Strategy = require('passport-strategy');

function IpStrategy(verify) {
  Strategy.call(this);

  this.name = 'ip';
  this._verify = verify;
  this._realm = 'IPs';
}

util.inherits(IpStrategy, Strategy);

IpStrategy.prototype.authenticate = function (req) {
  var ip = req.headers['x-real-ip'] || req.headers['x-forwarded-for'] || req.connection.remoteAddress;

  // ip may include both ipv6 and ipv4 seperated by colon (:)
  if (ip.lastIndexOf(':') > 1) {
    var parts = ip.split(':');
    ip = parts[parts.length - 1];
  }

  // ip may include multiple IPs seperated by semicolon (,)
  if (ip.lastIndexOf(',') > 1) {
    var parts = ip.split(',');
    ip = parts[parts.length - 1].trim();
  }

  var self = this;

  function verified(err, ip) {
    if (err) { return self.error(err); }
    if (!ip) { return self.fail(self._challenge()); }
    self.success(ip);
  }

  if (self._passReqToCallback) {
    this._verify(req, ip, verified);
  } else {
    this._verify(ip, verified);
  }
};

/**
 * Authentication challenge.
 *
 * @api private
 */
IpStrategy.prototype._challenge = function() {
  return 'Basic realm="' + this._realm + '"';
}

module.exports = IpStrategy;
