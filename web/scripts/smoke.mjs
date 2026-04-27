// Headless smoke test for the JS engine port. Forces a deterministic seed,
// runs ~5000 spins, and asserts the same kinds of state transitions we see
// in the Python tests fire here too.

import { ProbabilityEngine } from '../src/engine/rng.js';
import { ReachDirector, ReachTier } from '../src/engine/reach.js';
import { MachineState, ReelOutcome } from '../src/engine/states.js';

let fails = 0;
function assert(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); fails++; }
  else        console.log('ok  ', msg);
}

// 1. Kakuhen multiplies jackpot odds.
const rng = new ProbabilityEngine({}, 1);
assert(
  rng.jackpotProbability(MachineState.KAKUHEN)
    > rng.jackpotProbability(MachineState.NORMAL) * 5,
  'KAKUHEN dramatically increases jackpot probability',
);

// 2. PAYOUT blocks nested jackpots.
assert(
  rng.jackpotProbability(MachineState.PAYOUT) === 0,
  'PAYOUT state cannot produce a jackpot',
);

// 3. Empirical jackpot rate ~ 1/319 in NORMAL.
const winSet = new Set([
  ReelOutcome.JACKPOT, ReelOutcome.KAKUHEN_JACKPOT, ReelOutcome.KOATARI,
]);
const N = 200_000;
const rng2 = new ProbabilityEngine({}, 7);
let hits = 0;
for (let i = 0; i < N; i++) {
  if (winSet.has(rng2.spin(MachineState.NORMAL).outcome)) hits++;
}
const expected = N / 319;
assert(
  hits > expected * 0.55 && hits < expected * 1.55,
  `NORMAL hit rate ~1/319 (got ${hits}/${N}, expected ~${expected.toFixed(0)})`,
);

// 4. Reach director skips tier for plain MISS.
const director = new ReachDirector(() => 0.5);
assert(
  director.decide(ReelOutcome.MISS, MachineState.NORMAL).tier === ReachTier.NONE,
  'plain MISS produces no Reach tier',
);

// 5. JITAN compresses the reach hold.
const detN = director.decide(ReelOutcome.JACKPOT, MachineState.NORMAL);
const detJ = director.decide(ReelOutcome.JACKPOT, MachineState.JITAN);
assert(detJ.holdMs < detN.holdMs, 'JITAN compresses Reach hold time');

console.log(fails === 0 ? '\nALL OK' : `\n${fails} FAILED`);
process.exit(fails === 0 ? 0 : 1);
