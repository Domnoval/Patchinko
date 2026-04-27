import { EventType, MachineState, ReelOutcome } from './states.js';
import { ProbabilityEngine } from './rng.js';
import { ReachDirector, ReachTier } from './reach.js';

const DEFAULT_CONFIG = {
  baseJackpotBalls: 1500,
  kakuhenSpins: 80,
  jitanSpinsAfterKakuhen: 100,
  koatariBalls: 5,
  spinIntervalMs: 650,         // base spin cadence
  jitanSpinIntervalMs: 240,    // JITAN compresses spin cadence too
  payoutBatchMs: 90,           // ms between 50-ball drops in PAYOUT
  payoutBatchSize: 50,
};

export class DejipachiMachine extends EventTarget {
  constructor(config = {}, seed) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this._rng = new ProbabilityEngine({}, seed);
    this._reach = new ReachDirector(() => Math.random());

    this._state = MachineState.NORMAL;
    this._spinsRemainingInState = 0;
    this._spinQueue = 0;
    this._tick = 0;

    this._spinTimer = null;
    this._payoutTimer = null;
    this._reachTimer = null;

    this._payoutBallsRemaining = 0;
    this._postPayoutState = MachineState.NORMAL;
    this._postPayoutSilent = false;
  }

  get state() { return this._state; }
  get queuedSpins() { return this._spinQueue; }

  startChucker(balls = 1) {
    this._spinQueue += balls;
    this._emit(EventType.START_CHUCKER, { spinsQueued: this._spinQueue });
    this._scheduleSpin();
  }

  destroy() {
    clearTimeout(this._spinTimer);
    clearTimeout(this._payoutTimer);
    clearTimeout(this._reachTimer);
  }

  // ---- internal -----------------------------------------------------------

  _scheduleSpin() {
    if (this._spinTimer || this._reachTimer) return;
    if (this._state === MachineState.PAYOUT) return;
    if (this._spinQueue <= 0) return;
    const interval = this._state === MachineState.JITAN
      ? this.config.jitanSpinIntervalMs
      : this.config.spinIntervalMs;
    this._spinTimer = setTimeout(() => {
      this._spinTimer = null;
      this._runSpin();
    }, interval);
  }

  _runSpin() {
    if (this._state === MachineState.PAYOUT || this._spinQueue <= 0) return;
    this._spinQueue -= 1;
    this._tick += 1;

    const result = this._rng.spin(this._state);
    const decision = this._reach.decide(result.outcome, this._state);

    if (decision.tier !== ReachTier.NONE) {
      this._emit(EventType.REACH, {
        tier: decision.tier,
        holdMs: decision.holdMs,
        predeterminedOutcome: result.outcome,
        reels: result.reels,
      });
      // Hold reel 3 for the manufactured-tension duration.
      this._reachTimer = setTimeout(() => {
        this._reachTimer = null;
        this._resolveSpin(result);
        this._scheduleSpin();
      }, decision.holdMs);
    } else {
      this._resolveSpin(result);
      this._scheduleSpin();
    }
  }

  _resolveSpin(result) {
    this._emit(EventType.SPIN_RESOLVED, {
      outcome: result.outcome,
      reels: result.reels,
    });

    if (result.outcome === ReelOutcome.JACKPOT) {
      this._openPayout(this.config.baseJackpotBalls, MachineState.NORMAL, false);
    } else if (result.outcome === ReelOutcome.KAKUHEN_JACKPOT) {
      this._openPayout(this.config.baseJackpotBalls, MachineState.KAKUHEN, false);
    } else if (result.outcome === ReelOutcome.KOATARI) {
      this._openPayout(this.config.koatariBalls, MachineState.KAKUHEN, true);
    } else {
      this._maybeDecayState();
    }
  }

  _maybeDecayState() {
    if (this._state === MachineState.KAKUHEN || this._state === MachineState.JITAN) {
      this._spinsRemainingInState -= 1;
      if (this._spinsRemainingInState <= 0) {
        if (this._state === MachineState.KAKUHEN) {
          this._transition(MachineState.JITAN, false);
          this._spinsRemainingInState = this.config.jitanSpinsAfterKakuhen;
        } else {
          this._transition(MachineState.NORMAL, false);
        }
      }
    }
  }

  _openPayout(balls, postState, silent) {
    this._payoutBallsRemaining = balls;
    this._postPayoutState = postState;
    this._postPayoutSilent = silent;
    this._transition(MachineState.PAYOUT, false);
    this._emit(EventType.PAYOUT_OPEN, { balls: 0, roundsRemaining: balls });
    this._schedulePayoutBatch();
  }

  _schedulePayoutBatch() {
    this._payoutTimer = setTimeout(() => {
      this._payoutTimer = null;
      this._advancePayout();
    }, this.config.payoutBatchMs);
  }

  _advancePayout() {
    const batch = Math.min(this.config.payoutBatchSize, this._payoutBallsRemaining);
    this._payoutBallsRemaining -= batch;
    this._emit(EventType.PAYOUT_OPEN, {
      balls: batch,
      roundsRemaining: this._payoutBallsRemaining,
    });
    if (this._payoutBallsRemaining > 0) {
      this._schedulePayoutBatch();
    } else {
      this._emit(EventType.PAYOUT_CLOSE, { balls: 0, roundsRemaining: 0 });
      this._state = MachineState.NORMAL;        // clear PAYOUT before transitioning
      this._transition(this._postPayoutState, this._postPayoutSilent);
      if (this._postPayoutState === MachineState.KAKUHEN) {
        this._spinsRemainingInState = this.config.kakuhenSpins;
      } else if (this._postPayoutState === MachineState.JITAN) {
        this._spinsRemainingInState = this.config.jitanSpinsAfterKakuhen;
      }
      this._scheduleSpin();
    }
  }

  _transition(newState, silent) {
    if (newState === this._state) return;
    const prev = this._state;
    this._state = newState;
    this._emit(EventType.STATE_TRANSITION, {
      fromState: prev,
      toState: newState,
      silent,
    });
  }

  _emit(type, detail) {
    this.dispatchEvent(new CustomEvent(type, {
      detail: { type, tick: this._tick, ...detail },
    }));
  }
}
