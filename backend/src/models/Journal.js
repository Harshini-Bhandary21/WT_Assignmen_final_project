const mongoose = require('mongoose');
module.exports = mongoose.model('Journal', new mongoose.Schema(
  { userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true }, text: { type: String, required: true, maxlength: 5000 } },
  { timestamps: true }
));
