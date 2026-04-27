import * as THREE from 'three';
import { getMaterials } from '../materials.js';
import { CABINET } from './cabinet.js';

// Playfield is the round disc at the top of the cabinet, full of nails,
// tulips, and a centerpiece. We expose its geometry so the physics layer
// can run 2D simulation in the same space as the rendering.
export const PLAYFIELD = Object.freeze({
  radius: 0.205,
  centerY: 0.16,                 // offset above cabinet origin
  z: 0.012,                      // ball-plane z (between glass and backboard)
  nailRadius: 0.0018,
  ballRadius: 0.0055,
  startChuckerY: -0.10,          // y-coord (relative to playfield center)
  startChuckerHalfWidth: 0.012,
  jackpotY: -0.005,
  jackpotHalfWidth: 0.018,
});

export function buildPlayfield() {
  const m = getMaterials();
  const root = new THREE.Group();
  root.name = 'playfield';
  root.position.set(0, PLAYFIELD.centerY, 0.005);

  // Painted backboard disc with subtle floral pattern (we approximate via
  // a radial-gradient canvas texture).
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(PLAYFIELD.radius, 96),
    new THREE.MeshPhysicalMaterial({
      map: makePlayfieldArt(1024),
      roughness: 0.55,
      metalness: 0.0,
      clearcoat: 0.35,
      clearcoatRoughness: 0.2,
    }),
  );
  disc.receiveShadow = true;
  root.add(disc);

  // Chrome ring trim around the playfield disc.
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(PLAYFIELD.radius, PLAYFIELD.radius + 0.008, 96),
    m.chrome,
  );
  ring.position.z = 0.001;
  root.add(ring);

  // Nails — instanced cylinders. Each nail is a static obstacle the ball
  // bounces off in physics. Their layout produces the brass "constellations"
  // visible in the reference photos.
  const nails = buildNails();
  root.add(nails.mesh);
  root.userData.nails = nails.positions;

  // Tulip catchers — symmetric pair near the bottom flanks of the playfield.
  const tulipPositions = [
    new THREE.Vector2(-0.10, -0.06),
    new THREE.Vector2( 0.10, -0.06),
    new THREE.Vector2(-0.062, -0.085),
    new THREE.Vector2( 0.062, -0.085),
  ];
  const tulips = tulipPositions.map(p => buildTulip(p));
  tulips.forEach(t => root.add(t));
  root.userData.tulips = tulips;

  // Centerpiece (yakumono) — ornate housing with embedded LCD reels.
  const centerpiece = buildCenterpiece();
  centerpiece.position.set(0, 0.025, 0.004);
  root.add(centerpiece);
  root.userData.centerpiece = centerpiece;

  // Start chucker — small open mouth below centerpiece.
  const chucker = buildStartChucker();
  chucker.position.set(0, PLAYFIELD.startChuckerY, 0.003);
  root.add(chucker);
  root.userData.startChucker = chucker;

  // Attacker (jackpot gate) — wide gate just above the rail; closed by default.
  const attacker = buildAttacker();
  attacker.position.set(0, -0.158, 0.003);
  root.add(attacker);
  root.userData.attacker = attacker;

  return root;
}

// ---- art ------------------------------------------------------------------

function makePlayfieldArt(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');

  // Cream base with hint of green (reference photo style)
  const grad = ctx.createRadialGradient(size/2, size/2, size*0.05, size/2, size/2, size/2);
  grad.addColorStop(0.0, '#f7f0d8');
  grad.addColorStop(0.6, '#efe6c6');
  grad.addColorStop(1.0, '#dcd2ad');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  // Soft floral motifs — pale teal and gold sweeps.
  ctx.globalAlpha = 0.18;
  for (let i = 0; i < 28; i++) {
    const cx = Math.random() * size;
    const cy = Math.random() * size;
    const r  = 80 + Math.random() * 200;
    const g2 = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g2.addColorStop(0, i % 2 ? '#a9d3c8' : '#e9c46a');
    g2.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g2;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Subtle vignette
  const vg = ctx.createRadialGradient(size/2, size/2, size*0.45, size/2, size/2, size/2);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.35)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

// ---- nails ----------------------------------------------------------------

function buildNails() {
  const m = getMaterials();
  const positions = generateNailLayout();

  const geom = new THREE.CylinderGeometry(
    PLAYFIELD.nailRadius, PLAYFIELD.nailRadius * 0.85, 0.011, 8,
  );
  const mesh = new THREE.InstancedMesh(geom, m.brass, positions.length);
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  const dummy = new THREE.Object3D();
  positions.forEach((p, i) => {
    dummy.position.set(p.x, p.y, 0.005);
    dummy.rotation.set(Math.PI / 2, 0, 0);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;

  return { mesh, positions };
}

// Hand-tuned layout: V-shaped fan + arc bands + chevrons leading to chucker.
function generateNailLayout() {
  const out = [];
  const R = PLAYFIELD.radius;

  // Top arc band — funnels balls inward
  for (let i = 0; i < 36; i++) {
    const t = i / 35;
    const a = Math.PI * (0.15 + t * 0.7); // upper-half arc
    out.push(new THREE.Vector2(Math.cos(a) * (R - 0.012), Math.sin(a) * (R - 0.012)));
  }
  // Secondary arc
  for (let i = 0; i < 28; i++) {
    const t = i / 27;
    const a = Math.PI * (0.20 + t * 0.6);
    out.push(new THREE.Vector2(Math.cos(a) * (R - 0.04), Math.sin(a) * (R - 0.04)));
  }

  // Left + right "wing" diagonals (the chevron streams visible in the ref)
  for (let side of [-1, 1]) {
    for (let i = 0; i < 11; i++) {
      const x = side * (0.08 + i * 0.011);
      const y = 0.07 - i * 0.012;
      out.push(new THREE.Vector2(x, y));
    }
    for (let i = 0; i < 9; i++) {
      const x = side * (0.12 + i * 0.008);
      const y = 0.04 - i * 0.012;
      out.push(new THREE.Vector2(x, y));
    }
  }

  // Vertical streams flanking the centerpiece
  for (let side of [-1, 1]) {
    for (let i = 0; i < 7; i++) {
      out.push(new THREE.Vector2(side * 0.055, 0.015 - i * 0.013));
    }
    for (let i = 0; i < 6; i++) {
      out.push(new THREE.Vector2(side * 0.085, -0.005 - i * 0.014));
    }
  }

  // Funnel into the start chucker
  for (let i = 0; i < 5; i++) {
    out.push(new THREE.Vector2(-0.025 - i * 0.006, -0.08 - i * 0.005));
    out.push(new THREE.Vector2( 0.025 + i * 0.006, -0.08 - i * 0.005));
  }

  // Sparse field at top center
  for (let i = 0; i < 12; i++) {
    out.push(new THREE.Vector2(
      (Math.random() - 0.5) * 0.18,
       0.10 + Math.random() * 0.06,
    ));
  }

  // Clamp inside disc, with min spacing.
  const cleaned = [];
  for (const p of out) {
    if (p.length() > R - 0.012) continue;
    let ok = true;
    for (const q of cleaned) {
      if (p.distanceToSquared(q) < 0.011 * 0.011) { ok = false; break; }
    }
    if (ok) cleaned.push(p);
  }
  return cleaned;
}

// ---- tulip catcher --------------------------------------------------------

function buildTulip(pos) {
  const m = getMaterials();
  const tulip = new THREE.Group();
  tulip.position.set(pos.x, pos.y, 0.004);

  // Two angled "petals" forming a V mouth
  const petalGeom = new THREE.BoxGeometry(0.022, 0.005, 0.012);
  for (let side of [-1, 1]) {
    const petal = new THREE.Mesh(petalGeom, m.tulipRed);
    petal.position.x = side * 0.011;
    petal.rotation.z = side * -0.5;
    petal.castShadow = true;
    tulip.add(petal);
  }
  // Brass center stamen
  const stamen = new THREE.Mesh(
    new THREE.SphereGeometry(0.004, 16, 12),
    m.brass,
  );
  stamen.position.y = 0.001;
  tulip.add(stamen);

  tulip.userData.isTulip = true;
  tulip.userData.pos = pos.clone();
  return tulip;
}

// ---- centerpiece + LCD ----------------------------------------------------

function buildCenterpiece() {
  const m = getMaterials();
  const cp = new THREE.Group();
  cp.name = 'centerpiece';

  // Outer ornate housing — chrome ring, brass details
  const housing = new THREE.Mesh(
    new THREE.CylinderGeometry(0.072, 0.072, 0.013, 48),
    m.chrome,
  );
  housing.rotation.x = Math.PI / 2;
  housing.castShadow = true;
  housing.receiveShadow = true;
  cp.add(housing);

  // Brass crown — top arc decoration
  const crownGeom = new THREE.TorusGeometry(0.06, 0.005, 8, 24, Math.PI);
  const crown = new THREE.Mesh(crownGeom, m.brass);
  crown.rotation.z = Math.PI;
  crown.position.set(0, 0.052, 0.006);
  cp.add(crown);

  // Inset LCD panel — three reel viewport
  const lcdWidth = 0.10, lcdHeight = 0.05;
  const lcd = new THREE.Mesh(
    new THREE.PlaneGeometry(lcdWidth, lcdHeight),
    new THREE.MeshBasicMaterial({ color: 0x000000, toneMapped: false }),
  );
  lcd.position.set(0, 0, 0.007);
  cp.add(lcd);

  // Reel canvas — drawn dynamically by the scene controller
  const canvas = document.createElement('canvas');
  canvas.width = 768; canvas.height = 384;
  const ctx = canvas.getContext('2d');
  paintReels(ctx, canvas.width, canvas.height, [0,0,0], 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const reels = new THREE.Mesh(
    new THREE.PlaneGeometry(lcdWidth - 0.005, lcdHeight - 0.005),
    new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }),
  );
  reels.position.set(0, 0, 0.0075);
  cp.add(reels);

  // Jackpot lamp — emissive disc above the LCD that the director pulses
  const lamp = new THREE.Mesh(
    new THREE.SphereGeometry(0.012, 24, 16),
    m.jackpotLamp,
  );
  lamp.position.set(0, 0.034, 0.012);
  cp.add(lamp);

  cp.userData.lcd = { canvas, ctx, texture: tex, mesh: reels };
  cp.userData.lamp = lamp;
  return cp;
}

export function paintReels(ctx, w, h, reels, spinPhase = 0, holdReel3 = false) {
  ctx.fillStyle = '#040206';
  ctx.fillRect(0, 0, w, h);

  // Subtle inner glow
  const grd = ctx.createRadialGradient(w/2, h/2, 20, w/2, h/2, w/1.4);
  grd.addColorStop(0, 'rgba(255,150,80,0.08)');
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, w, h);

  const cellW = w / 3;
  for (let i = 0; i < 3; i++) {
    const cx = cellW * (i + 0.5);
    const cy = h / 2;

    // reel slot border
    ctx.strokeStyle = 'rgba(255,179,71,0.55)';
    ctx.lineWidth = 4;
    ctx.strokeRect(cellW * i + 16, 16, cellW - 32, h - 32);

    // value — when reel is "spinning" we render motion blur of digits
    const isSpinning = spinPhase > 0 && (i < 2 ? false : holdReel3);
    if (isSpinning) {
      ctx.fillStyle = 'rgba(255,210,120,0.85)';
      ctx.font = 'bold 90px ui-sans-serif, system-ui';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      // streaky digit cascade
      for (let k = -2; k <= 2; k++) {
        ctx.globalAlpha = 0.18 + 0.18 * (1 - Math.abs(k));
        const d = ((reels[i] + spinPhase + k) | 0) % 10;
        ctx.fillText(String(d), cx, cy + k * 36 + (spinPhase * 12 % 36));
      }
      ctx.globalAlpha = 1;
    } else {
      ctx.fillStyle = '#ffe6a6';
      ctx.font = 'bold 130px ui-sans-serif, system-ui';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = 'rgba(255,90,40,0.8)';
      ctx.shadowBlur = 22;
      ctx.fillText(String(reels[i] ?? '–'), cx, cy + 4);
      ctx.shadowBlur = 0;
    }
  }
}

// ---- start chucker --------------------------------------------------------

function buildStartChucker() {
  const m = getMaterials();
  const ch = new THREE.Group();

  const mouth = new THREE.Mesh(
    new THREE.BoxGeometry(PLAYFIELD.startChuckerHalfWidth * 2, 0.004, 0.014),
    m.brass,
  );
  mouth.position.y = 0.002;
  ch.add(mouth);

  const cup = new THREE.Mesh(
    new THREE.BoxGeometry(PLAYFIELD.startChuckerHalfWidth * 1.6, 0.012, 0.008),
    new THREE.MeshPhysicalMaterial({
      color: 0xffaa55,
      emissive: 0x331a08,
      roughness: 0.4,
      metalness: 0.5,
    }),
  );
  cup.position.y = -0.006;
  ch.add(cup);

  ch.userData.isStartChucker = true;
  return ch;
}

// ---- attacker -------------------------------------------------------------

function buildAttacker() {
  const m = getMaterials();
  const att = new THREE.Group();

  const closed = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, 0.006, 0.012),
    m.brushedChrome,
  );
  att.add(closed);

  const open = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, 0.018, 0.006),
    new THREE.MeshStandardMaterial({
      color: 0xff7733,
      emissive: 0xff7733,
      emissiveIntensity: 1.5,
    }),
  );
  open.position.y = -0.008;
  open.visible = false;
  att.add(open);

  att.userData.closedMesh = closed;
  att.userData.openMesh = open;
  att.userData.isAttacker = true;
  return att;
}
