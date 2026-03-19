import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

import verifyRouter from './routes/verify.js';
import peerRouter from './routes/peer.js';
import certificateRouter from './routes/certificate.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.use(
  cors({
    origin: true,
    credentials: true
  })
);
app.use(express.json());

const frontendDir = path.join(__dirname, '..', 'frontend');
app.use(express.static(frontendDir));

app.use('/api', verifyRouter);
app.use('/api', peerRouter);
app.use('/api', certificateRouter);

app.get('*', (_req, res) => {
  res.sendFile(path.join(frontendDir, 'index.html'));
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Shadow Registry server running on http://localhost:${port}`);
});

