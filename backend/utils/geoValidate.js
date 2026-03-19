import axios from 'axios';

const OVERPASS_ENDPOINT = 'https://overpass-api.de/api/interpreter';
const IP_API_ENDPOINT = 'http://ip-api.com/json';

export async function queryResidentialContext(lat, lng) {
  const radiusMeters = 200;

  const query = `
    [out:json][timeout:25];
    (
      way["building"](around:${radiusMeters},${lat},${lng});
      relation["building"](around:${radiusMeters},${lat},${lng});
      way["landuse"](around:${radiusMeters},${lat},${lng});
      relation["landuse"](around:${radiusMeters},${lat},${lng});
    );
    out tags center;
  `;

  const res = await axios.post(
    OVERPASS_ENDPOINT,
    new URLSearchParams({ data: query }).toString(),
    {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    }
  );

  const elements = res.data?.elements || [];

  let buildingCount = 0;
  let zoneType = 'unknown';
  let isResidential = false;

  for (const el of elements) {
    const tags = el.tags || {};
    if (tags.building) {
      buildingCount += 1;
    }
    if (tags.landuse) {
      const landuse = tags.landuse;
      if (['residential', 'apartments'].includes(landuse)) {
        zoneType = 'residential';
        isResidential = true;
      } else if (['commercial', 'industrial', 'retail'].includes(landuse)) {
        zoneType = 'non-residential';
      } else if (['reservoir', 'basin', 'water'].includes(landuse)) {
        zoneType = 'water';
      }
    }
  }

  if (zoneType === 'unknown' && buildingCount > 0) {
    zoneType = 'mixed';
  }

  return { buildingCount, zoneType, isResidential };
}

export async function ipGeoDistanceCheck(lat, lng, ipAddress) {
  const url = ipAddress ? `${IP_API_ENDPOINT}/${ipAddress}` : IP_API_ENDPOINT;
  const res = await axios.get(url, { timeout: 5000 });

  if (res.data?.status !== 'success') {
    return { distanceKm: null, suspicious: false };
  }

  const ipLat = res.data.lat;
  const ipLon = res.data.lon;
  const distanceKm = haversineKm({ lat, lng }, { lat: ipLat, lng: ipLon });

  const suspicious = distanceKm != null && distanceKm > 100;
  return { distanceKm, suspicious };
}

function haversineKm(a, b) {
  const R = 6371;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const sinDLat = Math.sin(dLat / 2);
  const sinDLon = Math.sin(dLon / 2);

  const h =
    sinDLat * sinDLat +
    Math.cos(lat1) * Math.cos(lat2) * sinDLon * sinDLon;

  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  return R * c;
}

