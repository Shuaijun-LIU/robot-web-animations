import './styles.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const canvas = document.querySelector('#scene');
document.body.classList.add('loading');

const scene = new THREE.Scene();
scene.background = null;
scene.fog = new THREE.Fog('#000000', 8, 18);

const camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0.15, 1.35, 6.2);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor('#000000', 0);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.8;

const controls = new OrbitControls(camera, renderer.domElement);
controls.enablePan = false;
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 3.8;
controls.maxDistance = 8;
controls.maxPolarAngle = Math.PI * 0.68;
controls.target.set(0, 0.65, 0);

const key = new THREE.SpotLight('#fff1dc', 3.2, 14, 0.55, 0.55, 1.2);
key.position.set(2.6, 4.8, 4.2);
key.castShadow = true;
key.shadow.mapSize.set(1024, 1024);
scene.add(key);

const fill = new THREE.SpotLight('#a7c8e8', 0.65, 12, 0.7, 0.72, 1.5);
fill.position.set(-4.2, 2.7, 3.6);
scene.add(fill);

const rim = new THREE.DirectionalLight('#d8e6ff', 0.45);
rim.position.set(-3.8, 2.2, -4.4);
scene.add(rim);

const overhead = new THREE.SpotLight('#8e70ff', 32, 12, 0.68, 0.82, 0.95);
overhead.position.set(0, 5.1, 1.05);
overhead.target.position.set(0, 0.35, 0);
overhead.castShadow = true;
overhead.shadow.mapSize.set(1024, 1024);
scene.add(overhead);
scene.add(overhead.target);

scene.add(new THREE.HemisphereLight('#dce6ef', '#171819', 0.34));

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(12, 12),
  new THREE.ShadowMaterial({
    color: '#000000',
    opacity: 0.22,
  }),
);
floor.rotation.x = -Math.PI / 2;
floor.position.y = -1.055;
floor.receiveShadow = true;
scene.add(floor);

const loader = new GLTFLoader();
const robotRoot = new THREE.Group();
scene.add(robotRoot);

const starRoot = new THREE.Group();
scene.add(starRoot);

const pointer = new THREE.Vector2();
const pointerTarget = new THREE.Vector2();
const raycaster = new THREE.Raycaster();
const clickableMeshes = [];
let robotScene;
let head;
let button;
let eyeSpheres = [];
let focusStars = [];
let hovered = false;
let active = false;
let lastPointerAt = performance.now();

const modelUrl = `${import.meta.env.BASE_URL}models/robot.glb`;
const sparkleTexture = createSparkleTexture();
const starState = {
  cycle: -1,
  gaze: new THREE.Vector2(),
};

loader.load(modelUrl, (gltf) => {
  robotScene = gltf.scene;
  normalizeModel(robotScene, 3.05);
  robotScene.traverse((object) => {
    if (object.isMesh) {
      object.castShadow = true;
      object.receiveShadow = true;
      clickableMeshes.push(object);
      if (object.material) {
        object.material = createRobotMaterial(object);
      }
    }
  });

  head = robotScene.getObjectByName('Cabeza');
  button = robotScene.getObjectByName('Button') || robotScene.getObjectByName('Botón');
  eyeSpheres = findEyeSpheres(robotScene);
  replaceEyeSpheresWithDiscs(eyeSpheres);

  robotRoot.add(robotScene);
  document.body.classList.remove('loading');
});

focusStars = createFocusSparkles();

function createRobotMaterial(object) {
  const material = object.material.clone();
  const lineage = getLineage(object).join(' ');
  material.roughness = 0.54;
  material.metalness = 0.14;

  if (isEyeSphere(object)) {
    return createEyeMaterial();
  } else if (isPedestalPart(object)) {
    material.color = new THREE.Color('#252336');
    material.emissive = new THREE.Color('#0b0818');
    material.emissiveIntensity = 0.08;
    material.roughness = 0.62;
    material.metalness = 0.2;
  } else if (/Ojos|Boolean 2/i.test(lineage)) {
    material.color = new THREE.Color('#20262b');
    material.emissive = new THREE.Color('#05080a');
    material.emissiveIntensity = 0.05;
    material.roughness = 0.36;
    material.metalness = 0.05;
  } else if (/Ears|Cylinder/i.test(lineage)) {
    material.color = new THREE.Color('#343a40');
    material.roughness = 0.44;
    material.metalness = 0.34;
  } else if (/Cabeza|Boolean/i.test(lineage)) {
    material.color = new THREE.Color('#e8e1d6');
    material.roughness = 0.42;
  } else if (/Cuerpo|Cube/i.test(lineage)) {
    material.color = new THREE.Color('#b9bab3');
    material.roughness = 0.5;
    material.metalness = 0.2;
  } else if (/Button|Botón|Text/i.test(lineage)) {
    material.color = new THREE.Color('#c49a4a');
    material.emissive = new THREE.Color('#2a1b05');
    material.emissiveIntensity = 0.12;
    material.roughness = 0.42;
  } else {
    material.color = new THREE.Color('#9da2a2');
  }

  material.userData.baseColor = material.color.clone();
  material.userData.baseEmissive = material.emissive ? material.emissive.clone() : new THREE.Color('#000000');
  return material;
}

function createEyeMaterial() {
  const material = new THREE.MeshStandardMaterial({
    color: '#9fdfff',
    emissive: '#4daef0',
    emissiveIntensity: 0.28,
    roughness: 0.96,
    metalness: 0,
  });
  material.userData.baseColor = material.color.clone();
  material.userData.baseEmissive = material.emissive.clone();
  return material;
}

function createSparkleTexture() {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  const center = size / 2;

  const glow = context.createRadialGradient(center, center, 2, center, center, center);
  glow.addColorStop(0, 'rgba(255, 248, 204, 1)');
  glow.addColorStop(0.22, 'rgba(255, 220, 91, 0.88)');
  glow.addColorStop(0.58, 'rgba(255, 182, 38, 0.28)');
  glow.addColorStop(1, 'rgba(255, 182, 38, 0)');
  context.fillStyle = glow;
  context.fillRect(0, 0, size, size);

  context.save();
  context.translate(center, center);
  context.fillStyle = 'rgba(255, 246, 190, 1)';
  context.beginPath();
  context.moveTo(0, -96);
  context.quadraticCurveTo(10, -18, 96, 0);
  context.quadraticCurveTo(10, 18, 0, 96);
  context.quadraticCurveTo(-10, 18, -96, 0);
  context.quadraticCurveTo(-10, -18, 0, -96);
  context.closePath();
  context.fill();

  context.fillStyle = 'rgba(255, 214, 82, 0.95)';
  context.beginPath();
  context.moveTo(0, -46);
  context.quadraticCurveTo(6, -8, 46, 0);
  context.quadraticCurveTo(6, 8, 0, 46);
  context.quadraticCurveTo(-6, 8, -46, 0);
  context.quadraticCurveTo(-6, -8, 0, -46);
  context.closePath();
  context.fill();
  context.restore();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createSparkleMaterial() {
  return new THREE.SpriteMaterial({
    map: sparkleTexture,
    color: '#ffd45c',
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}

function createFocusSparkles() {
  const starClusters = [
    {
      gaze: [-0.95, 0.62],
      stars: [
        { position: [-3.1, 2.48, -0.32], size: 0.58, delay: 0.05 },
        { position: [-3.42, 2.12, -0.22], size: 0.2, delay: 0.2 },
        { position: [-2.9, 2.82, -0.18], size: 0.14, delay: 0.34 },
      ],
    },
    {
      gaze: [-0.78, 0.45],
      stars: [
        { position: [-1.55, 1.88, -0.1], size: 0.62, delay: 0 },
        { position: [-1.23, 2.15, -0.16], size: 0.24, delay: 0.16 },
        { position: [-1.78, 1.58, 0.02], size: 0.16, delay: 0.28 },
      ],
    },
    {
      gaze: [0.32, 0.78],
      stars: [
        { position: [0.38, 2.38, -0.32], size: 0.76, delay: 0.11 },
        { position: [0.1, 2.07, -0.25], size: 0.22, delay: 0.25 },
      ],
    },
    {
      gaze: [0.86, 0.18],
      stars: [
        { position: [1.62, 1.5, -0.02], size: 0.54, delay: 0.08 },
        { position: [1.93, 1.88, -0.12], size: 0.2, delay: 0.2 },
        { position: [1.35, 1.22, 0.1], size: 0.14, delay: 0.36 },
      ],
    },
    {
      gaze: [-0.18, 0.22],
      stars: [
        { position: [-0.28, 1.62, 0.16], size: 0.42, delay: 0.18 },
        { position: [-0.55, 1.84, 0.05], size: 0.14, delay: 0.3 },
      ],
    },
    {
      gaze: [0.72, 0.62],
      stars: [
        { position: [2.18, 2.22, -0.18], size: 0.64, delay: 0.04 },
        { position: [2.48, 2.54, -0.28], size: 0.22, delay: 0.22 },
        { position: [1.92, 2.62, -0.12], size: 0.15, delay: 0.34 },
      ],
    },
    {
      gaze: [0.96, 0.52],
      stars: [
        { position: [3.24, 2.04, -0.28], size: 0.56, delay: 0.02 },
        { position: [3.52, 2.38, -0.2], size: 0.19, delay: 0.18 },
        { position: [3.02, 1.68, -0.08], size: 0.15, delay: 0.32 },
      ],
    },
  ];

  return starClusters.flatMap((cluster, clusterIndex) =>
    cluster.stars.map((item, starIndex) => {
      const sparkle = new THREE.Sprite(createSparkleMaterial());
      sparkle.position.set(...item.position);
      sparkle.scale.setScalar(item.size);
      sparkle.userData.basePosition = sparkle.position.clone();
      sparkle.userData.baseScale = item.size;
      sparkle.userData.cluster = clusterIndex;
      sparkle.userData.delay = item.delay;
      sparkle.userData.gaze = new THREE.Vector2(...cluster.gaze);
      sparkle.userData.opacityWeight = starIndex === 0 ? 1 : 0.72 - starIndex * 0.08;
      sparkle.visible = false;
      starRoot.add(sparkle);
      return sparkle;
    }),
  );
}

function replaceEyeSpheresWithDiscs(spheres) {
  const discs = [];
  const geometry = new THREE.CircleGeometry(12.8, 48);
  spheres.forEach((sphere) => {
    const disc = new THREE.Mesh(geometry, createEyeMaterial());
    disc.name = `${sphere.name}_disc`;
    disc.position.copy(sphere.position);
    disc.position.z += 11.9;
    disc.renderOrder = 2;
    sphere.visible = false;
    sphere.parent.add(disc);
    clickableMeshes.push(disc);
    discs.push(disc);
  });
  return discs;
}

function isEyeSphere(object) {
  const normalized = object.name.toLowerCase().replace(/[_-]/g, ' ');
  return normalized === 'sphere 2' || normalized === 'sphere 3';
}

function isPedestalPart(object) {
  const isTopLevel = object.parent?.name === 'Scene 1';
  return isTopLevel && (object.name === 'Plane' || object.name === 'Cube');
}

function findEyeSpheres(root) {
  const result = [];
  root.traverse((object) => {
    if (object.isMesh && isEyeSphere(object)) {
      result.push(object);
    }
  });
  return result;
}

function getLineage(object) {
  const names = [];
  let current = object;
  while (current) {
    if (current.name) names.push(current.name);
    current = current.parent;
  }
  return names;
}

window.addEventListener('pointermove', (event) => {
  pointerTarget.x = (event.clientX / window.innerWidth) * 2 - 1;
  pointerTarget.y = -(event.clientY / window.innerHeight) * 2 + 1;
  lastPointerAt = performance.now();
});

window.addEventListener('pointerdown', () => {
  active = !active;
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

function normalizeModel(model, targetSize) {
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const scale = targetSize / Math.max(size.x, size.y, size.z);
  model.position.sub(center);
  model.scale.setScalar(scale);
  model.position.y -= box.min.y * scale + 1.03;
}

function updateHover() {
  if (!robotScene) return;
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(clickableMeshes, true);
  hovered = hits.length > 0;
  document.body.style.cursor = hovered ? 'pointer' : 'default';
}

function tintObject(object, amount) {
  if (!object) return;
  object.traverse((child) => {
    if (!child.isMesh || !child.material) return;
    const material = child.material;
    if (material.color && material.userData.baseColor) {
      material.color.copy(material.userData.baseColor).lerp(new THREE.Color('#ffffff'), amount * 0.16);
    }
    if (material.emissive) {
      material.emissive.copy(material.userData.baseEmissive).lerp(new THREE.Color('#b7c8dd'), amount);
      material.emissiveIntensity = (material.userData.baseEmissive.getHex() !== 0 ? 0.22 : 0) + amount * 0.35;
    }
  });
}

function animate(time) {
  const seconds = time * 0.001;
  pointer.lerp(pointerTarget, 0.1);
  updateHover();
  const focus = updateFocusStars(seconds);

  if (robotRoot) {
    const focusX = focus.x;
    const focusY = focus.y;
    const idleX = focusX * 0.18 + Math.sin(seconds * 0.55) * 0.025;

    robotRoot.rotation.y += (idleX - robotRoot.rotation.y) * 0.045;
    robotRoot.position.y = Math.sin(seconds * 1.35) * 0.035 + (active ? Math.sin(seconds * 5.2) * 0.018 : 0);
    robotRoot.scale.setScalar(1 + (hovered ? 0.025 : 0) + (active ? 0.035 : 0));

    if (head) {
      head.rotation.y += (focusX * 0.56 - head.rotation.y) * 0.1;
      head.rotation.x += (-focusY * 0.26 - head.rotation.x) * 0.1;
      head.rotation.z = Math.sin(seconds * 1.4) * (active ? 0.045 : 0.018);
    }

    tintObject(button || robotScene, hovered || active ? 0.55 : 0);
    if (button) {
      const pulse = 1 + (hovered ? Math.sin(seconds * 8) * 0.025 + 0.04 : 0);
      button.scale.setScalar(pulse);
    }
  }

  controls.update();
  renderer.render(scene, camera);
}

function updateFocusStars(seconds) {
  if (focusStars.length === 0) {
    return new THREE.Vector2(Math.sin(seconds * 0.6) * 0.3, Math.sin(seconds * 0.5) * 0.25);
  }

  const interval = 5.2;
  const cycle = Math.floor(seconds / interval);
  const localTime = seconds - cycle * interval;
  const clusterCount = Math.max(...focusStars.map((star) => star.userData.cluster)) + 1;
  const activeCluster = cycle % clusterCount;
  const activeStar = focusStars.find((star) => star.userData.cluster === activeCluster) || focusStars[0];

  if (cycle !== starState.cycle) {
    starState.cycle = cycle;
    starState.gaze.copy(activeStar.userData.gaze);
    focusStars.forEach((star) => {
      star.visible = true;
    });
  }

  const fadeIn = THREE.MathUtils.smoothstep(localTime, 0, 1.05);
  const fadeOut = 1 - THREE.MathUtils.smoothstep(localTime, interval - 1.2, interval);
  const activeEnvelope = fadeIn * fadeOut;
  focusStars.forEach((star, index) => {
    const isActive = star.userData.cluster === activeCluster;
    const delayedEnvelope = isActive
      ? Math.max(0, Math.min(1, activeEnvelope - star.userData.delay * 0.22))
      : 0;
    const dimShimmer = 0.065 + Math.max(0, Math.sin(seconds * 1.35 + index * 1.7)) * 0.065;
    const targetOpacity = (isActive ? 0.18 + delayedEnvelope * 0.78 : dimShimmer) * star.userData.opacityWeight;
    const pulse = isActive ? 1 + Math.sin(localTime * 2.4 + index) * 0.05 * delayedEnvelope : 0.92;
    star.visible = true;
    star.material.opacity += (targetOpacity - star.material.opacity) * 0.08;
    star.scale.setScalar(star.userData.baseScale * pulse);
    star.position.copy(star.userData.basePosition);
    star.position.y += Math.sin(seconds * 0.9 + index) * 0.012;
  });

  return starState.gaze;
}

renderer.setAnimationLoop(animate);
