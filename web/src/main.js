import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer }   from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass }       from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass }  from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass }       from 'three/addons/postprocessing/OutputPass.js';

import { buildCabinet, CABINET } from './scene/cabinet.js';
import { buildPlayfield, PLAYFIELD } from './scene/playfield.js';
import { BallRenderer, TrayPile } from './scene/balls.js';
import { PlayfieldPhysics } from './physics.js';
import { DejipachiMachine } from './engine/machine.js';
import { Director } from './director.js';
import { Launcher } from './input.js';
import { makeHUD } from './ui.js';

const canvas = document.getElementById('stage');

// --- renderer ---------------------------------------------------------------

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: 'high-performance',
  alpha: false,
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

// --- scene & camera ---------------------------------------------------------

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x06070a);

const camera = new THREE.PerspectiveCamera(34, 1, 0.05, 50);
camera.position.set(0, 0.05, 0.95);
camera.lookAt(0, 0.05, 0);

// PMREM environment for PBR reflections — RoomEnvironment is built-in.
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;

// --- lights -----------------------------------------------------------------

scene.add(new THREE.AmbientLight(0xb0c0d8, 0.18));

const key = new THREE.SpotLight(0xfff2d8, 22, 4, Math.PI / 5, 0.7, 1.6);
key.position.set(-0.8, 1.2, 1.0);
key.target.position.set(0, 0.05, 0);
key.castShadow = true;
key.shadow.mapSize.set(1024, 1024);
key.shadow.bias = -0.0002;
scene.add(key, key.target);

const rim = new THREE.SpotLight(0x66aaff, 6, 3, Math.PI / 4, 0.7);
rim.position.set(1.0, 0.5, 0.6);
rim.target.position.set(0, 0.05, 0);
scene.add(rim, rim.target);

const fill = new THREE.PointLight(0xff8855, 1.2, 1.5, 2.0);
fill.position.set(0, 0.16, 0.18);
scene.add(fill);

// --- floor / room shell -----------------------------------------------------

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(8, 8),
  new THREE.MeshPhysicalMaterial({
    color: 0x0a0c10,
    roughness: 0.85,
    metalness: 0.0,
  }),
);
floor.rotation.x = -Math.PI / 2;
floor.position.y = -CABINET.height / 2 - 0.03;
floor.receiveShadow = true;
scene.add(floor);

// --- cabinet, playfield -----------------------------------------------------

const cabinet = buildCabinet();
scene.add(cabinet);

const playfield = buildPlayfield();
cabinet.add(playfield);

// --- ball renderer + tray ---------------------------------------------------

// Live (in-play) balls render into the playfield-local group so positions are
// in the same coordinate space as physics.
const liveBalls = new BallRenderer(playfield);
const tray = new TrayPile();
const trayBalls = new BallRenderer(cabinet);     // tray is at cabinet level

// --- physics ----------------------------------------------------------------

const physics = new PlayfieldPhysics({
  nailPositions: playfield.userData.nails,
  tulips: playfield.userData.tulips,
  startChuckerPos: new THREE.Vector2(0, PLAYFIELD.startChuckerY),
  attackerPos: new THREE.Vector2(0, -0.158),
});

// --- engine + director ------------------------------------------------------

const machine = new DejipachiMachine();
const hud = makeHUD();
hud.setState('NORMAL');
hud.setQueue(0);
hud.setTray(0);
const director = new Director(machine, {
  centerpiece: playfield.userData.centerpiece,
  attacker:    playfield.userData.attacker,
  tray,
}, hud);

physics.onStartChucker = () => {
  machine.startChucker(1);
};
physics.onAttacker = () => { /* counts toward already-decided payout */ };

// Open/close attacker visually whenever PAYOUT begins/ends. The attacker
// physics gate isn't strictly used because payout balls are decorative
// (they fall directly into the tray pile), but the visual state matters.
machine.addEventListener('PAYOUT_OPEN',  () => physics.attackerOpen = true);
machine.addEventListener('PAYOUT_CLOSE', () => physics.attackerOpen = false);

// --- launcher input ---------------------------------------------------------

const launcher = new Launcher(physics, PLAYFIELD.centerY);
document.addEventListener('reset-machine', () => {
  machine.destroy();
  location.reload();
});

// --- resize -----------------------------------------------------------------

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  composer.setSize(w, h);
}
addEventListener('resize', resize);

// --- post-processing --------------------------------------------------------

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(1024, 1024), 0.7, 0.85, 0.62);
composer.addPass(bloom);
composer.addPass(new OutputPass());

resize();

// --- camera idle drift (subtle) --------------------------------------------

const t0 = performance.now();
function updateCamera(now) {
  const t = (now - t0) / 1000;
  const targetX = Math.sin(t * 0.18) * 0.04;
  const targetY = 0.05 + Math.sin(t * 0.22) * 0.012;
  camera.position.x += (targetX - camera.position.x) * 0.04;
  camera.position.y += (targetY - camera.position.y) * 0.04;
  camera.lookAt(0, 0.05, 0);
}

// --- animation --------------------------------------------------------------

let lastT = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - lastT) / 1000);
  lastT = now;

  launcher.step(dt);
  physics.step(dt);
  director.step(now);

  // Sync live-ball positions into the instanced renderer (playfield-local).
  const livePositions = physics.balls.map(b => ({
    x: b.pos.x, y: b.pos.y, z: PLAYFIELD.z,
  }));
  liveBalls.update(livePositions);

  // Sync tray balls (cabinet-local).
  trayBalls.update(tray.positions());

  hud.setQueue(machine.queuedSpins);
  updateCamera(now);

  composer.render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
