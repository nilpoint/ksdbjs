var mongoose = require('mongoose');

var IpSchema = new mongoose.Schema({
  address: {
    type: String,
    unique: true,
    required: true
  },
  username: {
    type: String,
    unique: true,
    required: true
  },
  inserted: {
    type: Date,
    required: true
  }
});

module.exports = mongoose.model('Ip', IpSchema);
