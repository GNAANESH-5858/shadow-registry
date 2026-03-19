# Shadow Registry

Shadow Registry is a tech‑noir residency verification prototype that combines:

- **Supabase** (Postgres + Auth) for sessions, peer votes and certificate records  
- **Leaflet + OpenStreetMap + ArcGIS + Google tiles** for geospatial context  
- **Polygon (Mumbai)** via **ethers.js** for on‑chain certificate anchoring  
- **Vanilla JS + Tailwind + jsPDF** on the frontend

> **Security note**  
> This project is for demonstration and experimentation. It is **not** a production‑grade KYC or legal proof‑of‑address system.

---

## 1. Stack & Project Layout

```text
shadow-registry/
  backend/
    server.js
    supabaseClient.js
    routes/
      verify.js
      peer.js
      certificate.js
    utils/
      scoring.js
      geoValidate.js
  frontend/
    index.html
    style.css
    app.js
  contracts/
    ShadowRegistry.sol
  .env.example
  package.json
  README.md
```

---

## 2. Environment Variables

Copy `.env.example` to `.env` at the project root and fill in values:

```bash
cp .env.example .env
```

```env
SUPABASE_URL= # Project URL from Supabase dashboard
SUPABASE_ANON_KEY= # anon public key
SUPABASE_SERVICE_KEY= # service_role key

POLYGON_RPC_URL=https://rpc-mumbai.maticvigil.com
POLYGON_PRIVATE_KEY= # private key of the deployment/account wallet
CONTRACT_ADDRESS= # deployed ShadowRegistry contract on Mumbai

PORT=3000
```

---

## 3. Supabase Setup

1. **Create a project**
   - Go to [Supabase](https://supabase.com/) → New project.
   - Copy the **project URL**, **anon key**, and **service_role key** into `.env`.

2. **Enable Phone OTP Auth**
   - In **Authentication → Providers → Phone**, enable SMS.
   - Configure your SMS provider (Twilio, etc.) as required.

3. **Database schema**

   In the Supabase SQL editor, run a migration similar to:

   ```sql
   create table public.sessions (
     id uuid primary key default gen_random_uuid(),
     name text not null,
     phone text not null,
     lat double precision not null,
     lng double precision not null,
     base_score numeric,
     final_score numeric,
     session_token text not null,
     created_at timestamptz not null default now()
   );

   create table public.peer_votes (
     id uuid primary key default gen_random_uuid(),
     session_id uuid references public.sessions (id) on delete cascade,
     vote text check (vote in ('yes', 'no')) not null,
     voter_ip text,
     created_at timestamptz not null default now()
   );

   create table public.certificates (
     id uuid primary key default gen_random_uuid(),
     session_id uuid references public.sessions (id) on delete cascade,
     score numeric not null,
     tx_hash text not null,
     ipfs_hash text,
     created_at timestamptz not null default now()
   );
   ```

   - Make sure the service_role key is restricted and kept secret (server‑side only).

---

## 4. Polygon Mumbai Smart Contract

### Contract

`contracts/ShadowRegistry.sol`:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract ShadowRegistry {
    event CertificateAnchored(address indexed submitter, bytes32 hash, uint256 timestamp);

    function anchorCertificate(bytes32 hash) external {
        emit CertificateAnchored(msg.sender, hash, block.timestamp);
    }
}
```

### Deployment (example with Hardhat)

1. Install Hardhat locally (optional but recommended for real deployments):

   ```bash
   npm install --save-dev hardhat @nomicfoundation/hardhat-toolbox
   npx hardhat
   ```

2. Configure a Mumbai network in `hardhat.config.ts`/`js`:

   ```ts
   networks: {
     mumbai: {
       url: process.env.POLYGON_RPC_URL,
       accounts: [process.env.POLYGON_PRIVATE_KEY]
     }
   }
   ```

3. Create a deployment script that compiles and deploys `ShadowRegistry`.
4. After deployment, copy the **contract address** into `CONTRACT_ADDRESS` in `.env`.

### Test MATIC

- Go to a Mumbai faucet (search “Polygon Mumbai faucet”) and request a small amount of test MATIC for your deployment wallet.

---

## 5. Backend Behaviour

Backend entrypoint: `backend/server.js`

- Serves static files from `frontend/`.
- Exposes:
  - `POST /api/verify`
  - `POST /api/peer/submit`
  - `GET /api/peer/status/:sessionId`
  - `POST /api/certificate/anchor`

### Scoring Model (`backend/utils/scoring.js`)

`computeConfidenceScore({ sessionId, lat, lng, ipAddress })`:

- **Satellite land use stability** (30%)  
  - Currently a stubbed random value between 60–90.  
  - Replace `mockSatelliteStability()` with real satellite/imagery metrics when available.

- **OSM residential building density** (25%)  
  - Calls Overpass API via `queryResidentialContext(lat, lng)` in `geoValidate.js`.
  - Counts buildings within 200 m radius, infers `zoneType` and `isResidential`.

- **Peer consensus** (25%)  
  - Reads `peer_votes` from Supabase for the session.
  - Maps yes/no ratio → 0–100 peer subscore.

- **IP geolocation match** (20%)  
  - Uses `ip-api.com` to locate the client IP.
  - Computes distance to submitted coordinates.
  - Penalises scores > 100 km away and flags “suspicious”.

### Routes

- `POST /api/verify` (`backend/routes/verify.js`)
  - Body: `{ name, phone, lat, lng, sessionToken }`
  - Creates a row in `sessions`.
  - Calls `computeConfidenceScore`.
  - Writes `base_score` and `final_score`.
  - Returns `{ sessionId, scores }`.

- `POST /api/peer/submit` (`backend/routes/peer.js`)
  - Body: `{ sessionId, vote: 'yes' | 'no' }`
  - Stores peer vote with IP.

- `GET /api/peer/status/:sessionId`
  - Requires `sessionToken` query param for security.
  - Re-runs scoring and returns `{ sessionId, finalScore, yes, no }`.

- `POST /api/certificate/anchor` (`backend/routes/certificate.js`)
  - Body: `{ sessionId, name, score, lat, lng, timestamp }`
  - Hashes the data using `keccak256`.
  - Calls `anchorCertificate` on Polygon Mumbai.
  - Stores `tx_hash` and `score` in `certificates`.
  - Returns `{ txHash, hash }`.

---

## 6. Frontend Behaviour

All frontend logic is in `frontend/app.js` and `frontend/index.html`.

### Supabase Auth (Phone OTP)

- Uses the Supabase UMD bundle in the browser.
- `SEND OTP` → `signInWithOtp({ phone })`
- `VERIFY OTP` → `verifyOtp({ phone, token })`
- On success, a random `sessionToken` is generated (kept client‑side and in `sessions.session_token`).

### 3‑Stage Flow

1. **Identity**
   - Collects name + phone.
   - Performs Supabase phone OTP.
   - Displays a shareable **peer verification link** containing a session token.

2. **Location**
   - Inputs lat/lng, or uses `ip-api.com` to approximate user location.
   - Shows dual ArcGIS + Google satellite layers in Leaflet.
   - Breadcrumb trail is plotted in neon green.
   - `RUN RESIDENCY MODEL` calls `POST /api/verify`.

3. **Confidence**
   - Displays weighted score (0–100) and component breakdown:
     - Satellite stability
     - OSM building density
     - Peer consensus
     - IP match
   - Polls `GET /api/peer/status/:sessionId` every 3 seconds to re‑run the model as votes arrive.
   - Once enabled, `DOWNLOAD CERTIFICATE PDF`:
     - Calls `POST /api/certificate/anchor`.
     - Anchors a hash on Polygon Mumbai.
     - Embeds the resulting `txHash` in the PDF (and shows it in the UI).

### Map & Visuals

- Powered by **Leaflet** with:
  - **ArcGIS World Imagery (2016)** tiles.
  - **Google satellite (2026)** overlay.
- Breadcrumb path (`neon green`) follows the latest coordinates.
- IP‑location marker shown if IP & coordinates diverge.
- Tech‑noir UI theme (`#050505` background, `#00ff41` neon, Syne + Space Mono fonts).

---

## 7. Running the App

1. **Install dependencies**

   ```bash
   cd shadow-registry
   npm install
   ```

2. **Start the dev server**

   ```bash
   npm run dev
   # or
   npm start
   ```

3. **Open the app**

   Visit `http://localhost:3000` in your browser.

   - Complete the identity step with a phone number supported by your Supabase SMS config.
   - Lock coordinates using GPS/IP.
   - Run the residency model.
   - Share the peer link and observe real‑time updates.
   - Download a PDF and inspect the Polygon transaction hash.

---

## 8. Production Considerations

- Enforce HTTPS and secure cookies when deploying.
- Lock `SUPABASE_SERVICE_KEY` to server environments only; never expose it to the browser.
- Rate‑limit `/api/peer/submit` and `/api/verify` to mitigate abuse.
- Add error observability (e.g., Sentry) around Overpass/IP API calls.
- Replace the mocked satellite component with a real source (e.g., dedicated change‑detection raster service or vendor API).

