import { MachineState, ReelOutcome } from './states.js';

export const SYMBOLS = [0,1,2,3,4,5,6,7,8,9];
export const JACKPOT_SYMBOL = 7;

const STATE_JACKPOT_MULTIPLIER = {
  [MachineState.NORMAL]:  1.0,
  [MachineState.KAKUHEN]: 10.5,
  [MachineState.JITAN]:   1.0,
  [MachineState.KOATARI]: 1.0,
  [MachineState.PAYOUT]:  0.0,
};

// Mulberry32 — small, good-enough deterministic PRNG.
function mulberry32(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class ProbabilityEngine {
  constructor(odds = {}, seed = (Math.random() * 1e9) | 0) {
    this.odds = {
      jackpot: 319,
      kakuhenShare: 0.65,
      koatariShare: 0.05,
      reachMiss: 12,
      ...odds,
    };
    this._rand = mulberry32(seed);
  }

  jackpotProbability(state) {
    const m = STATE_JACKPOT_MULTIPLIER[state];
    return m === 0 ? 0 : m / this.odds.jackpot;
  }

  spin(state) {
    const p = this.jackpotProbability(state);
    if (this._rand() < p) {
      const flavor = this._rand();
      let outcome;
      if (flavor < this.odds.koatariShare) {
        outcome = ReelOutcome.KOATARI;
      } else if (flavor < this.odds.koatariShare + this.odds.kakuhenShare) {
        outcome = ReelOutcome.KAKUHEN_JACKPOT;
      } else {
        outcome = ReelOutcome.JACKPOT;
      }
      return { outcome, reels: [JACKPOT_SYMBOL, JACKPOT_SYMBOL, JACKPOT_SYMBOL] };
    }

    if (this._rand() < 1 / this.odds.reachMiss) {
      const teaser = this._pick(SYMBOLS);
      const third  = this._pickExcept(SYMBOLS, teaser);
      return { outcome: ReelOutcome.REACH_MISS, reels: [teaser, teaser, third] };
    }

    const a = this._pick(SYMBOLS);
    const b = this._pickExcept(SYMBOLS, a);
    const c = this._pick(SYMBOLS);
    return { outcome: ReelOutcome.MISS, reels: [a, b, c] };
  }

  _pick(arr)            { return arr[(this._rand() * arr.length) | 0]; }
  _pickExcept(arr, x)   {
    const f = arr.filter(v => v !== x);
    return f[(this._rand() * f.length) | 0];
  }
}
