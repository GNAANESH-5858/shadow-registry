import express from 'express';
import { ethers } from 'ethers';
import { supabaseAdmin } from '../supabaseClient.js';

const router = express.Router();

const rpcUrl = process.env.POLYGON_RPC_URL;
const privateKey = process.env.POLYGON_PRIVATE_KEY;
const contractAddress = process.env.CONTRACT_ADDRESS;

let contractInstance = null;

function getContract() {
  if (contractInstance) return contractInstance;
  if (!rpcUrl || !privateKey || !contractAddress) {
    throw new Error('Polygon RPC, private key or contract address not configured');
  }
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const wallet = new ethers.Wallet(privateKey, provider);
  const abi = [
    'event CertificateAnchored(address indexed submitter, bytes32 hash, uint256 timestamp)',
    'function anchorCertificate(bytes32 hash) external'
  ];
  contractInstance = new ethers.Contract(contractAddress, abi, wallet);
  return contractInstance;
}

router.post('/certificate/anchor', async (req, res) => {
  try {
    const { sessionId, name, score, lat, lng, timestamp } = req.body || {};
    if (!sessionId || !name || !score || !lat || !lng || !timestamp) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const message = `${name}|${score}|${lat}|${lng}|${timestamp}`;
    const hash = ethers.keccak256(ethers.toUtf8Bytes(message));

    const contract = getContract();
    const tx = await contract.anchorCertificate(hash);
    const receipt = await tx.wait();

    const txHash = receipt.transactionHash;

    const { error: insertError } = await supabaseAdmin.from('certificates').insert([
      {
        session_id: sessionId,
        score,
        tx_hash: txHash,
        ipfs_hash: null
      }
    ]);

    if (insertError) {
      throw insertError;
    }

    return res.json({ txHash, hash });
  } catch (err) {
    console.error('POST /api/certificate/anchor failed', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;

