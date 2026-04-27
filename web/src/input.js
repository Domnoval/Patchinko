import * as THREE from 'three';
import { PLAYFIELD } from './scene/playfield.js';

// Launcher: holding SPACE (or pointer) charges power; release to fire one
// ball into the playfield, entering through the upper-right rim. The
// spawn velocity bends the ball around the top arc — same trajectory as
// a vintage spring launcher.
export class Launcher {
  constructor(physics, playfieldOriginY) {
    this.physics = physics;
    this.power = 0;
    this.charging = false;
    this.autoFire = false;          // hold to keep launching
    this.cooldown = 0;
    this._yOffset = playfieldOriginY;

    addEventListener('keydown', e => {
      if (e.code === 'Space') { this.charging = true; this.autoFire = true; e.preventDefault(); }
      if (e.code === 'KeyR')  { /* let main reset */ document.dispatchEvent(new CustomEvent('reset-machine')); }
    });
    addEventListener('keyup', e => {
      if (e.code === 'Space') { this.charging = false; this.autoFire = false; }
    });
    addEventListener('pointerdown', () => { this.charging = true; this.autoFire = true; });
    addEventListener('pointerup',   () => { this.charging = false; this.autoFire = false; });
  }

  step(dt) {
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (this.charging) this.power = Math.min(1, this.power + dt * 1.6);
    if (this.autoFire && this.cooldown <= 0 && this.power > 0.55) {
      this._fire();
    }
  }

  _fire() {
    // Aim: launch upward along the right rim, swing around the top arc.
    const launchPower = 0.85 + (this.power - 0.55) * 0.6;
    const angle = Math.PI * 0.62;     // up-right
    const vx =  Math.cos(angle) * launchPower * 1.05;
    const vy =  Math.sin(angle) * launchPower * 1.25;
    this.physics.spawnBall({
      x: PLAYFIELD.radius - 0.014,
      y: -PLAYFIELD.radius + 0.02,
      vx, vy,
    });
    this.cooldown = 0.18;             // cadence cap
    this.power = 0;
  }
}
