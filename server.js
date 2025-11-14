// server.js (ethers v5 compatible)
require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const { ethers } = require('ethers'); // ethers v5

const RPC_URL = process.env.RPC_URL || 'http://localhost:8545';
const PRIVATE_KEY = process.env.PRIVATE_KEY || '';
const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS || '';
const ADMIN_SECRET = process.env.ADMIN_SECRET || 'changeme';
const PORT = process.env.PORT || 3001;

const ABI_PATH = './artifacts/contracts/TurboRacers.sol/TurboRacers.json';
let ABI;
try {
  ABI = JSON.parse(fs.readFileSync(ABI_PATH)).abi;
} catch (e) {
  console.error('ABI not found at', ABI_PATH, ' — ensure you compiled the contract.');
  process.exit(1);
}

const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
const wallet = PRIVATE_KEY ? new ethers.Wallet(PRIVATE_KEY, provider) : null;
const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, provider);
const contractWithSigner = wallet ? contract.connect(wallet) : null;

const app = express();
app.use(bodyParser.json());

app.get('/racers', async (req, res) => {
  try {
    const ids = await contract.getAllRacerIds();
    const out = [];
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i].toString();
      const r = await contract.getRacer(id);
      out.push({
        id: Number(r[0].toString()),
        name: r[1],
        speed: Number(r[2]),
        aggression: Number(r[3]),
        consistency: Number(r[4]),
        currentPrice: r[5].toString()
      });
    }
    res.json(out);
  } catch (e) {
    console.error(e);
    res.status(500).send({ error: 'failed' });
  }
});

app.post('/update-price', async (req, res) => {
  try {
    const token = req.header('x-admin-token');
    if (!token || token !== ADMIN_SECRET) return res.status(403).send({ error: 'forbidden' });
    if (!contractWithSigner) return res.status(500).send({ error: 'no signer configured' });

    const { id, price } = req.body;
    if (!id || !price) return res.status(400).send({ error: 'bad request' });

    const tx = await contractWithSigner.updatePrice(id, price);
    const receipt = await tx.wait();
    res.json({ txHash: receipt.transactionHash });
  } catch (e) {
    console.error(e);
    res.status(500).send({ error: 'failed' });
  }
});

app.listen(PORT, () => console.log('API running on', PORT));
