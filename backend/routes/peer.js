import express from 'express';
import { supabaseAdmin } from '../supabaseClient.js';
import { computeConfidenceScore } from '../utils/scoring.js';

const router = express.Router();

router.post('/peer/submit', async (req, res) => {
  try {
    const { sessionId, vote } = req.body || {};
    if (!sessionId || !['yes', 'no'].includes(vote)) {
      return res.status(400).json({ error: 'Invalid payload' });
    }

    const voter_ip =
      req.headers['x-forwarded-for']?.toString().split(',')[0] ||
      req.socket.remoteAddress ||
      null;

    const { error: insertError } = await supabaseAdmin
      .from('peer_votes')
      .insert([{ session_id: sessionId, vote, voter_ip }]);

    if (insertError) {
      throw insertError;
    }

    return res.json({ ok: true });
  } catch (err) {
    console.error('POST /api/peer/submit failed', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/peer/status/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { sessionToken } = req.query;

    if (!sessionId || !sessionToken) {
      return res.status(400).json({ error: 'Missing identifiers' });
    }

    const { data: session, error: sessionError } = await supabaseAdmin
      .from('sessions')
      .select('*')
      .eq('id', sessionId)
      .single();

    if (sessionError || !session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    if (session.session_token !== sessionToken) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const scores = await computeConfidenceScore({
      sessionId,
      lat: session.lat,
      lng: session.lng,
      ipAddress: null
    });

    const { error: updateError } = await supabaseAdmin
      .from('sessions')
      .update({ final_score: scores.finalScore })
      .eq('id', sessionId);

    if (updateError) {
      throw updateError;
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

    return res.json({
      sessionId,
      finalScore: scores.finalScore,
      yes,
      no
    });
  } catch (err) {
    console.error('GET /api/peer/status failed', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;

