import * as THREE from 'three';
import { getMaterials } from '../materials.js';
import { PLAYFIELD } from './playfield.js';
import { CABINET } from './cabinet.js';

// Up to ~600 visible balls (live + tray). Instanced for cheap rendering.
const MAX_INSTANCES = 800;

export class BallRenderer {
  constructor(parent) {
    const geom = new THREE.SphereGeometry(PLAYFIELD.ballRadius, 18, 14);
    this.mesh = new THREE.InstancedMesh(geom, getMaterials().ball, MAX_INSTANCES);
    this.mesh.castShadow = true;
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    parent.add(this.mesh);
    this._dummy = new THREE.Object3D();
    this._hidden = new THREE.Matrix4().makeScale(0, 0, 0);
  }

  /**
   * Update with a list of {x, y, z} world-space positions (already converted
   * from playfield-local). Anything beyond the count is hidden.
   */
  update(positions) {
    const n = Math.min(positions.length, MAX_INSTANCES);
    for (let i = 0; i < n; i++) {
      const p = positions[i];
      this._dummy.position.set(p.x, p.y, p.z);
      this._dummy.rotation.set(0, 0, 0);
      this._dummy.scale.set(1, 1, 1);
      this._dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this._dummy.matrix);
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

// "Tray balls" are decorative balls accumulated from the payout. They don't
// run through the playfield physics — they pile up in the bottom tray with
// a cheap quasi-physical settle.
export class TrayPile {
  constructor() {
    this.balls = [];                    // {x, y, z, vx, vy}
    this.trayWidth = CABINET.width - 0.07;
    this.trayDepth = 0.04;
    this.trayY = -CABINET.height / 2 + 0.085;
  }

  add(n = 1) {
    for (let i = 0; i < n; i++) {
      this.balls.push({
        x: (Math.random() - 0.5) * 0.05,
        y: this.trayY + 0.08 + Math.random() * 0.02,
        z: 0.03 + (Math.random() - 0.5) * 0.01,
        vx: (Math.random() - 0.5) * 0.05,
        vy: -0.05 - Math.random() * 0.05,
        settled: false,
      });
    }
    if (this.balls.length > 600) this.balls.splice(0, this.balls.length - 600);
  }

  step(dt) {
    const r = PLAYFIELD.ballRadius;
    const yFloor = this.trayY - 0.04;
    const xLim   = this.trayWidth / 2 - r;
    for (const b of this.balls) {
      if (b.settled) continue;
      b.vy -= 0.55 * dt;
      b.vx *= 0.98;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (b.x >  xLim) { b.x =  xLim; b.vx *= -0.4; }
      if (b.x < -xLim) { b.x = -xLim; b.vx *= -0.4; }

      // Stack: simple — find lowest free slot left/right
      for (const o of this.balls) {
        if (o === b) continue;
        const dx = b.x - o.x, dy = b.y - o.y;
        const d2 = dx*dx + dy*dy;
        const minD = r * 2;
        if (d2 < minD * minD && d2 > 1e-9) {
          const d = Math.sqrt(d2);
          const nx = dx/d, ny = dy/d;
          const overlap = (minD - d) * 0.5;
          b.x += nx * overlap; b.y += ny * overlap;
          o.x -= nx * overlap; o.y -= ny * overlap;
          b.vx *= 0.5; b.vy *= 0.5;
        }
      }
      if (b.y < yFloor + r) {
        b.y = yFloor + r;
        b.vy *= -0.2;
        if (Math.abs(b.vy) < 0.02) b.vy = 0;
      }
      if (Math.abs(b.vx) < 0.005 && Math.abs(b.vy) < 0.005) b.settled = true;
    }
  }

  positions() { return this.balls; }
}
