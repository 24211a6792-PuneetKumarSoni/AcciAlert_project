const mongoose = require('mongoose');

const accidentSchema = new mongoose.Schema(
  {
    vehicleId: {
      type: String,
      required: true,
      trim: true,
      default: 'VEH-IN-9874'
    },
    driverName: {
      type: String,
      default: 'Rahul Sharma'
    },
    emergencyContacts: [
      {
        type: String,
        default: '+91 9876543210'
      }
    ],
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
      default: 0 // Speed in km/h
    },
    gForce: {
      type: Number,
      required: true // Vector magnitude G-force from ADXL345
    },
    gForceAxis: {
      x: { type: Number, default: 0 },
      y: { type: Number, default: 0 },
      z: { type: Number, default: 0 }
    },
    rolloverDetected: {
      type: Boolean,
      default: false
    },
    impactSeverity: {
      type: String,
      enum: ['Low', 'Medium', 'High', 'Critical'],
      default: 'High'
    },
    status: {
      type: String,
      enum: ['ALERTED', 'DISPATCHED', 'ON_SCENE', 'RESOLVED', 'FALSE_ALARM'],
      default: 'ALERTED'
    },
    locationName: {
      type: String,
      default: 'Highway NH-44, KM 142 Near Medical City Enclave'
    },
    satellites: {
      type: Number,
      default: 0
    },
    gsmSignal: {
      type: Number,
      default: 0
    },
    voiceCallStatus: {
      type: String,
      enum: ['DIALED', 'FAILED', 'PENDING', 'NOT_TRIGGERED'],
      default: 'DIALED'
    },
    notes: {
      type: String,
      default: ''
    },
    assignedAmbulanceUnit: {
      type: String,
      default: 'Unassigned'
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

// Pre-save hook to calculate severity automatically if not provided
accidentSchema.pre('save', function (next) {
  if (this.gForce >= 5.0 || this.rolloverDetected) {
    this.impactSeverity = 'Critical';
  } else if (this.gForce >= 3.5) {
    this.impactSeverity = 'High';
  } else if (this.gForce >= 2.5) {
    this.impactSeverity = 'Medium';
  } else {
    this.impactSeverity = 'Low';
  }
  next();
});

module.exports = mongoose.model('Accident', accidentSchema);
