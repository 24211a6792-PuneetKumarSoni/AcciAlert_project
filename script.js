// ====================================================
// AcciAlert Frontend Application Logic (script.js)
// Real-Time Accident Detection & Emergency Response System
// ====================================================

const API_BASE_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? 'http://localhost:5000/api'
  : '/api';

// Application State
const state = {
  activeIncidents: [],
  historicalLogs: [],
  emergencyContacts: [localStorage.getItem('accialert_contact') || '+91 9876543210'],
  map: null,
  mapMarkers: [],
  chart: null,
  sirenAudioEnabled: true,
  audioCtx: null,
  activeTimerId: null,
  countdownSeconds: 15,
  currentEmergencyId: null,
  currentTheme: localStorage.getItem('accialert_theme') || 'dark'
};

// Regional Medical Trauma Centers Database
const hospitalDatabase = [
  { name: 'City Central Trauma Center & ICU', lat: 12.9760, lng: 77.5990, phone: '+91 108 / 080-22998877' },
  { name: 'St. Johns Emergency & Critical Care', lat: 12.9340, lng: 77.6220, phone: '+91 108 / 080-22065000' },
  { name: 'Apollo Emergency Trauma Unit', lat: 12.8950, lng: 77.5980, phone: '+91 1066 / 080-26304050' },
  { name: 'Fortis Emergency Response Unit', lat: 12.8980, lng: 77.6010, phone: '+91 105711' }
];

// DOM Elements
const serverStatusPill = document.getElementById('serverStatusPill');
const serverStatusText = document.getElementById('serverStatusText');
const themeToggleBtn = document.getElementById('themeToggleBtn');
const themeIcon = document.getElementById('themeIcon');
const themeText = document.getElementById('themeText');
const sirenToggleBtn = document.getElementById('sirenToggleBtn');
const sirenStateText = document.getElementById('sirenStateText');
const triggerMockBtn = document.getElementById('triggerMockBtn');
const emergencyBanner = document.getElementById('emergencyBanner');
const cancelAlertBtn = document.getElementById('cancelAlertBtn');
const activeIncidentList = document.getElementById('activeIncidentList');
const activeCount = document.getElementById('activeCount');

// Contact Elements
const contactInput = document.getElementById('contactInput');
const saveContactBtn = document.getElementById('saveContactBtn');
const activeContactText = document.getElementById('activeContactText');

// Hospital & Navigation Elements
const hospitalSectionDesc = document.getElementById('hospitalSectionDesc');
const hospitalList = document.getElementById('hospitalList');
const navGoogleBtn = document.getElementById('navGoogleBtn');
const hardwareResetBtn = document.getElementById('hardwareResetBtn');

// Table & Map Elements
const accidentTableBody = document.getElementById('accidentTableBody');
const exportCsvBtn = document.getElementById('exportCsvBtn');
const recenterMapBtn = document.getElementById('recenterMapBtn');
const footerYear = document.getElementById('footerYear');

// ----------------------------------------------------
// 1. INITIALIZATION & LIFECYCLE
// ----------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initMap();
  initChart();
  setupEventListeners();
  checkServerHealth();
  fetchEmergencyContacts();
  setDynamicYear();
  
  // Start Polling Loops
  setInterval(fetchActiveIncidents, 2500);
  setInterval(fetchHistoricalLogs, 5000);
  setInterval(checkServerHealth, 10000);

  setTimeout(() => {
    if (state.map) state.map.invalidateSize();
  }, 400);
});

function setDynamicYear() {
  if (footerYear) {
    footerYear.innerText = new Date().getFullYear();
  }
}

// ----------------------------------------------------
// 2. THEME SWITCHER MODULE
// ----------------------------------------------------
function initTheme() {
  document.documentElement.setAttribute('data-theme', state.currentTheme);
  updateThemeUI();
}

function toggleTheme() {
  state.currentTheme = state.currentTheme === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', state.currentTheme);
  localStorage.setItem('accialert_theme', state.currentTheme);
  updateThemeUI();
  updateChartColors();
}

function updateThemeUI() {
  if (state.currentTheme === 'light') {
    themeIcon.className = 'fa-solid fa-sun';
    themeText.innerText = 'Light Mode';
  } else {
    themeIcon.className = 'fa-solid fa-moon';
    themeText.innerText = 'Dark Mode';
  }
}

// ----------------------------------------------------
// 3. AUDIO SIREN SYNTHESIZER (Synced with Buzzer Sound)
// ----------------------------------------------------
function playSirenSound() {
  if (!state.sirenAudioEnabled) return;

  try {
    if (!state.audioCtx) {
      state.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    
    if (state.audioCtx.state === 'suspended') {
      state.audioCtx.resume();
    }

    const osc = state.audioCtx.createOscillator();
    const gain = state.audioCtx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(600, state.audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1200, state.audioCtx.currentTime + 0.3);

    gain.gain.setValueAtTime(0.25, state.audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, state.audioCtx.currentTime + 0.3);

    osc.connect(gain);
    gain.connect(state.audioCtx.destination);

    osc.start();
    osc.stop(state.audioCtx.currentTime + 0.3);
  } catch (err) {
    console.warn('Audio policy restriction:', err);
  }
}

// ----------------------------------------------------
// 4. MAP INITIALIZATION & PANNING (Leaflet.js)
// ----------------------------------------------------
function initMap() {
  const defaultLat = 12.9716;
  const defaultLng = 77.5946;

  state.map = L.map('accidentMap', {
    zoomControl: true,
    dragging: true,
    touchZoom: true,
    doubleClickZoom: true,
    scrollWheelZoom: true,
    boxZoom: true,
    keyboard: true,
    attributionControl: false
  }).setView([defaultLat, defaultLng], 13);

  // Carto Voyager Tiles
  L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
    maxZoom: 19
  }).addTo(state.map);

  window.addEventListener('resize', () => {
    if (state.map) state.map.invalidateSize();
  });
}

function updateMapMarkers(incidents) {
  if (!state.map) return;

  state.mapMarkers.forEach(m => state.map.removeLayer(m));
  state.mapMarkers = [];

  if (incidents.length === 0) {
    resetHospitalPanel();
    return;
  }

  incidents.forEach(inc => {
    const isCritical = inc.impactSeverity === 'Critical' || inc.impactSeverity === 'High';
    const markerColor = isCritical ? '#ff3b30' : '#ff9500';

    const crashIcon = L.divIcon({
      className: 'custom-map-icon crash-marker',
      html: `<div style="background:${markerColor}; color:#fff; border-radius:50%; width:36px; height:36px; display:flex; align-items:center; justify-content:center; box-shadow:0 0 20px ${markerColor}; border:2px solid #fff; animation: pulseGlow 1.5s infinite;">
               <i class="fa-solid fa-car-burst"></i>
             </div>`,
      iconSize: [36, 36]
    });

    const marker = L.marker([inc.latitude, inc.longitude], { icon: crashIcon })
      .addTo(state.map)
      .bindPopup(`
        <div style="color:#000;">
          <h4 style="margin-bottom:4px;">🚨 ${inc.vehicleId}</h4>
          <p><strong>Impact Level:</strong> ${inc.impactSeverity}</p>
          <p><strong>Impact Force:</strong> ${inc.gForce} G</p>
          <p><strong>Voice Call:</strong> ${inc.voiceCallStatus || 'DIALED'}</p>
          <p><strong>Emergency Contact:</strong> ${inc.emergencyContacts[0] || state.emergencyContacts[0]}</p>
        </div>
      `);

    state.mapMarkers.push(marker);
  });

  const latest = incidents[0];
  if (latest) {
    state.map.panTo([latest.latitude, latest.longitude], { animate: true, duration: 1.0 });
    updateNearbyHospitals(latest.latitude, latest.longitude);
  }
}

// ----------------------------------------------------
// 5. DYNAMIC ACCIDENT LOCATION NEARBY HOSPITALS
// ----------------------------------------------------
function calculateDistanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return (R * c).toFixed(1);
}

function updateNearbyHospitals(crashLat, crashLng) {
  hospitalSectionDesc.innerText = `Trauma centers calculated for crash coordinates (${crashLat.toFixed(4)}, ${crashLng.toFixed(4)}):`;

  const sorted = hospitalDatabase.map(h => {
    const dist = calculateDistanceKm(crashLat, crashLng, h.lat, h.lng);
    return { ...h, distance: parseFloat(dist) };
  }).sort((a, b) => a.distance - b.distance);

  const topHospitals = sorted.slice(0, 2);

  hospitalList.innerHTML = topHospitals.map(h => `
    <div class="hospital-info-box">
      <div class="hospital-icon"><i class="fa-solid fa-house-medical"></i></div>
      <div class="hospital-details">
        <h4>${h.name}</h4>
        <p><i class="fa-solid fa-location-dot"></i> Distance: <strong>${h.distance} km</strong></p>
        <p><i class="fa-solid fa-phone"></i> Emergency: <strong>${h.phone}</strong></p>
      </div>
    </div>
  `).join('');

  const closest = topHospitals[0];
  if (closest) {
    navGoogleBtn.classList.remove('hidden');
    navGoogleBtn.href = `https://www.google.com/maps/dir/?api=1&origin=${crashLat},${crashLng}&destination=${closest.lat},${closest.lng}`;
  }
}

function resetHospitalPanel() {
  hospitalSectionDesc.innerText = 'Awaiting accident location coordinates...';
  hospitalList.innerHTML = `
    <div class="empty-state" style="padding: 1.5rem 0.5rem;">
      <i class="fa-solid fa-hospital" style="font-size: 2rem; color: var(--text-muted); margin-bottom: 0.5rem;"></i>
      <p style="font-size: 0.82rem;">Nearest medical trauma centers will display automatically based on detected crash coordinates.</p>
    </div>`;
  navGoogleBtn.classList.add('hidden');
}

// ----------------------------------------------------
// 6. CHART INITIALIZATION (Chart.js)
// ----------------------------------------------------
function initChart() {
  const ctx = document.getElementById('collisionChart').getContext('2d');
  state.chart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: ['10m ago', '8m ago', '6m ago', '4m ago', '2m ago', 'Now'],
      datasets: [
        {
          label: 'Impact Force Sensor (G)',
          data: [0, 0, 0, 0, 0, 0],
          borderColor: '#ff3b30',
          backgroundColor: 'rgba(255, 59, 48, 0.15)',
          borderWidth: 3,
          fill: true,
          tension: 0.4
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: getTextColor() } }
      },
      scales: {
        x: { ticks: { color: getTextColor() }, grid: { color: 'rgba(0,0,0,0.05)' } },
        y: { ticks: { color: getTextColor() }, grid: { color: 'rgba(0,0,0,0.05)' } }
      }
    }
  });
}

function getTextColor() {
  return state.currentTheme === 'light' ? '#0f172a' : '#8e9bb0';
}

function updateChartColors() {
  if (!state.chart) return;
  state.chart.options.plugins.legend.labels.color = getTextColor();
  state.chart.options.scales.x.ticks.color = getTextColor();
  state.chart.options.scales.y.ticks.color = getTextColor();
  state.chart.update();
}

// ----------------------------------------------------
// 7. SERVER & DATABASE HEALTH MONITORING
// ----------------------------------------------------
async function checkServerHealth() {
  try {
    const res = await fetch(`${API_BASE_URL}/health`);
    const data = await res.json();
    if (data.status === 'ONLINE') {
      serverStatusPill.querySelector('.status-dot').className = 'status-dot green';
      serverStatusText.innerText = 'Server: Connected';
    }
  } catch (err) {
    serverStatusPill.querySelector('.status-dot').className = 'status-dot red';
    serverStatusText.innerText = 'Server: Disconnected';
  }
}

async function fetchEmergencyContacts() {
  try {
    const res = await fetch(`${API_BASE_URL}/settings/contacts`);
    const data = await res.json();
    if (data.success && data.contacts.length > 0) {
      state.emergencyContacts = data.contacts;
      localStorage.setItem('accialert_contact', data.contacts[0]);
      renderContactsUI();
    }
  } catch (err) {
    renderContactsUI();
  }
}

async function fetchActiveIncidents() {
  try {
    const res = await fetch(`${API_BASE_URL}/accidents/active`);
    const data = await res.json();
    if (data.success) {
      state.activeIncidents = data.data;
      renderActiveIncidents(data.data);
      updateMapMarkers(data.data);

      const hasCritical = data.data.some(i => i.status === 'ALERTED');
      if (hasCritical) {
        showEmergencyBanner(data.data[0]);
        playSirenSound();
      } else {
        hideEmergencyBanner();
      }
    }
  } catch (err) {
    console.warn('Incident fetch error');
  }
}

async function fetchHistoricalLogs() {
  try {
    const res = await fetch(`${API_BASE_URL}/accidents?limit=25`);
    const data = await res.json();
    if (data.success) {
      state.historicalLogs = data.data;
      renderAccidentTable(data.data);
      updateChartWithRealLogs(data.data);
    }
  } catch (err) {
    console.warn('History fetch error');
  }
}

function updateChartWithRealLogs(logs) {
  if (!state.chart || logs.length === 0) return;
  const recentLogs = [...logs].reverse().slice(-6);
  const labels = recentLogs.map(l => new Date(l.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
  const values = recentLogs.map(l => l.gForce);

  state.chart.data.labels = labels;
  state.chart.data.datasets[0].data = values;
  state.chart.update();
}

// ----------------------------------------------------
// 8. UI RENDERERS
// ----------------------------------------------------
function renderContactsUI() {
  const current = state.emergencyContacts[0] || localStorage.getItem('accialert_contact') || '+91 9876543210';
  contactInput.value = current;
  activeContactText.innerText = current;
}

function renderActiveIncidents(incidents) {
  activeCount.innerText = `${incidents.length} Active`;

  if (incidents.length === 0) {
    activeIncidentList.innerHTML = `
      <div class="empty-state">
        <i class="fa-solid fa-shield-heart"></i>
        <p>No active emergencies reported. Sensors armed and monitoring.</p>
      </div>`;
    return;
  }

  activeIncidentList.innerHTML = incidents.map(inc => `
    <div class="incident-card">
      <div class="incident-info">
        <h4>
          <i class="fa-solid fa-triangle-exclamation" style="color:#ff3b30;"></i>
          ${inc.vehicleId}
          <span class="severity-tag ${inc.impactSeverity.toLowerCase()}">${inc.impactSeverity}</span>
        </h4>
        <p><i class="fa-solid fa-phone-volume" style="color:#34c759;"></i> Voice Call Status: <strong>${inc.voiceCallStatus || 'DIALED'}</strong></p>
        <p><i class="fa-solid fa-mobile-retro"></i> Call Target: <strong>${inc.emergencyContacts[0] || state.emergencyContacts[0]}</strong></p>
        <p><i class="fa-solid fa-location-crosshairs"></i> Impact Force: <strong>${inc.gForce} G</strong> | Lat: ${inc.latitude.toFixed(4)}, Lng: ${inc.longitude.toFixed(4)}</p>
      </div>
      <div class="incident-actions">
        <button class="btn btn-sm btn-success-lg" onclick="handleHardwareReset('${inc._id}')">
          <i class="fa-solid fa-circle-check"></i> I AM OK
        </button>
      </div>
    </div>
  `).join('');
}

function renderAccidentTable(logs) {
  if (logs.length === 0) return;

  accidentTableBody.innerHTML = logs.map(item => `
    <tr>
      <td>${new Date(item.timestamp).toLocaleTimeString()}</td>
      <td><strong>${item.vehicleId}</strong></td>
      <td><span style="color:#ff3b30; font-weight:700;">${item.gForce} G</span></td>
      <td>${item.emergencyContacts[0] || state.emergencyContacts[0]}</td>
      <td><span class="severity-tag ${item.impactSeverity.toLowerCase()}">${item.impactSeverity}</span></td>
      <td><span style="color:#34c759; font-weight:600;"><i class="fa-solid fa-phone"></i> ${item.voiceCallStatus || 'DIALED'}</span></td>
      <td><span class="status-pill ${item.status}">${item.status}</span></td>
      <td>
        <button class="btn btn-sm btn-outline" onclick="focusIncidentOnMap(${item.latitude}, ${item.longitude})">
          <i class="fa-solid fa-eye"></i> View Location
        </button>
      </td>
    </tr>
  `).join('');
}

function showEmergencyBanner(incident) {
  emergencyBanner.classList.remove('hidden');
  document.getElementById('bannerVehicle').innerText = incident.vehicleId;
  document.getElementById('bannerGforce').innerText = `${incident.gForce} G`;
  document.getElementById('bannerSeverity').innerText = incident.impactSeverity;
  document.getElementById('bannerContactNumber').innerText = incident.emergencyContacts[0] || state.emergencyContacts[0];
  state.currentEmergencyId = incident._id;
  startGracePeriodTimer();
}

function hideEmergencyBanner() {
  emergencyBanner.classList.add('hidden');
  if (state.activeTimerId) {
    clearInterval(state.activeTimerId);
    state.activeTimerId = null;
  }
}

function startGracePeriodTimer() {
  if (state.activeTimerId) return;
  state.countdownSeconds = 15;
  document.getElementById('graceTimer').innerText = state.countdownSeconds;

  state.activeTimerId = setInterval(() => {
    state.countdownSeconds--;
    document.getElementById('graceTimer').innerText = state.countdownSeconds;

    if (state.countdownSeconds <= 0) {
      clearInterval(state.activeTimerId);
      state.activeTimerId = null;
      if (state.currentEmergencyId) {
        updateIncidentStatus(state.currentEmergencyId, 'DISPATCHED');
      }
    }
  }, 1000);
}

// ----------------------------------------------------
// 9. EVENT HANDLERS & CONTACT SYNC
// ----------------------------------------------------
function setupEventListeners() {
  themeToggleBtn.addEventListener('click', toggleTheme);

  sirenToggleBtn.addEventListener('click', () => {
    state.sirenAudioEnabled = !state.sirenAudioEnabled;
    sirenStateText.innerText = state.sirenAudioEnabled ? 'ON' : 'OFF';
    sirenToggleBtn.className = state.sirenAudioEnabled ? 'btn btn-secondary' : 'btn btn-outline';
  });

  saveContactBtn.addEventListener('click', saveEmergencyContact);

  triggerMockBtn.addEventListener('click', async () => {
    try {
      triggerMockBtn.innerText = 'Triggering...';
      await fetch(`${API_BASE_URL}/accidents/mock`, { method: 'POST' });
      triggerMockBtn.innerHTML = '<i class="fa-solid fa-bolt"></i> Simulate Accident Trigger';
      fetchActiveIncidents();
      fetchHistoricalLogs();
    } catch (err) {
      alert('Mock trigger failed. Ensure server.js backend is running!');
      triggerMockBtn.innerHTML = '<i class="fa-solid fa-bolt"></i> Simulate Accident Trigger';
    }
  });

  cancelAlertBtn.addEventListener('click', () => handleHardwareReset());
  hardwareResetBtn.addEventListener('click', () => handleHardwareReset());

  exportCsvBtn.addEventListener('click', exportLogsToCsv);

  recenterMapBtn.addEventListener('click', () => {
    if (state.activeIncidents.length > 0) {
      const top = state.activeIncidents[0];
      state.map.setView([top.latitude, top.longitude], 15, { animate: true });
    }
  });
}

async function saveEmergencyContact() {
  const val = contactInput.value.trim();
  if (!val) {
    alert('Please enter a valid emergency phone number (e.g. +91 9876543210)');
    return;
  }

  try {
    saveContactBtn.innerText = 'Saving...';
    localStorage.setItem('accialert_contact', val);
    state.emergencyContacts = [val];
    renderContactsUI();

    const res = await fetch(`${API_BASE_URL}/settings/contacts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contacts: [val] })
    });
    const data = await res.json();
    saveContactBtn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Save & Sync Contact';
    if (data.success) {
      alert(`Emergency contact saved: ${val}.\nPersisted in MongoDB Atlas & browser storage.`);
    }
  } catch (err) {
    saveContactBtn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Save & Sync Contact';
    alert(`Emergency contact saved locally: ${val}`);
  }
}

async function handleHardwareReset(targetId = null) {
  try {
    const id = targetId || state.currentEmergencyId || (state.activeIncidents[0] ? state.activeIncidents[0]._id : 'latest');
    await fetch(`${API_BASE_URL}/accidents/${id}/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: 'User clicked I AM OK button on website', vehicleId: 'VEH-IN-9874' })
    });
    hideEmergencyBanner();
    fetchActiveIncidents();
    fetchHistoricalLogs();
    alert('Alert disarmed and hardware reset signal delivered.');
  } catch (err) {
    console.error('Hardware reset error:', err);
  }
}

async function updateIncidentStatus(id, newStatus) {
  try {
    await fetch(`${API_BASE_URL}/accidents/${id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus, notes: `Status updated to ${newStatus}` })
    });
    fetchActiveIncidents();
    fetchHistoricalLogs();
  } catch (err) {
    console.error('Failed updating status:', err);
  }
}

function focusIncidentOnMap(lat, lng) {
  if (state.map) {
    state.map.setView([lat, lng], 16, { animate: true });
    window.scrollTo({ top: 380, behavior: 'smooth' });
  }
}

function exportLogsToCsv() {
  if (state.historicalLogs.length === 0) {
    alert('No accident logs available to export.');
    return;
  }

  let csvContent = 'data:text/csv;charset=utf-8,';
  csvContent += 'Timestamp,VehicleID,ImpactForce,EmergencyContact,VoiceCallStatus,Severity,Status,Latitude,Longitude\n';

  state.historicalLogs.forEach(row => {
    const contact = row.emergencyContacts[0] || state.emergencyContacts[0];
    csvContent += `"${row.timestamp}","${row.vehicleId}",${row.gForce},"${contact}","${row.voiceCallStatus || 'DIALED'}","${row.impactSeverity}","${row.status}",${row.latitude},${row.longitude}\n`;
  });

  const encodedUri = encodeURI(csvContent);
  const link = document.createElement('a');
  link.setAttribute('href', encodedUri);
  link.setAttribute('download', `AcciAlert_Accident_Logs_${Date.now()}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
