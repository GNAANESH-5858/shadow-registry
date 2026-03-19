// Basic config – replace with your own Supabase values in production, or
// inject via a small inline script that reads from environment on the server.
const SUPABASE_URL = window.SHADOW_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = window.SHADOW_SUPABASE_ANON_KEY || '';

let supabaseClient = null;
if (SUPABASE_URL && SUPABASE_ANON_KEY && window.supabase) {
  supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

const state = {
  sessionToken: null,
  sessionId: null,
  lastScores: null,
  map: null,
  layers: {
    breadcrumbs: null,
    ipMarker: null
  },
  peerPollInterval: null
};

const identityForm = document.getElementById('identityForm');
const identityBtn = document.getElementById('identityBtn');
const identityError = document.getElementById('identityError');
const otpBlock = document.getElementById('otpBlock');
const nameInput = document.getElementById('nameInput');
const phoneInput = document.getElementById('phoneInput');
const otpInput = document.getElementById('otpInput');

const sessionInfo = document.getElementById('sessionInfo');
const sessionTokenText = document.getElementById('sessionTokenText');
const peerLink = document.getElementById('peerLink');

const useIpBtn = document.getElementById('useIpBtn');
const verifyBtn = document.getElementById('verifyBtn');
const latInput = document.getElementById('latInput');
const lngInput = document.getElementById('lngInput');
const osmInfo = document.getElementById('osmInfo');
const ipInfo = document.getElementById('ipInfo');

const scoreValue = document.getElementById('scoreValue');
const satelliteRow = document.getElementById('satelliteRow');
const densityRow = document.getElementById('densityRow');
const peersRow = document.getElementById('peersRow');
const ipRow = document.getElementById('ipRow');
const downloadPdfBtn = document.getElementById('downloadPdfBtn');
const blockchainInfo = document.getElementById('blockchainInfo');

const statusEncrypted = document.getElementById('statusEncrypted');
const statusTracking = document.getElementById('statusTracking');

function setTracking(on) {
  if (on) {
    statusTracking.classList.remove('status-off');
    statusTracking.classList.add('status-on');
    statusTracking.textContent = 'LIVE TRACKING';
  } else {
    statusTracking.classList.add('status-off');
    statusTracking.classList.remove('status-on');
    statusTracking.textContent = 'IDLE';
  }
}

function initLeaflet() {
  state.map = L.map('map', { zoomControl: false, attributionControl: false }).setView(
    [12.9716, 77.5946],
    16
  );

  L.tileLayer(
    'https://clarity.maptiles.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
  ).addTo(state.map);

  const google = L.tileLayer(
    'https://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}',
    {
      subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
      opacity: 0.6
    }
  );
  google.addTo(state.map);
}

function updateBreadcrumb(lat, lng) {
  if (!state.map) return;

  const coord = [lat, lng];
  if (!state.layers.breadcrumbs) {
    state.layers.breadcrumbs = L.polyline([coord], {
      color: '#00ff41',
      weight: 4,
      opacity: 0.8
    }).addTo(state.map);
  } else {
    state.layers.breadcrumbs.addLatLng(coord);
  }

  state.map.panTo(coord);
}

function setIpMarker(lat, lng) {
  if (!state.map) return;
  if (state.layers.ipMarker) {
    state.map.removeLayer(state.layers.ipMarker);
  }
  state.layers.ipMarker = L.circleMarker([lat, lng], {
    radius: 6,
    color: '#f97316',
    fillColor: '#f97316',
    fillOpacity: 0.8
  })
    .bindTooltip('IP location', { permanent: false })
    .addTo(state.map);
}

identityForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  identityError.classList.add('hidden');
  identityError.textContent = '';

  if (!supabaseClient) {
    identityError.textContent = 'Supabase client not configured on frontend.';
    identityError.classList.remove('hidden');
    return;
  }

  const name = nameInput.value.trim();
  const phone = phoneInput.value.trim();

  if (!otpBlock.classList.contains('hidden')) {
    identityBtn.disabled = true;
    identityBtn.textContent = 'VERIFYING…';
    try {
      const { data, error } = await supabaseClient.auth.verifyOtp({
        phone,
        token: otpInput.value.trim(),
        type: 'sms'
      });
      if (error || !data?.session) {
        throw error || new Error('OTP verification failed');
      }

      const sessionToken = crypto.randomUUID();
      state.sessionToken = sessionToken;
      sessionTokenText.textContent = sessionToken;
      sessionInfo.classList.remove('hidden');

      const origin = window.location.origin;
      peerLink.textContent = `${origin}/peer.html?sessionToken=${encodeURIComponent(
        sessionToken
      )}`;

      setTracking(true);
      identityBtn.textContent = 'SESSION READY';
      identityBtn.disabled = true;
    } catch (err) {
      console.error(err);
      identityError.textContent = 'OTP verification failed. Please retry.';
      identityError.classList.remove('hidden');
      identityBtn.disabled = false;
      identityBtn.textContent = 'VERIFY OTP';
    }
    return;
  }

  identityBtn.disabled = true;
  identityBtn.textContent = 'SENDING OTP…';

  try {
    const { error } = await supabaseClient.auth.signInWithOtp({
      phone,
      options: { shouldCreateUser: true }
    });

    if (error) throw error;

    otpBlock.classList.remove('hidden');
    identityBtn.textContent = 'VERIFY OTP';
  } catch (err) {
    console.error(err);
    identityError.textContent = 'Unable to send OTP. Check phone format.';
    identityError.classList.remove('hidden');
    identityBtn.textContent = 'SEND OTP';
    identityBtn.disabled = false;
  }
});

useIpBtn.addEventListener('click', async () => {
  ipInfo.textContent = 'IP distance: resolving…';
  try {
    const res = await axios.get('http://ip-api.com/json');
    const { lat, lon } = res.data;
    latInput.value = lat.toFixed(4);
    lngInput.value = lon.toFixed(4);
    updateBreadcrumb(lat, lon);
    setIpMarker(lat, lon);
    ipInfo.textContent = 'IP distance: 0 km (using IP anchor)';
  } catch (err) {
    console.error(err);
    ipInfo.textContent = 'IP distance: unavailable';
  }
});

verifyBtn.addEventListener('click', async () => {
  if (!state.sessionToken) {
    alert('Complete Stage 1 (phone + OTP) first.');
    return;
  }

  const name = nameInput.value.trim();
  const phone = phoneInput.value.trim();
  const lat = parseFloat(latInput.value);
  const lng = parseFloat(lngInput.value);

  if (!name || !phone || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    alert('Please provide name, phone, and valid coordinates.');
    return;
  }

  verifyBtn.disabled = true;
  verifyBtn.textContent = 'RUNNING MODEL…';

  try {
    const res = await axios.post('/api/verify', {
      name,
      phone,
      lat,
      lng,
      sessionToken: state.sessionToken
    });

    const { sessionId, scores } = res.data;
    state.sessionId = sessionId;
    state.lastScores = scores;

    updateBreadcrumb(lat, lng);
    renderScores(scores);
    setupPeerPolling();
    downloadPdfBtn.disabled = false;
  } catch (err) {
    console.error(err);
    alert('Verification failed. Check server logs.');
  } finally {
    verifyBtn.disabled = false;
    verifyBtn.textContent = 'RUN RESIDENCY MODEL';
  }
});

function renderScores(scores) {
  scoreValue.textContent = `${scores.finalScore.toFixed(1)}%`;
  satelliteRow.textContent = `Satellite stability: ${scores.satelliteScore.toFixed(1)}% (mocked)`;
  densityRow.textContent = `OSM building density: ${scores.densityScore.toFixed(
    1
  )}% – ${scores.context.buildingCount} buildings, zone=${scores.context.zoneType}`;
  peersRow.textContent = `Peer consensus: ${scores.peerScore.toFixed(1)}%`;
  const dist = scores.context.distanceKm;
  ipRow.textContent = `IP match: ${scores.ipScore.toFixed(1)}%${
    dist != null ? ` (distance ${dist.toFixed(1)} km)` : ''
  }`;
}

function setupPeerPolling() {
  if (state.peerPollInterval) {
    clearInterval(state.peerPollInterval);
    state.peerPollInterval = null;
  }
  if (!state.sessionId || !state.sessionToken) return;

  state.peerPollInterval = setInterval(async () => {
    try {
      const res = await axios.get(
        `/api/peer/status/${encodeURIComponent(state.sessionId)}?sessionToken=${encodeURIComponent(
          state.sessionToken
        )}`
      );
      const { finalScore, yes, no } = res.data;
      peersRow.textContent = `Peer consensus: ${finalScore.toFixed(
        1
      )}% (${yes} yes / ${no} no)`;
      scoreValue.textContent = `${finalScore.toFixed(1)}%`;
    } catch (err) {
      console.error('Peer poll failed', err);
    }
  }, 3000);
}

downloadPdfBtn.addEventListener('click', async () => {
  if (!state.sessionId || !state.lastScores) {
    alert('Run the model first.');
    return;
  }

  const name = nameInput.value.trim() || 'Resident';
  const lat = parseFloat(latInput.value);
  const lng = parseFloat(lngInput.value);
  const score = state.lastScores.finalScore.toFixed(1);
  const timestamp = new Date().toISOString();

  try {
    const res = await axios.post('/api/certificate/anchor', {
      sessionId: state.sessionId,
      name,
      score,
      lat,
      lng,
      timestamp
    });

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    const txHash = res.data?.txHash || 'N/A';
    blockchainInfo.textContent = `Anchored on Polygon Mumbai – tx: ${txHash}`;

    doc.setFillColor(5, 5, 5);
    doc.rect(0, 0, 210, 297, 'F');
    doc.setTextColor(0, 255, 65);
    doc.setFont('courier', 'bold');
    doc.setFontSize(20);
    doc.text('SHADOW REGISTRY CERTIFICATE', 20, 28);
    doc.setDrawColor(0, 255, 65);
    doc.line(20, 32, 190, 32);

    doc.setFontSize(11);
    doc.setTextColor(180, 180, 180);
    doc.text(`NAME: ${name}`, 20, 48);
    doc.text(`COORDINATES: ${lat.toFixed(4)}, ${lng.toFixed(4)}`, 20, 56);
    doc.text(`TIMESTAMP: ${timestamp}`, 20, 64);

    doc.setFontSize(34);
    doc.setTextColor(0, 255, 65);
    doc.text(`${score}%`, 20, 90);
    doc.setFontSize(10);
    doc.text('RESIDENCY CONFIDENCE SCORE', 20, 98);

    doc.setFontSize(9);
    doc.setTextColor(150, 150, 150);
    doc.text(`Polygon Mumbai tx: ${txHash}`, 20, 120);
    doc.text(
      'Verify on polygonscan.com using the transaction hash above.',
      20,
      126
    );

    doc.text('This document is generated by Shadow Registry for demonstration purposes.', 20, 144);

    doc.save('ShadowRegistry_Certificate.pdf');
  } catch (err) {
    console.error(err);
    alert('Failed to anchor certificate. Check server logs and Polygon config.');
  }
});

window.addEventListener('load', () => {
  initLeaflet();
});

