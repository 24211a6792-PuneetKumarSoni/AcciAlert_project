require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 5000;

// Enable CORS 
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static frontend web files directly (index.html, styles.css, script.js)
app.use(express.static(path.join(__dirname, '../frontend')));

// MongoDB Atlas Connection URL
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://puneetkumarsoni79_db_user:ozO9Qx2iGSQTfp1Q@cluster0.rnm4p14.mongodb.net/AcciAlert?retryWrites=true&w=majority';

// INLINE MONGOOSE SCHEMAS & MODELS
const accidentSchema = new mongoose.Schema({
  vehicleId: { type: String, default: 'VEHICLE #1' },
  driverName: { type: String, default: 'Registered Driver' },
  emergencyContacts: [{ type: String, default: '+91 9876543210' }],
  latitude: { type: Number, required: true },
  longitude: { type: Number, required: true },
  speed: { type: Number, default: 0 },
  gForce: { type: Number, required: true },
  gForceAxis: {
    x: { type: Number, default: 0 },
    y: { type: Number, default: 0 },
    z: { type: Number, default: 0 }
  },
  rolloverDetected: { type: Boolean, default: false },
  impactSeverity: { type: String, enum: ['Low', 'Medium', 'High', 'Critical'], default: 'High' },
  status: { type: String, enum: ['ALERTED', 'DISPATCHED', 'ON_SCENE', 'RESOLVED', 'FALSE_ALARM'], default: 'ALERTED' },
  satellites: { type: Number, default: 0 },
  gsmSignal: { type: Number, default: 0 },
  voiceCallStatus: { type: String, default: 'DIALED' },
  locationName: { type: String, default: 'Live GPS Location' },
  notes: { type: String, default: '' },
  assignedAmbulanceUnit: { type: String, default: 'Unassigned' },
  timestamp: { type: Date, default: Date.now }
}, { timestamps: true });

const telemetrySchema = new mongoose.Schema({
  vehicleId: { type: String, default: 'VEHICLE #1' },
  latitude: { type: Number, required: true },
  longitude: { type: Number, required: true },
  speed: { type: Number, default: 0 },
  gForce: { type: Number, default: 1.0 },
  satellites: { type: Number, default: 0 },
  gsmSignal: { type: Number, default: 0 },
  timestamp: { type: Date, default: Date.now }
}, { timestamps: true });

const settingsSchema = new mongoose.Schema({
  key: { type: String, default: 'emergency_contacts', unique: true },
  contacts: [{ type: String, default: '+91 9876543210' }]
}, { timestamps: true });

const Accident = mongoose.model('Accident', accidentSchema);
const Telemetry = mongoose.model('Telemetry', telemetrySchema);
const Settings = mongoose.model('Settings', settingsSchema);

// In-Memory Storage Fallback State
let isMongoConnected = false;
const inMemoryAccidents = [];
const inMemoryTelemetry = [];
let activeEmergencyContacts = ['+91 9876543210'];
const resetSignals = {};

// MongoDB Atlas Connection Setup
const connectDB = async () => {
  if (!MONGODB_URI || MONGODB_URI.includes('your_password')) {
    console.warn('⚠️ MONGODB_URI contains placeholder password. Running in local storage fallback mode.');
    return;
  }
  try {
    await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
    isMongoConnected = true;
    console.log('✅ Connected successfully to MongoDB Atlas Database!');
    
    // Load persisted Emergency Contact from MongoDB Atlas
    const savedSettings = await Settings.findOne({ key: 'emergency_contacts' });
    if (savedSettings && savedSettings.contacts.length > 0) {
      activeEmergencyContacts = savedSettings.contacts;
      console.log('📱 Loaded Emergency Contact from MongoDB Atlas:', activeEmergencyContacts);
    }
  } catch (err) {
    console.error('❌ MongoDB Connection Error:', err.message);
    console.warn('⚠️ Running in local storage fallback mode.');
  }
};
connectDB();

// API ROUTES
// Health Check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ONLINE',
    system: 'AcciAlert Emergency API Server',
    databaseConnected: isMongoConnected,
    timestamp: new Date()
  });
});

//Emergency Contact Settings Endpoints
app.get('/api/settings/contacts', async (req, res) => {
  try {
    if (isMongoConnected) {
      const savedSettings = await Settings.findOne({ key: 'emergency_contacts' });
      if (savedSettings && savedSettings.contacts.length > 0) {
        activeEmergencyContacts = savedSettings.contacts;
      }
    }
    res.json({ success: true, contacts: activeEmergencyContacts });
  } catch (err) {
    res.json({ success: true, contacts: activeEmergencyContacts });
  }
});

app.post('/api/settings/contacts', async (req, res) => {
  try {
    const { contacts } = req.body;
    if (!contacts || !Array.isArray(contacts) || contacts.length === 0) {
      return res.status(400).json({ success: false, message: 'Invalid contacts payload.' });
    }
    
    activeEmergencyContacts = contacts.map(c => c.trim()).filter(c => c.length > 0);
    
    if (isMongoConnected) {
      await Settings.findOneAndUpdate(
        { key: 'emergency_contacts' },
        { contacts: activeEmergencyContacts },
        { upsert: true, new: true }
      );
      console.log('💾 Emergency Contact saved to MongoDB Atlas:', activeEmergencyContacts);
    }
    
    res.json({ success: true, message: 'Emergency contact updated successfully!', contacts: activeEmergencyContacts });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Hardware Config & Reset Sync Polling Endpoint
app.get('/api/hardware/config', (req, res) => {
  const vehicleId = req.query.vehicleId || 'VEH-IN-9874';
  const shouldReset = resetSignals[vehicleId] || false;
  if (shouldReset) {
    resetSignals[vehicleId] = false;
  }
  res.json({
    success: true,
    vehicleId,
    emergencyContact: activeEmergencyContacts[0] || '+919876543210',
    allContacts: activeEmergencyContacts,
    resetSignal: shouldReset
  });
});

// Hardware Trigger Endpoint (Arduino GPRS HTTP POST target)
app.post('/api/accidents/trigger', async (req, res) => {
  try {
    console.log('🚨 ACCIDENT TRIGGER RECEIVED FROM HARDWARE:', req.body);
    const {
      vehicleId,
      latitude,
      longitude,
      gForce,
      gx,
      gy,
      gz,
      rollover,
      satellites,
      gsmSignal,
      voiceCallStatus,
      driverName
    } = req.body;

    const parsedLat = parseFloat(latitude);
    const parsedLng = parseFloat(longitude);
    const parsedG = parseFloat(gForce) || 3.0;

    if (isNaN(parsedLat) || isNaN(parsedLng)) {
      return res.status(400).json({ success: false, message: 'Invalid GPS coordinates.' });
    }

    let severity = 'Medium';
    if (parsedG >= 5.0 || rollover === 'true' || rollover === true) {
      severity = 'Critical';
    } else if (parsedG >= 3.5) {
      severity = 'High';
    }

    const newAccidentData = {
      _id: 'acc_' + Date.now(),
      vehicleId: vehicleId || 'VEHICLE #1',
      driverName: driverName || 'Registered Driver',
      emergencyContacts: activeEmergencyContacts,
      latitude: parsedLat,
      longitude: parsedLng,
      speed: 0,
      gForce: parsedG,
      gForceAxis: {
        x: parseFloat(gx) || 0,
        y: parseFloat(gy) || 0,
        z: parseFloat(gz) || 0
      },
      rolloverDetected: rollover === 'true' || rollover === true,
      impactSeverity: severity,
      status: 'ALERTED',
      satellites: parseInt(satellites) || 0,
      gsmSignal: parseInt(gsmSignal) || 0,
      voiceCallStatus: voiceCallStatus || 'DIALED',
      locationName: `Lat: ${parsedLat.toFixed(5)}, Lng: ${parsedLng.toFixed(5)} (Live Location)`,
      notes: `Triggered by Impact Force Sensor. Call & SMS sent to ${activeEmergencyContacts[0]}.`,
      assignedAmbulanceUnit: 'Pending Dispatch',
      timestamp: new Date()
    };

    let savedAccident;
    if (isMongoConnected) {
      const accidentDoc = new Accident(newAccidentData);
      savedAccident = await accidentDoc.save();
    } else {
      inMemoryAccidents.unshift(newAccidentData);
      savedAccident = newAccidentData;
    }

    res.status(201).json({
      success: true,
      message: '🚨 Accident Alert Registered!',
      targetEmergencyContact: activeEmergencyContacts[0],
      accident: savedAccident
    });
  } catch (error) {
    console.error('Error handling accident trigger:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 5. Get Active Emergencies
app.get('/api/accidents/active', async (req, res) => {
  try {
    if (isMongoConnected) {
      const active = await Accident.find({ status: { $in: ['ALERTED', 'DISPATCHED', 'ON_SCENE'] } }).sort({ timestamp: -1 });
      return res.json({ success: true, count: active.length, data: active });
    }
    const active = inMemoryAccidents.filter(a => ['ALERTED', 'DISPATCHED', 'ON_SCENE'].includes(a.status));
    res.json({ success: true, count: active.length, data: active });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get All Accident Logs
app.get('/api/accidents', async (req, res) => {
  try {
    const { status, severity, limit = 50 } = req.query;

    if (isMongoConnected) {
      let query = {};
      if (status) query.status = status;
      if (severity) query.impactSeverity = severity;
      const logs = await Accident.find(query).sort({ timestamp: -1 }).limit(parseInt(limit));
      return res.json({ success: true, count: logs.length, data: logs });
    }

    let logs = [...inMemoryAccidents];
    if (status) logs = logs.filter(a => a.status === status);
    if (severity) logs = logs.filter(a => a.impactSeverity === severity);
    res.json({ success: true, count: logs.length, data: logs.slice(0, parseInt(limit)) });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update Incident Status
app.patch('/api/accidents/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, assignedAmbulanceUnit, notes } = req.body;

    const allowedStatuses = ['ALERTED', 'DISPATCHED', 'ON_SCENE', 'RESOLVED', 'FALSE_ALARM'];
    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status parameter.' });
    }

    if (isMongoConnected) {
      const updated = await Accident.findByIdAndUpdate(
        id,
        {
          ...(status && { status }),
          ...(assignedAmbulanceUnit && { assignedAmbulanceUnit }),
          ...(notes && { notes })
        },
        { new: true }
      );
      return res.json({ success: true, message: 'Status updated successfully', data: updated });
    }

    const item = inMemoryAccidents.find(a => a._id === id || a._id.toString() === id);
    if (item) {
      if (status) item.status = status;
      if (assignedAmbulanceUnit) item.assignedAmbulanceUnit = assignedAmbulanceUnit;
      if (notes) item.notes = notes;
    }

    res.json({ success: true, message: 'Status updated successfully', data: item });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Cancel Alert & Hardware Reset ("I AM OK" button action)
app.post('/api/accidents/:id/cancel', async (req, res) => {
  try {
    const { id } = req.params;
    const { reason, vehicleId } = req.body;
    const targetVeh = vehicleId || 'VEH-IN-9874';

    resetSignals[targetVeh] = true;
    console.log(`🔄 HARDWARE RESET SIGNAL TRIGGERED for Vehicle: ${targetVeh}`);

    if (isMongoConnected) {
      const updated = await Accident.findByIdAndUpdate(
        id,
        { status: 'FALSE_ALARM', notes: `Canceled by driver (I AM OK): ${reason || 'User reset alert'}` },
        { new: true }
      );
      return res.json({ success: true, message: 'Alert canceled and hardware reset signal sent.', data: updated });
    }

    const item = inMemoryAccidents.find(a => a._id === id || a._id.toString() === id);
    if (item) {
      item.status = 'FALSE_ALARM';
      item.notes = `Canceled by driver (I AM OK): ${reason || 'User reset alert'}`;
    }
    res.json({ success: true, message: 'Alert canceled and hardware reset signal sent.', data: item });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

//Hardware Telemetry Log Route
app.post('/api/telemetry', async (req, res) => {
  try {
    const { vehicleId, latitude, longitude, gForce, satellites, gsmSignal } = req.body;
    const data = {
      vehicleId: vehicleId || 'VEHICLE #1',
      latitude: parseFloat(latitude) || 12.9716,
      longitude: parseFloat(longitude) || 77.5946,
      speed: 0,
      gForce: parseFloat(gForce) || 0.0,
      satellites: parseInt(satellites) || 0,
      gsmSignal: parseInt(gsmSignal) || 0,
      timestamp: new Date()
    };

    if (isMongoConnected) {
      const doc = new Telemetry(data);
      await doc.save();
    } else {
      inMemoryTelemetry.unshift(data);
      if (inMemoryTelemetry.length > 50) inMemoryTelemetry.pop();
    }

    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Fetch Latest Telemetry
app.get('/api/telemetry/latest', async (req, res) => {
  try {
    if (isMongoConnected) {
      const latest = await Telemetry.find().sort({ timestamp: -1 }).limit(10);
      return res.json({ success: true, data: latest });
    }
    res.json({ success: true, data: inMemoryTelemetry.slice(0, 10) });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Test Hardware Trigger Simulator (Recursion Free Stack Overflow Fix)
app.post('/api/accidents/mock', async (req, res) => {
  try {
    const sampleLocations = [
      { name: 'Sector 4 Highway Intersection', lat: 12.9716, lng: 77.5946 },
      { name: 'Koramangala Ring Road', lat: 12.9345, lng: 77.6212 },
      { name: 'Electronic City Toll Gate', lat: 12.8452, lng: 77.6602 }
    ];
    const loc = sampleLocations[Math.floor(Math.random() * sampleLocations.length)];
    const gForceVal = (Math.random() * 3.5 + 2.8).toFixed(2);

    const mockData = {
      _id: 'acc_' + Date.now(),
      vehicleId: 'VEHICLE #1',
      driverName: 'Registered Driver',
      emergencyContacts: activeEmergencyContacts,
      latitude: loc.lat,
      longitude: loc.lng,
      speed: 0,
      gForce: parseFloat(gForceVal),
      gForceAxis: {
        x: (parseFloat(gForceVal) * 0.6).toFixed(2),
        y: (parseFloat(gForceVal) * 0.7).toFixed(2),
        z: (parseFloat(gForceVal) * 0.4).toFixed(2)
      },
      rolloverDetected: Math.random() > 0.7,
      impactSeverity: parseFloat(gForceVal) >= 5.0 ? 'Critical' : 'High',
      status: 'ALERTED',
      satellites: Math.floor(Math.random() * 6 + 6),
      gsmSignal: Math.floor(Math.random() * 10 + 20),
      voiceCallStatus: 'DIALED',
      locationName: loc.name,
      notes: 'Mock accident trigger simulator.',
      assignedAmbulanceUnit: 'Pending Dispatch',
      timestamp: new Date()
    };

    let savedAccident;
    if (isMongoConnected) {
      const accidentDoc = new Accident(mockData);
      savedAccident = await accidentDoc.save();
    } else {
      inMemoryAccidents.unshift(mockData);
      savedAccident = mockData;
    }

    res.status(201).json({
      success: true,
      message: '🚨 Accident Alert Registered!',
      targetEmergencyContact: activeEmergencyContacts[0],
      accident: savedAccident
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Fallback SPA routing
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// Start Express Server
app.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`🚀 AcciAlert Server active on http://localhost:${PORT}`);
  console.log(`====================================================`);
});
