var Ip = require('../models/ip');

// Add ip address
exports.postIp = function (req, res) {
  var ip = new Ip({
    address: req.params.address,
    name: req.params.name
  });
  ip.save(function (err) {
    if (err) { res.send(err); }
    res.json({message: 'New Ip added.'});
  });
};
