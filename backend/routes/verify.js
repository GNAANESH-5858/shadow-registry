import express from 'express';
import { supabaseAdmin } from '../supabaseClient.js';
import { computeConfidenceScore } from '../utils/scoring.js';

const router = express.Router();

router.post('/verify', async (req, res) => {
  try {
    const { name, phone, lat, lng, sessionToken } = req.body || {};

    if (!lat || !lng || !name || !phone || !sessionToken) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const ipAddress =
      req.headers['x-forwarded-for']?.toString().split(',')[0] ||
      req.socket.remoteAddress ||
      null;

    const { data: session, error: insertError } = await supabaseAdmin
      .from('sessions')
      .insert([
        {
          name,
          phone,
          lat,
          lng,
          session_token: sessionToken
        }
      ])
      .select()
      .single();

    if (insertError) {
      throw insertError;
    }

    const scores = await computeConfidenceScore({
      sessionId: session.id,
      lat,
      lng,
      ipAddress
    });

    const { error: updateError } = await supabaseAdmin
      .from('sessions')
      .update({
        base_score: scores.finalScore,
        final_score: scores.finalScore
      })
      .eq('id', session.id);

    if (updateError) {
      throw updateError;
    }

    return res.json({
      sessionId: session.id,
      scores
    });
  } catch (err) {
    console.error('POST /api/verify failed', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;

