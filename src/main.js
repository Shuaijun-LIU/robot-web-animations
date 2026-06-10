import './styles.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const canvas = document.querySelector('#scene');
document.body.classList.add('loading');

const scene = new THREE.Scene();
scene.background = null;
scene.fog = new THREE.Fog('#101214', 8, 18);

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

const grid = new THREE.GridHelper(8.8, 44, '#4a545d', '#252b30');
grid.position.y = -1.035;
grid.material.transparent = true;
grid.material.opacity = 0.08;
scene.add(grid);

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
const starSourceUrl = `${import.meta.env.BASE_URL}models/star_source_ai.glb`;

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
  eyeSpheres.forEach((eye) => {
    eye.material = createEyeMaterial();
    eye.scale.multiplyScalar(1.08);
  });

  robotRoot.add(robotScene);
  document.body.classList.remove('loading');
});

loader.load(starSourceUrl, (gltf) => {
  const sourceStar = findSourceStar(gltf.scene);
  const geometry = sourceStar ? sourceStar.geometry.clone() : createFallbackStarGeometry();
  geometry.computeBoundingBox();
  geometry.center();

  const size = geometry.boundingBox.getSize(new THREE.Vector3());
  const scale = 0.26 / Math.max(size.x, size.y, size.z);
  geometry.scale(scale, scale, scale);

  const starClusters = [
    {
      gaze: [-0.78, 0.45],
      stars: [
        { position: [-1.55, 1.88, -0.1], size: 1.1, delay: 0 },
        { position: [-1.23, 2.15, -0.16], size: 0.42, delay: 0.16 },
        { position: [-1.78, 1.58, 0.02], size: 0.32, delay: 0.28 },
      ],
    },
    {
      gaze: [0.32, 0.78],
      stars: [
        { position: [0.38, 2.38, -0.32], size: 1.34, delay: 0.11 },
        { position: [0.1, 2.07, -0.25], size: 0.38, delay: 0.25 },
      ],
    },
    {
      gaze: [0.86, 0.18],
      stars: [
        { position: [1.62, 1.5, -0.02], size: 0.92, delay: 0.08 },
        { position: [1.93, 1.88, -0.12], size: 0.34, delay: 0.2 },
        { position: [1.35, 1.22, 0.1], size: 0.28, delay: 0.36 },
      ],
    },
    {
      gaze: [-0.18, 0.22],
      stars: [
        { position: [-0.28, 1.62, 0.16], size: 0.72, delay: 0.18 },
        { position: [-0.55, 1.84, 0.05], size: 0.24, delay: 0.3 },
      ],
    },
  ];

  focusStars = starClusters.flatMap((cluster, clusterIndex) =>
    cluster.stars.map((item) => {
      const material = createStarMaterial();
      const star = new THREE.Mesh(geometry, material);
      star.position.set(...item.position);
      star.rotation.set(0, 0, item.size > 1 ? -0.12 : 0.18);
      star.scale.setScalar(item.size);
      star.userData.gaze = new THREE.Vector2(...cluster.gaze);
      star.userData.basePosition = star.position.clone();
      star.userData.baseScale = item.size;
      star.userData.delay = item.delay;
      star.userData.cluster = clusterIndex;
      star.castShadow = false;
      starRoot.add(star);
      return star;
    }),
  );
});

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
    color: '#ece8df',
    emissive: '#000000',
    emissiveIntensity: 0,
    roughness: 0.88,
    metalness: 0,
  });
  material.userData.baseColor = material.color.clone();
  material.userData.baseEmissive = material.emissive.clone();
  return material;
}

function createStarMaterial() {
  return new THREE.MeshStandardMaterial({
    color: '#ffd76b',
    emissive: '#ffb21f',
    emissiveIntensity: 0.18,
    roughness: 0.36,
    metalness: 0.05,
    transparent: true,
    opacity: 0.62,
  });
}

function findSourceStar(root) {
  let result;
  root.traverse((object) => {
    if (!result && object.isMesh && /^Star/i.test(object.name)) {
      result = object;
    }
  });
  return result;
}

function createFallbackStarGeometry() {
  const shape = new THREE.Shape();
  const outer = 1;
  const inner = 0.45;
  for (let i = 0; i < 10; i += 1) {
    const radius = i % 2 === 0 ? outer : inner;
    const angle = (i / 10) * Math.PI * 2 - Math.PI / 2;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  return new THREE.ShapeGeometry(shape);
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

  const interval = 1.2;
  const clusterCount = Math.max(...focusStars.map((star) => star.userData.cluster)) + 1;
  const activeCluster = Math.floor(seconds / interval) % clusterCount;
  const activeStar = focusStars.find((star) => star.userData.cluster === activeCluster) || focusStars[0];

  focusStars.forEach((star, index) => {
    const activeAmount = star.userData.cluster === activeCluster ? 1 : 0;
    const shimmer = Math.max(0, Math.sin((seconds + star.userData.delay) * 7.2)) * 0.22;
    const targetOpacity = activeAmount ? 1 : 0.42 + shimmer;
    const targetGlow = activeAmount ? 1.55 + Math.sin(seconds * 10.5 + index) * 0.32 : 0.16 + shimmer * 0.6;
    const targetScale = star.userData.baseScale * (activeAmount ? 1.18 + Math.sin(seconds * 9 + index) * 0.05 : 1);

    star.material.opacity += (targetOpacity - star.material.opacity) * 0.16;
    star.material.emissiveIntensity += (targetGlow - star.material.emissiveIntensity) * 0.16;
    star.scale.lerp(new THREE.Vector3(targetScale, targetScale, targetScale), 0.16);
    star.position.y = star.userData.basePosition.y + Math.sin(seconds * 2.1 + index) * 0.025;
  });

  return activeStar.userData.gaze;
}

renderer.setAnimationLoop(animate);
