import { EventType, MachineState, ReelOutcome } from './engine/states.js';
import { paintReels } from './scene/playfield.js';

// Translates the engine's information stream into visual presentation.
// The engine has already decided everything — the director's job is purely
// to choreograph the wait.
export class Director {
  constructor(machine, scene, hud) {
    this.machine = machine;
    this.scene = scene;       // { centerpiece, attacker, lamp, ... }
    this.hud = hud;
    this.tray = scene.tray;

    this._currentReels = [0, 0, 0];
    this._spinPhase = 0;
    this._holdReel3 = false;
    this._lampLevel = 0;          // 0..1, smoothed
    this._lampTarget = 0;
    this._reachShown = false;
    this._lastFrame = performance.now();

    this._wire();
  }

  _wire() {
    const m = this.machine;
    m.addEventListener(EventType.START_CHUCKER, e => {
      this.hud.setQueue(e.detail.spinsQueued);
    });
    m.addEventListener(EventType.REACH, e => {
      this._beginReach(e.detail);
    });
    m.addEventListener(EventType.SPIN_RESOLVED, e => {
      this._endSpin(e.detail);
    });
    m.addEventListener(EventType.STATE_TRANSITION, e => {
      this._onTransition(e.detail);
    });
    m.addEventListener(EventType.PAYOUT_OPEN, e => {
      if (e.detail.balls > 0) this.tray.add(e.detail.balls);
      this.hud.setTray(this.tray.balls.length);
      this.scene.attacker.userData.openMesh.visible = true;
      this.scene.attacker.userData.closedMesh.visible = false;
    });
    m.addEventListener(EventType.PAYOUT_CLOSE, () => {
      this.scene.attacker.userData.openMesh.visible = false;
      this.scene.attacker.userData.closedMesh.visible = true;
    });
  }

  _beginReach({ tier, holdMs, predeterminedOutcome, reels }) {
    this._currentReels = reels.slice();
    this._holdReel3 = true;
    this._spinPhase = 1;
    this._lampTarget = tier === 'LEGENDARY' ? 1.0
                     : tier === 'PREMIUM'   ? 0.7
                     : tier === 'SUPER'     ? 0.45
                                            : 0.2;
    if (tier !== 'NORMAL') {
      this.hud.showReach(tier);
      this._reachShown = true;
    }
  }

  _endSpin({ outcome, reels }) {
    this._currentReels = reels;
    this._holdReel3 = false;
    this._spinPhase = 0;
    if (this._reachShown) { this.hud.hideReach(); this._reachShown = false; }
    if (outcome === ReelOutcome.JACKPOT
     || outcome === ReelOutcome.KAKUHEN_JACKPOT
     || outcome === ReelOutcome.KOATARI) {
      this._lampTarget = 1.0;
    } else {
      this._lampTarget = 0.0;
    }
    this._repaintReels();
  }

  _onTransition({ fromState, toState, silent }) {
    this.hud.setState(toState);
    if (toState === MachineState.KAKUHEN && !silent) {
      this._lampTarget = 0.85;
    } else if (toState === MachineState.NORMAL) {
      this._lampTarget = Math.max(0, this._lampTarget - 0.4);
    }
  }

  step(now) {
    const dt = Math.min(0.05, (now - this._lastFrame) / 1000);
    this._lastFrame = now;

    // smoothly blend lamp emissive intensity
    const k = 1 - Math.pow(0.001, dt);
    this._lampLevel += (this._lampTarget - this._lampLevel) * k;
    const lampMat = this.scene.centerpiece.userData.lamp.material;
    lampMat.emissiveIntensity = this._lampLevel * 4.5
      + (this.machine.state === MachineState.KAKUHEN
         ? 0.6 + Math.sin(now / 120) * 0.3 : 0);

    // animate reel digits during a hold
    if (this._holdReel3) {
      this._spinPhase += dt * 18;
      this._repaintReels();
    }

    this.tray.step(dt);
  }

  _repaintReels() {
    const lcd = this.scene.centerpiece.userData.lcd;
    paintReels(lcd.ctx, lcd.canvas.width, lcd.canvas.height,
               this._currentReels, this._spinPhase, this._holdReel3);
    lcd.texture.needsUpdate = true;
  }
}
