import { supabaseAdmin } from '../supabaseClient.js';
import { queryResidentialContext, ipGeoDistanceCheck } from './geoValidate.js';

// Satellite land use stability is currently mocked; replace with real change
// detection feed when available.
function mockSatelliteStability() {
  return 60 + Math.random() * 30; // 60–90
}

export async function computeConfidenceScore({ sessionId, lat, lng, ipAddress }) {
  const satelliteScore = mockSatelliteStability();

  const { buildingCount, zoneType, isResidential } = await queryResidentialContext(lat, lng);
  let densityScore = 0;
  if (buildingCount === 0) {
    densityScore = 10;
  } else if (buildingCount < 5) {
    densityScore = 50;
  } else if (buildingCount < 15) {
    densityScore = 70;
  } else {
    densityScore = 90;
  }
  if (!isResidential) {
    densityScore *= 0.7;
  }

  const { data: votes, error: votesError } = await supabaseAdmin
    .from('peer_votes')
    .select('vote')
    .eq('session_id', sessionId);

  if (votesError) {
    throw votesError;
  }

  let yes = 0;
  let no = 0;
  for (const v of votes || []) {
    if (v.vote === 'yes') yes += 1;
    if (v.vote === 'no') no += 1;
  }

  let peerScore = 0;
  const total = yes + no;
  if (total > 0) {
    const ratio = yes / total;
    peerScore = ratio * 100;
  }

  const { distanceKm, suspicious } = await ipGeoDistanceCheck(lat, lng, ipAddress);
  let ipScore = 80;
  if (distanceKm == null) {
    ipScore = 60;
  } else if (distanceKm < 10) {
    ipScore = 95;
  } else if (distanceKm < 50) {
    ipScore = 80;
  } else if (distanceKm < 100) {
    ipScore = 65;
  } else {
    ipScore = 30;
  }
  if (suspicious) {
    ipScore *= 0.6;
  }

  const finalScore =
    satelliteScore * 0.3 +
    densityScore * 0.25 +
    peerScore * 0.25 +
    ipScore * 0.2;

  return {
    satelliteScore,
    densityScore,
    peerScore,
    ipScore,
    finalScore: Math.round(finalScore * 10) / 10,
    context: {
      buildingCount,
      zoneType,
      isResidential,
      distanceKm,
      suspicious
    }
  };
}

