import * as THREE from 'three';
import { PLAYFIELD } from './scene/playfield.js';

// Hand-rolled 2D solver on the playfield (x,y) plane. Cheaper than a full
// rigid-body engine and the only one we actually need: balls + static nails,
// gravity downward, sub-stepped integration for stability.

const GRAVITY = -0.62;       // m/s^2 in the playfield plane (artistic, not 9.8)
const RESTITUTION_NAIL = 0.55;
const RESTITUTION_WALL = 0.42;
const AIR_DRAG = 0.0008;
const FRICTION = 0.998;
const MAX_VEL = 1.3;
const SUBSTEPS = 4;

export class PlayfieldPhysics {
  constructor({ nailPositions, tulips, startChuckerPos, attackerPos }) {
    this.nails = nailPositions;
    this.tulips = tulips;
    this.startChucker = startChuckerPos;       // THREE.Vector2 (playfield-local)
    this.attacker = attackerPos;
    this.attackerOpen = false;

    this.balls = [];
    this.onStartChucker = null;
    this.onAttacker = null;
    this.onLost = null;
  }

  spawnBall({ x, y, vx = 0, vy = 0 }) {
    const ball = {
      pos: new THREE.Vector2(x, y),
      vel: new THREE.Vector2(vx, vy),
      r: PLAYFIELD.ballRadius,
      alive: true,
      ttl: 12, // seconds
    };
    this.balls.push(ball);
    return ball;
  }

  step(dt) {
    const sub = dt / SUBSTEPS;
    for (let s = 0; s < SUBSTEPS; s++) this._substep(sub);
    this.balls = this.balls.filter(b => b.alive);
  }

  _substep(dt) {
    for (const b of this.balls) {
      if (!b.alive) continue;

      // Integrate
      b.vel.y += GRAVITY * dt;
      b.vel.multiplyScalar(1 - AIR_DRAG);
      b.vel.multiplyScalar(FRICTION);
      const speed = b.vel.length();
      if (speed > MAX_VEL) b.vel.multiplyScalar(MAX_VEL / speed);

      b.pos.x += b.vel.x * dt;
      b.pos.y += b.vel.y * dt;
      b.ttl -= dt;
      if (b.ttl <= 0) { b.alive = false; this.onLost?.(b); continue; }

      // Disc boundary — reflect off the playfield rim
      const rim = PLAYFIELD.radius - b.r - 0.001;
      if (b.pos.length() > rim) {
        const n = b.pos.clone().normalize();
        b.pos.copy(n.clone().multiplyScalar(rim));
        const vn = b.vel.dot(n);
        if (vn > 0) b.vel.sub(n.multiplyScalar((1 + RESTITUTION_WALL) * vn));
      }

      // Nail collisions — circle/circle
      for (const np of this.nails) {
        const dx = b.pos.x - np.x;
        const dy = b.pos.y - np.y;
        const distSq = dx * dx + dy * dy;
        const minD = b.r + PLAYFIELD.nailRadius;
        if (distSq < minD * minD && distSq > 0) {
          const dist = Math.sqrt(distSq);
          const nx = dx / dist, ny = dy / dist;
          const overlap = minD - dist;
          b.pos.x += nx * overlap;
          b.pos.y += ny * overlap;
          const vn = b.vel.x * nx + b.vel.y * ny;
          if (vn < 0) {
            b.vel.x -= (1 + RESTITUTION_NAIL) * vn * nx;
            b.vel.y -= (1 + RESTITUTION_NAIL) * vn * ny;
            // tiny lateral jitter for chaotic deflection
            b.vel.x += (Math.random() - 0.5) * 0.04;
          }
        }
      }

      // Tulip catchers — small AABBs that consume the ball and award a spin.
      for (const t of this.tulips) {
        const tp = t.userData.pos;
        const halfW = 0.013, halfH = 0.006;
        if (Math.abs(b.pos.x - tp.x) < halfW && Math.abs(b.pos.y - tp.y) < halfH) {
          b.alive = false;
          this.onStartChucker?.(b);
          break;
        }
      }
      if (!b.alive) continue;

      // Start chucker — central trigger
      if (Math.abs(b.pos.x - this.startChucker.x) < PLAYFIELD.startChuckerHalfWidth
       && Math.abs(b.pos.y - this.startChucker.y) < 0.008) {
        b.alive = false;
        this.onStartChucker?.(b);
        continue;
      }

      // Attacker — only triggers when open
      if (this.attackerOpen
       && Math.abs(b.pos.x - this.attacker.x) < 0.04
       && Math.abs(b.pos.y - this.attacker.y) < 0.012) {
        b.alive = false;
        this.onAttacker?.(b);
        continue;
      }

      // Lost off bottom of disc — drains to "out lane"
      if (b.pos.y < -PLAYFIELD.radius + b.r + 0.005) {
        b.alive = false;
        this.onLost?.(b);
      }
    }
  }
}
