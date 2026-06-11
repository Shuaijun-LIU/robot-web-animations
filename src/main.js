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

const overhead = new THREE.SpotLight('#8e70ff', 42, 12, 0.34, 0.62, 1.05);
overhead.position.set(0, 5.35, 1.0);
overhead.target.position.set(0, 0.1, 0);
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

const platform = createCircularPlatform();
robotRoot.add(platform);

const armRoot = new THREE.Group();
armRoot.position.set(-1.08, 0, 0.06);
armRoot.rotation.y = 0.22;
robotRoot.add(armRoot);

const actionRoot = new THREE.Group();
robotRoot.add(actionRoot);

const pointer = new THREE.Vector2();
const pointerTarget = new THREE.Vector2();
const raycaster = new THREE.Raycaster();
const clickableMeshes = [];
const armJoints = {};
const armOriginals = new Map();
let robotScene;
let armScene;
let head;
let body;
let robotJumpRoot;
let button;
let eyeSpheres = [];
let focusStars = [];
let hovered = false;
let active = false;
let lastPointerAt = performance.now();

const modelUrl = `${import.meta.env.BASE_URL}models/robot.glb`;
const armModelUrl = `${import.meta.env.BASE_URL}models/robot_arm.glb`;
const sparkleTexture = createSparkleTexture();
const starState = {
  cycle: -1,
  gaze: new THREE.Vector2(),
};
const robotAction = {
  type: null,
  start: 0,
  duration: 0,
  nextAt: 8,
};
const actionSprites = createActionSprites();

loader.load(modelUrl, (gltf) => {
  robotScene = gltf.scene;
  normalizeModel(robotScene, 3.05);
  robotScene.traverse((object) => {
    if (object.isMesh) {
      object.castShadow = true;
      object.receiveShadow = true;
      if (isOriginalSquarePlatform(object)) {
        object.visible = false;
        return;
      }
      if (!isEyeSphere(object)) {
        clickableMeshes.push(object);
      }
      if (object.material) {
        object.material = createRobotMaterial(object);
      }
    }
  });

  head = robotScene.getObjectByName('Cabeza');
  body = robotScene.getObjectByName('Cuerpo');
  button = robotScene.getObjectByName('Button') || robotScene.getObjectByName('Botón');
  labelButton(button);
  eyeSpheres = findEyeSpheres(robotScene);
  replaceEyeSpheresWithDiscs(eyeSpheres);
  robotJumpRoot = createRobotJumpRoot(robotScene, [body, head]);

  robotRoot.add(robotScene);
  document.body.classList.remove('loading');
});

loader.load(armModelUrl, (gltf) => {
  armScene = gltf.scene;
  normalizeModelToGround(armScene, 1.82, -0.12);
  armScene.traverse((object) => {
    if (isArmAccessory(object)) {
      object.visible = false;
      return;
    }
    if (object.isMesh) {
      object.castShadow = true;
      object.receiveShadow = true;
      clickableMeshes.push(object);
      if (object.material) {
        object.material = createArmMaterial(object);
      }
    }
  });

  armJoints.base = getObjectByNames(armScene, ['Base Y Rotation', 'Base_Y_Rotation']);
  armJoints.lower = getObjectByNames(armScene, ['1 Hand X rotation', '1_Hand_X_rotation']);
  armJoints.mid = getObjectByNames(armScene, ['2 Hand X Rotation', '2_Hand_X_Rotation']);
  armJoints.tip = getObjectByNames(armScene, ['3 Hand X Rotate', '3_Hand_X_Rotate']);
  armJoints.grab = armScene.getObjectByName('Grab');
  armJoints.baseMesh = armScene.getObjectByName('Base');
  armJoints.leftFinger = armScene.getObjectByName('1');
  armJoints.rightFinger = armScene.getObjectByName('2');

  Object.values(armJoints).forEach((joint) => {
    if (joint) armOriginals.set(joint, joint.rotation.clone());
  });

  armRoot.add(armScene);
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

function createArmMaterial(object) {
  const material = object.material.clone();
  const lineage = getLineage(object).join(' ');
  material.roughness = 0.44;
  material.metalness = 0.38;

  if (/Target/i.test(lineage)) {
    material.color = new THREE.Color('#ffe071');
    material.emissive = new THREE.Color('#5a3a00');
    material.emissiveIntensity = 0.32;
    material.metalness = 0.08;
  } else if (/Base Y Rotation|Base_Y_Rotation|Base|Ellipse|Cylinder 2|Sphere Clones/i.test(lineage)) {
    material.color = new THREE.Color('#27313f');
    material.emissive = new THREE.Color('#070a14');
    material.emissiveIntensity = 0.08;
    material.metalness = 0.62;
    material.roughness = 0.32;
  } else if (/1 Hand X rotation|1_Hand_X_rotation|2 Hand X Rotation|2_Hand_X_Rotation|3 Hand X Rotate|3_Hand_X_Rotate|Grab|Star|Rectangle|Triangle/i.test(lineage)) {
    material.color = new THREE.Color('#45d4c4');
    material.emissive = new THREE.Color('#073534');
    material.emissiveIntensity = 0.14;
    material.metalness = 0.46;
    material.roughness = 0.36;
  } else if (/UI|Text|Shape/i.test(lineage)) {
    material.color = new THREE.Color('#d8f8ff');
    material.emissive = new THREE.Color('#12323a');
    material.emissiveIntensity = 0.18;
    material.metalness = 0.1;
  } else {
    material.color = new THREE.Color('#98a6ad');
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

function createActionSprites() {
  const heart = new THREE.Sprite(new THREE.SpriteMaterial({
    map: createHeartTexture(),
    transparent: true,
    opacity: 0,
    depthWrite: false,
  }));
  heart.position.set(0.18, 1.55, 1.08);
  heart.scale.set(0.36, 0.36, 0.36);
  heart.visible = false;
  actionRoot.add(heart);

  const bubble = new THREE.Sprite(new THREE.SpriteMaterial({
    map: createBubbleTexture(),
    transparent: true,
    opacity: 0,
    depthWrite: false,
  }));
  bubble.position.set(0.74, 1.22, 1.12);
  bubble.scale.set(1.1, 0.46, 1);
  bubble.visible = false;
  actionRoot.add(bubble);

  return { heart, bubble };
}

function createHeartTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext('2d');
  context.translate(128, 130);
  context.scale(1.05, 1.05);

  const gradient = context.createRadialGradient(-24, -28, 8, 0, 0, 120);
  gradient.addColorStop(0, '#fff7fb');
  gradient.addColorStop(0.28, '#ff7fb2');
  gradient.addColorStop(1, '#ff2b75');
  context.shadowColor = 'rgba(255, 77, 150, 0.65)';
  context.shadowBlur = 24;
  context.fillStyle = gradient;
  context.beginPath();
  context.moveTo(0, 78);
  context.bezierCurveTo(-74, 24, -84, -32, -44, -54);
  context.bezierCurveTo(-17, -69, 4, -52, 0, -28);
  context.bezierCurveTo(20, -60, 54, -67, 78, -42);
  context.bezierCurveTo(114, -4, 72, 46, 0, 78);
  context.closePath();
  context.fill();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createBubbleTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 768;
  canvas.height = 320;
  const context = canvas.getContext('2d');

  context.fillStyle = 'rgba(8, 12, 28, 0.76)';
  context.strokeStyle = 'rgba(142, 210, 255, 0.92)';
  context.lineWidth = 8;
  roundedRect(context, 34, 36, 700, 210, 40);
  context.fill();
  context.stroke();

  context.beginPath();
  context.moveTo(184, 248);
  context.lineTo(124, 312);
  context.lineTo(270, 250);
  context.closePath();
  context.fill();
  context.stroke();

  context.font = '800 56px Inter, Arial, sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillStyle = '#f8feff';
  context.shadowColor = 'rgba(79, 199, 255, 0.62)';
  context.shadowBlur = 18;
  context.fillText('Welcome to', canvas.width / 2, 116);
  context.font = '800 52px Inter, Arial, sans-serif';
  context.fillStyle = '#ffe79a';
  context.fillText('NEBULIS Lab', canvas.width / 2, 184);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 8);
  return texture;
}

function roundedRect(context, x, y, width, height, radius) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.lineTo(x + width - radius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + radius);
  context.lineTo(x + width, y + height - radius);
  context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  context.lineTo(x + radius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - radius);
  context.lineTo(x, y + radius);
  context.quadraticCurveTo(x, y, x + radius, y);
  context.closePath();
}

function createCircularPlatform() {
  const group = new THREE.Group();
  group.position.y = -0.22;

  const topMaterial = new THREE.MeshStandardMaterial({
    color: '#201c36',
    emissive: '#110d2b',
    emissiveIntensity: 0.18,
    roughness: 0.5,
    metalness: 0.22,
  });
  const edgeMaterial = new THREE.MeshStandardMaterial({
    color: '#3c3570',
    emissive: '#261b78',
    emissiveIntensity: 0.16,
    roughness: 0.38,
    metalness: 0.36,
  });

  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(2.28, 2.36, 0.14, 96),
    [edgeMaterial, topMaterial, edgeMaterial],
  );
  base.castShadow = true;
  base.receiveShadow = true;
  group.add(base);

  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(2.31, 0.035, 12, 128),
    edgeMaterial,
  );
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.082;
  rim.castShadow = true;
  group.add(rim);

  return group;
}

function labelButton(buttonObject) {
  if (!buttonObject) return;
  const originalText = buttonObject.getObjectByName('Text');
  if (originalText) {
    originalText.visible = false;
  }

  const texture = createButtonLabelTexture();
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
  });
  const label = new THREE.Mesh(new THREE.PlaneGeometry(47, 16.5), material);
  label.name = 'Nebulis_Button_Label';
  label.position.set(-0.15, -1.2, 0.85);
  label.renderOrder = 3;
  buttonObject.add(label);
}

function createButtonLabelTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 2048;
  canvas.height = 512;
  const context = canvas.getContext('2d');

  const gradient = context.createLinearGradient(0, 0, canvas.width, 0);
  gradient.addColorStop(0, '#e8fbff');
  gradient.addColorStop(0.45, '#79e6ff');
  gradient.addColorStop(1, '#fff1a6');

  context.clearRect(0, 0, canvas.width, canvas.height);
  context.font = '850 320px Inter, Arial, sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.shadowColor = 'rgba(0, 12, 35, 0.85)';
  context.shadowBlur = 18;
  context.lineWidth = 18;
  context.strokeStyle = 'rgba(7, 11, 28, 0.95)';
  context.strokeText('NEBULIS Lab', canvas.width / 2, canvas.height / 2 + 10);
  context.fillStyle = gradient;
  context.fillText('NEBULIS Lab', canvas.width / 2, canvas.height / 2 + 10);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 8);
  return texture;
}

function createFocusSparkles() {
  const starClusters = [
    {
      gaze: [-0.95, -0.2],
      stars: [
        { position: [-3.1, 0.82, -0.32], size: 0.58, delay: 0.05 },
        { position: [-3.42, 0.5, -0.22], size: 0.2, delay: 0.2 },
        { position: [-2.9, 1.18, -0.18], size: 0.14, delay: 0.34 },
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
      gaze: [0.96, -0.24],
      stars: [
        { position: [3.24, 0.68, -0.28], size: 0.56, delay: 0.02 },
        { position: [3.52, 1.02, -0.2], size: 0.19, delay: 0.18 },
        { position: [3.02, 0.34, -0.08], size: 0.15, delay: 0.32 },
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

function isOriginalSquarePlatform(object) {
  const parentName = object.parent?.name;
  return object.name === 'Plane' && (parentName === 'Scene 1' || parentName === 'Scene_1');
}

function isArmAccessory(object) {
  const lineage = getLineage(object).join(' ');
  return /UI|Target|Floor|Camera|Directional_Light|Default_Ambient_Light/i.test(lineage);
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

function createRobotJumpRoot(root, parts) {
  const sceneRoot = root.getObjectByName('Scene_1') || root.getObjectByName('Scene 1') || root;
  const jumpRoot = new THREE.Group();
  jumpRoot.name = 'Robot_Jump_Root';
  sceneRoot.add(jumpRoot);
  root.updateMatrixWorld(true);
  parts.forEach((part) => {
    if (part) jumpRoot.attach(part);
  });
  return jumpRoot;
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

function normalizeModelToGround(model, targetSize, groundY) {
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const scale = targetSize / Math.max(size.x, size.y, size.z);
  model.position.sub(center);
  model.scale.setScalar(scale);
  model.updateMatrixWorld(true);
  const scaledBox = new THREE.Box3().setFromObject(model);
  model.position.y += groundY - scaledBox.min.y;
}

function getObjectByNames(root, names) {
  for (const name of names) {
    const object = root.getObjectByName(name);
    if (object) return object;
  }
  return null;
}

function updateHover() {
  if (!robotScene) return;
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(clickableMeshes, true);
  hovered = hits.some((hit) => isEffectivelyVisible(hit.object));
  document.body.style.cursor = hovered ? 'pointer' : 'default';
}

function isEffectivelyVisible(object) {
  let current = object;
  while (current) {
    if (!current.visible) return false;
    current = current.parent;
  }
  return true;
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

function rotateToward(joint, axis, value, amount = 0.1) {
  if (!joint) return;
  const original = armOriginals.get(joint);
  const base = original ? original[axis] : 0;
  joint.rotation[axis] += (base + value - joint.rotation[axis]) * amount;
}

function updateArm(seconds) {
  if (!armScene) return;
  const sweep = Math.sin(seconds * 0.45);
  const reach = Math.sin(seconds * 0.62 + 0.8);
  const clamp = Math.sin(seconds * 1.35);

  rotateToward(armJoints.base, 'y', -0.34 + sweep * 0.72, 0.055);
  rotateToward(armJoints.lower, 'x', -0.48 + reach * 0.28, 0.075);
  rotateToward(armJoints.mid, 'x', 0.78 - reach * 0.2, 0.08);
  rotateToward(armJoints.tip, 'x', -0.34 + reach * 0.22, 0.085);

  if (armJoints.baseMesh) {
    rotateToward(armJoints.baseMesh, 'y', sweep * 0.18, 0.04);
  }
  if (armJoints.grab) {
    armJoints.grab.rotation.z += (sweep * 0.08 - armJoints.grab.rotation.z) * 0.08;
  }
  rotateToward(armJoints.leftFinger, 'z', 0.08 + clamp * 0.05, 0.12);
  rotateToward(armJoints.rightFinger, 'z', -0.08 - clamp * 0.05, 0.12);

  armRoot.rotation.y += ((0.22 + sweep * 0.06) - armRoot.rotation.y) * 0.04;
  tintObject(armScene, 0.08 + Math.max(0, clamp) * 0.08);
}

function updateRobotActions(seconds) {
  if (!robotScene) return 0;

  if (!robotAction.type && seconds >= robotAction.nextAt) {
    const actions = ['jump', 'heart', 'bubble'];
    robotAction.type = actions[Math.floor(Math.random() * actions.length)];
    robotAction.start = seconds;
    robotAction.duration = robotAction.type === 'jump' ? 1.5 : robotAction.type === 'heart' ? 4.0 : 5.0;
  }

  const elapsed = robotAction.type ? seconds - robotAction.start : 0;
  const progress = robotAction.type ? elapsed / robotAction.duration : 1;
  if (progress >= 1) {
    if (robotAction.type) {
      robotAction.type = null;
      robotAction.nextAt = seconds + THREE.MathUtils.randFloat(26, 34);
    }
    setSpriteOpacity(actionSprites.heart, 0);
    setSpriteOpacity(actionSprites.bubble, 0);
    return 0;
  }

  const envelope = Math.sin(progress * Math.PI);

  if (robotAction.type === 'jump') {
    setSpriteOpacity(actionSprites.heart, 0);
    setSpriteOpacity(actionSprites.bubble, 0);
    return envelope * 0.28;
  }

  if (robotAction.type === 'heart') {
    setSpriteOpacity(actionSprites.bubble, 0);
    setSpriteOpacity(actionSprites.heart, Math.min(1, envelope * 1.4));
    actionSprites.heart.position.y = 1.36 + envelope * 0.18;
    actionSprites.heart.scale.setScalar(0.32 + envelope * 0.16);
    return 0;
  }

  setSpriteOpacity(actionSprites.heart, 0);
  setSpriteOpacity(actionSprites.bubble, Math.min(1, envelope * 1.35));
  actionSprites.bubble.position.y = 1.22 + envelope * 0.05;
  actionSprites.bubble.scale.set(1.08 + envelope * 0.06, 0.45 + envelope * 0.03, 1);
  return 0;
}

function setSpriteOpacity(sprite, opacity) {
  sprite.visible = opacity > 0.01;
  sprite.material.opacity = opacity;
}

function animate(time) {
  const seconds = time * 0.001;
  pointer.lerp(pointerTarget, 0.1);
  updateHover();
  const focus = updateFocusStars(seconds);
  const jumpOffset = updateRobotActions(seconds);
  updateArm(seconds);

  if (robotRoot) {
    const focusX = focus.x;
    const focusY = focus.y;
    const idleX = focusX * 0.18 + Math.sin(seconds * 0.55) * 0.025;

    robotRoot.rotation.y += (idleX - robotRoot.rotation.y) * 0.045;
    robotRoot.position.y = Math.sin(seconds * 0.72) * 0.055 + (active ? Math.sin(seconds * 2.8) * 0.024 : 0);
    robotRoot.scale.setScalar(1 + (hovered ? 0.025 : 0) + (active ? 0.035 : 0));
    if (robotJumpRoot) {
      robotJumpRoot.position.y = jumpOffset;
    }
    actionRoot.position.y = jumpOffset;

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
