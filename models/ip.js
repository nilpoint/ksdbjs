var mongoose = require('mongoose');

var IpSchema = new mongoose.Schema({
  address: {
    type: String,
    unique: true,
    required: true
  },
  name: {
    type: String,
    unique: true,
    required: true
  }
});

module.exports = mongoose.model('Ip', IpSchema);
