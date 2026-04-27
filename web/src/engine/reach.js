import { MachineState, ReelOutcome } from './states.js';

export const ReachTier = Object.freeze({
  NONE:      'NONE',
  NORMAL:    'NORMAL',
  SUPER:     'SUPER',
  PREMIUM:   'PREMIUM',
  LEGENDARY: 'LEGENDARY',
});

const WIN_WEIGHTS = {
  [ReachTier.NORMAL]:    0.10,
  [ReachTier.SUPER]:     0.25,
  [ReachTier.PREMIUM]:   0.35,
  [ReachTier.LEGENDARY]: 0.30,
};
const MISS_WEIGHTS = {
  [ReachTier.NORMAL]:    0.70,
  [ReachTier.SUPER]:     0.20,
  [ReachTier.PREMIUM]:   0.08,
  [ReachTier.LEGENDARY]: 0.02,
};
const HOLD_MS = {
  [ReachTier.NORMAL]:    1500,
  [ReachTier.SUPER]:     4500,
  [ReachTier.PREMIUM]:   9000,
  [ReachTier.LEGENDARY]: 16000,
};
const JITAN_MULT = 0.4;

export class ReachDirector {
  constructor(rand = Math.random) { this._rand = rand; }

  decide(outcome, state) {
    if (outcome === ReelOutcome.MISS) {
      return { tier: ReachTier.NONE, holdMs: 0, predeterminedOutcome: outcome };
    }
    const isWin = outcome === ReelOutcome.JACKPOT
               || outcome === ReelOutcome.KAKUHEN_JACKPOT
               || outcome === ReelOutcome.KOATARI;
    const weights = isWin ? WIN_WEIGHTS : MISS_WEIGHTS;
    const tier = this._weightedPick(weights);
    let hold = HOLD_MS[tier];
    if (state === MachineState.JITAN) hold = Math.round(hold * JITAN_MULT);
    return { tier, holdMs: hold, predeterminedOutcome: outcome };
  }

  _weightedPick(weights) {
    const entries = Object.entries(weights);
    const total = entries.reduce((s, [, w]) => s + w, 0);
    let r = this._rand() * total;
    for (const [k, w] of entries) {
      r -= w;
      if (r <= 0) return k;
    }
    return entries[entries.length - 1][0];
  }
}
