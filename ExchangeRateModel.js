
const mongoose = require('mongoose');

const exchangeRateSchema = new mongoose.Schema({
  fromCurrency: String,
  toCurrency: String,
  rate: Number,
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  timestamp: { type: Date, default: Date.now }
});

module.exports = mongoose.model('ExchangeRate', exchangeRateSchema);
