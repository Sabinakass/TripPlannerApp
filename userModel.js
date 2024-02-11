const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true }, 
  creationDate: { type: Date, default: Date.now },
  updateDate: Date,
  deletionDate: { type: Date, default: null },
  isAdmin: { type: Boolean, default: false },
});

module.exports = mongoose.model('User', userSchema);
