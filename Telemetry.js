const mongoose = require('mongoose');

const telemetrySchema = new mongoose.Schema(
  {
    vehicleId: {
      type: String,
      required: true,
      default: 'VEH-IN-9874'
    },
    latitude: {
      type: Number,
      required: true
    },
    longitude: {
      type: Number,
      required: true
    },
    speed: {
      type: Number,
      default: 0
    },
    gForce: {
      type: Number,
      default: 1.0
    },
    satellites: {
      type: Number,
      default: 8
    },
    gsmSignal: {
      type: Number,
      default: 24 // Signal strength in dBm / CSQ
    },
    batteryVoltage: {
      type: Number,
      default: 12.4
    },
    timestamp: {
      type: Date,
      default: Date.now
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model('Telemetry', telemetrySchema);
