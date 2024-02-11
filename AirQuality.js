
const mongoose = require('mongoose');

const airQualitySchema = new mongoose.Schema({
  city: String,
  aqi: Number, 
  mainPollutant: String,
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  timestamp: { type: Date, default: Date.now }
});

module.exports = mongoose.model('AirQuality', airQualitySchema);
