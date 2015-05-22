var User = require('../models/user');

// Create endpoint for adding a user
exports.postUser = function (req, res) {
  var user = new User({
    username: req.params.username,
    password: req.params.password
  });
  user.save(function (err) {
    if (err) { res.send(err); }
    res.json({ message: 'New user added.'});
  });
};
