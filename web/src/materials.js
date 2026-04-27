import * as THREE from 'three';

// ---- procedural textures ---------------------------------------------------

function makeNoiseCanvas(size, fn) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = fn(x / size, y / size);
      const i = (y * size + x) * 4;
      img.data[i  ] = r;
      img.data[i+1] = g;
      img.data[i+2] = b;
      img.data[i+3] = a;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

function canvasTexture(canvas, { repeat = 1, anisotropy = 8 } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = anisotropy;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function woodTexture(size = 512) {
  const c = makeNoiseCanvas(size, (u, v) => {
    // anisotropic ring noise — warm walnut
    const grain = Math.sin(v * 80 + Math.sin(u * 6) * 4) * 0.5 + 0.5;
    const fine  = (Math.random() - 0.5) * 0.08;
    const t = grain * 0.8 + fine + 0.1;
    const r = 70  + 110 * t;
    const g = 42  + 70  * t;
    const b = 22  + 38  * t;
    return [r, g, b, 255];
  });
  return canvasTexture(c, { repeat: 1 });
}

function brushedMetalTexture(size = 512, hue = 0.10) {
  const c = makeNoiseCanvas(size, (u) => {
    const streak = Math.sin(u * 600 + Math.random()) * 0.5 + 0.5;
    const v = 200 + streak * 40 + (Math.random() - 0.5) * 12;
    return [v * (0.95 + hue), v * 0.95, v * (0.9 - hue * 0.5), 255];
  });
  return canvasTexture(c, { repeat: 2 });
}

// ---- PBR materials ---------------------------------------------------------

let cache;

export function getMaterials() {
  if (cache) return cache;

  const wood = new THREE.MeshPhysicalMaterial({
    map: woodTexture(),
    roughness: 0.55,
    metalness: 0.0,
    clearcoat: 0.35,
    clearcoatRoughness: 0.25,
    envMapIntensity: 1.0,
  });

  const chrome = new THREE.MeshPhysicalMaterial({
    color: 0xeef0f3,
    roughness: 0.18,
    metalness: 1.0,
    envMapIntensity: 1.4,
  });

  const brushedChrome = new THREE.MeshPhysicalMaterial({
    color: 0xdfe2e6,
    map: brushedMetalTexture(512, 0.0),
    roughness: 0.32,
    metalness: 1.0,
    envMapIntensity: 1.1,
  });

  const brass = new THREE.MeshPhysicalMaterial({
    color: 0xc99a47,
    roughness: 0.22,
    metalness: 1.0,
    envMapIntensity: 1.25,
  });

  const glass = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    roughness: 0.05,
    metalness: 0.0,
    transmission: 0.95,
    thickness: 0.05,
    ior: 1.45,
    transparent: true,
    opacity: 0.9,
    envMapIntensity: 1.6,
    side: THREE.DoubleSide,
  });

  const playfield = new THREE.MeshPhysicalMaterial({
    color: 0xf6f1e3,
    roughness: 0.6,
    metalness: 0.0,
    clearcoat: 0.6,
    clearcoatRoughness: 0.15,
  });

  const tulipRed = new THREE.MeshPhysicalMaterial({
    color: 0xd23a2e,
    roughness: 0.32,
    metalness: 0.65,
    clearcoat: 0.8,
    clearcoatRoughness: 0.1,
    envMapIntensity: 1.1,
  });

  const ball = new THREE.MeshPhysicalMaterial({
    color: 0xc8ccd4,
    roughness: 0.2,
    metalness: 1.0,
    envMapIntensity: 1.4,
  });

  // Emissive accent — the "fever" jackpot lamp; we modulate emissiveIntensity.
  const jackpotLamp = new THREE.MeshStandardMaterial({
    color: 0x100804,
    emissive: 0xff7733,
    emissiveIntensity: 0.0,
    roughness: 0.35,
    metalness: 0.4,
  });

  const lcdScreen = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    toneMapped: false,
  });

  cache = {
    wood, chrome, brushedChrome, brass, glass,
    playfield, tulipRed, ball, jackpotLamp, lcdScreen,
  };
  return cache;
}
