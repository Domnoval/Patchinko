import * as THREE from 'three';
import { getMaterials } from '../materials.js';

// Cabinet dimensions are in meters. Real Showa-era Pachinko cabinets are
// roughly 0.5m wide × 0.8m tall. We model around that to keep the camera
// math intuitive.
export const CABINET = Object.freeze({
  width:  0.52,
  height: 0.82,
  depth:  0.10,
  bezelWidth: 0.022,
});

export function buildCabinet() {
  const m = getMaterials();
  const group = new THREE.Group();
  group.name = 'cabinet';

  // Wooden frame — slab with an inset cutout for the playfield/glass.
  const frameShape = new THREE.Shape();
  frameShape.moveTo(-CABINET.width / 2, -CABINET.height / 2);
  frameShape.lineTo( CABINET.width / 2, -CABINET.height / 2);
  frameShape.lineTo( CABINET.width / 2,  CABINET.height / 2);
  frameShape.lineTo(-CABINET.width / 2,  CABINET.height / 2);
  frameShape.lineTo(-CABINET.width / 2, -CABINET.height / 2);

  // Hole for the glass: tall rounded rectangle covering most of the upper face.
  const inset = CABINET.bezelWidth + 0.008;
  const hole = new THREE.Path();
  const w2 = CABINET.width / 2 - inset;
  const top = CABINET.height / 2 - inset;
  const bot = -CABINET.height / 2 + 0.18; // tray below
  const r = 0.018;
  hole.moveTo(-w2 + r, top);
  hole.lineTo( w2 - r, top);
  hole.quadraticCurveTo(w2, top, w2, top - r);
  hole.lineTo( w2, bot + r);
  hole.quadraticCurveTo(w2, bot, w2 - r, bot);
  hole.lineTo(-w2 + r, bot);
  hole.quadraticCurveTo(-w2, bot, -w2, bot + r);
  hole.lineTo(-w2, top - r);
  hole.quadraticCurveTo(-w2, top, -w2 + r, top);
  frameShape.holes.push(hole);

  const frameGeom = new THREE.ExtrudeGeometry(frameShape, {
    depth: CABINET.depth,
    bevelEnabled: true,
    bevelSize: 0.004,
    bevelThickness: 0.004,
    bevelSegments: 2,
  });
  frameGeom.translate(0, 0, -CABINET.depth / 2);
  const frame = new THREE.Mesh(frameGeom, m.wood);
  frame.castShadow = true;
  frame.receiveShadow = true;
  group.add(frame);

  // Chrome inner bezel — a thin extruded ring just inside the wood cutout.
  const bezelOuter = new THREE.Shape();
  bezelOuter.moveTo(-w2 - 0.004, top + 0.004);
  bezelOuter.lineTo( w2 + 0.004, top + 0.004);
  bezelOuter.lineTo( w2 + 0.004, bot - 0.004);
  bezelOuter.lineTo(-w2 - 0.004, bot - 0.004);
  bezelOuter.lineTo(-w2 - 0.004, top + 0.004);
  const bezelHole = new THREE.Path();
  bezelHole.moveTo(-w2 + 0.001, top - 0.001);
  bezelHole.lineTo( w2 - 0.001, top - 0.001);
  bezelHole.lineTo( w2 - 0.001, bot + 0.001);
  bezelHole.lineTo(-w2 + 0.001, bot + 0.001);
  bezelHole.lineTo(-w2 + 0.001, top - 0.001);
  bezelOuter.holes.push(bezelHole);
  const bezelGeom = new THREE.ExtrudeGeometry(bezelOuter, {
    depth: 0.012,
    bevelEnabled: true,
    bevelSize: 0.0015,
    bevelThickness: 0.0015,
    bevelSegments: 2,
  });
  bezelGeom.translate(0, 0, 0.001);
  const bezel = new THREE.Mesh(bezelGeom, m.chrome);
  bezel.castShadow = true;
  bezel.receiveShadow = true;
  group.add(bezel);

  // Backboard behind the playfield — gives depth and catches shadows.
  const backboardGeom = new THREE.PlaneGeometry(CABINET.width - 0.04, CABINET.height - 0.04);
  const backboard = new THREE.Mesh(backboardGeom, m.playfield);
  backboard.position.z = -CABINET.depth / 2 + 0.001;
  backboard.receiveShadow = true;
  group.add(backboard);

  // Tray: chrome-rimmed scoop at the bottom that catches payout balls.
  const trayGroup = buildTray();
  trayGroup.position.set(0, -CABINET.height / 2 + 0.085, 0.025);
  group.add(trayGroup);

  // Launcher knob — chrome handle on bottom-right.
  const knob = new THREE.Mesh(
    new THREE.CylinderGeometry(0.018, 0.022, 0.012, 24),
    m.brushedChrome,
  );
  knob.rotation.x = Math.PI / 2;
  knob.position.set(CABINET.width / 2 - 0.06, -CABINET.height / 2 + 0.04, 0.03);
  knob.castShadow = true;
  group.add(knob);
  group.userData.launcherKnob = knob;

  return group;
}

function buildTray() {
  const m = getMaterials();
  const tray = new THREE.Group();
  tray.name = 'payout-tray';

  const w = CABINET.width - 0.06;
  const h = 0.10;
  const d = 0.04;

  // Chrome lip at the front (open top toward viewer)
  const lipGeom = new THREE.BoxGeometry(w, 0.012, d);
  const lip = new THREE.Mesh(lipGeom, m.brushedChrome);
  lip.position.y = h / 2;
  lip.castShadow = true;
  lip.receiveShadow = true;
  tray.add(lip);

  // Tray basin — shallow blue/chrome mix, like the references.
  const basin = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshPhysicalMaterial({
      color: 0x3c5a78,
      roughness: 0.4,
      metalness: 0.4,
      clearcoat: 0.6,
    }),
  );
  basin.castShadow = false;
  basin.receiveShadow = true;
  tray.add(basin);

  // Inside floor — for ball deposits to land on
  const floor = new THREE.Mesh(
    new THREE.BoxGeometry(w - 0.01, 0.001, d - 0.01),
    m.brushedChrome,
  );
  floor.position.y = -h / 2 + 0.001;
  floor.receiveShadow = true;
  tray.add(floor);

  tray.userData.bounds = { w, h, d };
  return tray;
}
