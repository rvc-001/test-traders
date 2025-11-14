require('dotenv').config();
/**
 * race-engine-starter.js
 *
 * Simple automated race engine for the TurboRacers starter.
 *
 * Usage:
 * 1) Ensure server.js is running (API on PORT in .env).
 * 2) Export ADMIN_SECRET (or set in .env). Example:
 * export ADMIN_SECRET=some-secret
 * 3) Run:
 * node race-engine-starter.js
 *
 * This script will:
 * - fetch racers from /racers
 * - run a short simulated race
 * - call POST /update-price when overtakes/crashes/finish happen
 *
 * Notes:
 * - Keeps on-chain writes minimal: only on meaningful events.
 * - Price changes: +10% on overtake, -20% on crash, +5% for winner at finish (example).
 */

const API_BASE = process.env.API_BASE || 'http://127.0.0.1:3001';
const ADMIN_TOKEN = process.env.ADMIN_SECRET || 'some-secret';

// Race parameters (tweak for demo)
const TICK_MS = 200;            // update frequency
const RACE_DISTANCE = 5000;     // distance to finish (units arbitrary)
const BASE_DRIFT = 5;           // random speed noise magnitude

// Event price rules (percent integers)
const OVERTAKE_BONUS_PCT = 10;  // +10%
const CRASH_PENALTY_PCT = 20;   // -20%
const WINNER_BONUS_PCT = 5;     // +5% at finish

// small helper: sleep
function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }

// BigInt percentage helpers using wei strings
function applyPercentBigInt(weiStr, pct, increase = true) {
  // weiStr is decimal string representing integer wei
  const val = BigInt(weiStr);
  const change = (val * BigInt(pct)) / 100n;
  return (increase ? (val + change) : (val - change)).toString();
}

// Fetch JSON wrapper
async function apiFetch(path, opts = {}) {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, opts);
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} ${res.statusText} -> ${t}`);
  }
  return res.json();
}

// POST update-price (protected)
async function postUpdatePrice(id, priceWeiStr) {
  const url = `${API_BASE}/update-price`;
  const body = JSON.stringify({ id, price: priceWeiStr });
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-admin-token': ADMIN_TOKEN
    },
    body
  });
  if (!res.ok) {
    const text = await res.text().catch(()=>'<no body>');
    throw new Error(`update-price failed ${res.status}: ${text}`);
  }
  return res.json();
}

function racerSpeedTick(racer) {
  // Base speed derived from stat; add some randomness based on consistency
  // speed stat might be in [0..255]. We'll use it directly as a base (higher = faster).
  const consistencyFactor = (racer.consistency || 100) / 200; // 0..~1
  const noise = (Math.random() * BASE_DRIFT * (1 - consistencyFactor)) - (BASE_DRIFT/2) * (1 - consistencyFactor);
  // aggression can push for short bursts
  const aggressionBurst = (Math.random() < (racer.aggression / 500)) ? (racer.aggression / 20) : 0;
  return Math.max(0, racer.speed + aggressionBurst + noise);
}

async function runRace() {
  console.log('Fetching racers from API...');
  const racers = await apiFetch('/racers');
  if (!racers || racers.length === 0) {
    console.error('No racers found. Mint racers first or check API.');
    return;
  }

  // initialize dynamic state
  const state = racers.map(r => ({
    id: r.id,
    name: r.name,
    speedStat: r.speed,
    aggression: r.aggression,
    consistency: r.consistency,
    distance: 0,
    finished: false,
    currentPriceWei: r.currentPrice // string
  }));

  console.log('Racers:', state.map(s => `${s.id}:${s.name}`).join(', '));
  console.log('Starting race — first to reach', RACE_DISTANCE, 'wins');

  let tick = 0;
  let raceFinished = false;

  while (!raceFinished) {
    tick++;
    // each tick update distances
    for (const r of state) {
      if (r.finished) continue;
      const speed = racerSpeedTick({
        speed: r.speedStat,
        aggression: r.aggression,
        consistency: r.consistency
      });
      r.distance += speed; // simple integration
    }

    // sort by distance desc to compute ranks
    state.sort((a,b) => Number(b.distance - a.distance));
    // detect overtakes (compare previous tick order): we can track last ranks
    if (!state._lastOrder) {
      state._lastOrder = state.map(s => s.id);
    } else {
      const prevOrder = state._lastOrder;
      const curOrder = state.map(s => s.id);
      // check pairwise: if someone's rank improved vs previous, it's an overtake event
      for (let i = 0; i < curOrder.length; i++) {
        const id = curOrder[i];
        const prevIndex = prevOrder.indexOf(id);
        if (prevIndex > i) {
          // id moved up (smaller index = better rank) -> overtake
          const racer = state.find(x => x.id === id);
          console.log(`tick ${tick}: OVERTAKE — ${racer.name} moved from #${prevIndex+1} to #${i+1}`);
          // update price: +OVERTAKE_BONUS_PCT
          const old = racer.currentPriceWei;
          const nw = applyPercentBigInt(old, OVERTAKE_BONUS_PCT, true);
          racer.currentPriceWei = nw;
          try {
            const res = await postUpdatePrice(racer.id, nw);
            console.log('  -> update-price tx:', res.txHash || res);
          } catch (e) {
            console.error('  -> failed to update price on-chain:', e.message);
          }
        }
      }
      state._lastOrder = curOrder;
    }

    // random crash chance per racer influenced by aggression and consistency
    for (const r of state) {
      if (r.finished) continue;
      // crash base 0.002 per tick; scale by aggression and inverse consistency
      const baseCrash = 0.002;
      const aggFactor = r.aggression / 255;
      const consFactor = 1 - (r.consistency / 255);
      const crashProb = baseCrash + (0.01 * aggFactor) + (0.01 * consFactor * aggFactor);
      if (Math.random() < crashProb) {
        // crash event
        console.log(`tick ${tick}: CRASH — ${r.name} crashed!`);
        // reduce distance slightly and penalize speed next ticks
        r.distance = Math.max(0, r.distance - (r.speedStat * 2));
        // price penalty
        const old = r.currentPriceWei;
        const nw = applyPercentBigInt(old, CRASH_PENALTY_PCT, false);
        r.currentPriceWei = nw;
        try {
          const res = await postUpdatePrice(r.id, nw);
          console.log('  -> update-price tx (crash):', res.txHash || res);
        } catch (e) {
          console.error('  -> failed to update price on-chain (crash):', e.message);
        }
      }
    }

    // check finishers
    for (const r of state) {
      if (!r.finished && r.distance >= RACE_DISTANCE) {
        r.finished = true;
        console.log(`tick ${tick}: FINISH — ${r.name} finished!`);
        // small winner bonus to price
        const old = r.currentPriceWei;
        const nw = applyPercentBigInt(old, WINNER_BONUS_PCT, true);
        r.currentPriceWei = nw; // <-- THIS IS THE FIX (was 'racer.')
        try {
          const res = await postUpdatePrice(r.id, nw);
          console.log('  -> update-price tx (finish):', res.txHash || res);
        } catch (e) {
          console.error('  -> failed to update price on-chain (finish):', e.message);
        }
      }
    }

    // if all finished or at least one finished and others finished within few secs, end race
    if (state.every(s => s.finished)) {
      raceFinished = true;
      console.log('Race complete. Final ranking:');
      state.sort((a,b) => Number(b.distance - a.distance));
      state.forEach((s,i) => {
        console.log(`#${i+1} ${s.name} — distance=${Math.round(s.distance)} price(wei)=${s.currentPriceWei}`);
      });
      break;
    }

    await sleep(TICK_MS);
  } // end while
}

// run script
runRace().catch(err => {
  console.error('Race engine error:', err);
  process.exit(1);
});