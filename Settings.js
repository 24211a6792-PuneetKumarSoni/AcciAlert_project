const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      default: 'emergency_contacts'
    },
    contacts: [
      {
        type: String,
        required: true,
        trim: true
      }
    ]
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model('Settings', settingsSchema);
