import './styles.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const canvas = document.querySelector('#scene');
document.body.classList.add('loading');

const scene = new THREE.Scene();
scene.background = new THREE.Color('#0c1012');
scene.fog = new THREE.Fog('#0c1012', 8, 17);

const camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0.15, 1.35, 6.2);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.92;

const controls = new OrbitControls(camera, renderer.domElement);
controls.enablePan = false;
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 3.8;
controls.maxDistance = 8;
controls.maxPolarAngle = Math.PI * 0.68;
controls.target.set(0, 0.65, 0);

const key = new THREE.SpotLight('#fff3df', 8.5, 14, 0.55, 0.55, 1.2);
key.position.set(2.6, 4.8, 4.2);
key.castShadow = true;
key.shadow.mapSize.set(1024, 1024);
scene.add(key);

const fill = new THREE.SpotLight('#8cd7ff', 2.6, 12, 0.7, 0.72, 1.5);
fill.position.set(-4.2, 2.7, 3.6);
scene.add(fill);

const rim = new THREE.DirectionalLight('#56d39a', 1.5);
rim.position.set(-3.8, 2.2, -4.4);
scene.add(rim);

scene.add(new THREE.HemisphereLight('#dbeeff', '#151716', 0.95));

const floor = new THREE.Mesh(
  new THREE.CircleGeometry(3.8, 96),
  new THREE.MeshStandardMaterial({
    color: '#13191a',
    roughness: 0.72,
    metalness: 0.12,
  }),
);
floor.rotation.x = -Math.PI / 2;
floor.position.y = -1.05;
floor.receiveShadow = true;
scene.add(floor);

const grid = new THREE.GridHelper(7.2, 36, '#2dd08b', '#253134');
grid.position.y = -1.035;
grid.material.transparent = true;
grid.material.opacity = 0.28;
scene.add(grid);

const backPanel = new THREE.Mesh(
  new THREE.PlaneGeometry(7.5, 4.6),
  new THREE.MeshStandardMaterial({
    color: '#101719',
    roughness: 0.9,
    metalness: 0.05,
    transparent: true,
    opacity: 0.72,
  }),
);
backPanel.position.set(0, 1.3, -2.25);
backPanel.receiveShadow = true;
scene.add(backPanel);

const loader = new GLTFLoader();
const robotRoot = new THREE.Group();
scene.add(robotRoot);

const pointer = new THREE.Vector2();
const pointerTarget = new THREE.Vector2();
const raycaster = new THREE.Raycaster();
const clickableMeshes = [];
let robotScene;
let head;
let eyes;
let button;
let hovered = false;
let active = false;
let lastPointerAt = performance.now();

const modelUrl = `${import.meta.env.BASE_URL}models/robot.glb`;

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
  eyes = robotScene.getObjectByName('Ojos');
  button = robotScene.getObjectByName('Button') || robotScene.getObjectByName('Botón');

  robotRoot.add(robotScene);
  document.body.classList.remove('loading');
});

function createRobotMaterial(object) {
  const material = object.material.clone();
  const lineage = getLineage(object).join(' ');
  material.roughness = 0.48;
  material.metalness = 0.18;

  if (/Ojos|Sphere 2|Sphere 3|Boolean 2/i.test(lineage)) {
    material.color = new THREE.Color('#6fffd0');
    material.emissive = new THREE.Color('#1ae9ac');
    material.emissiveIntensity = 0.55;
    material.roughness = 0.22;
    material.metalness = 0.05;
  } else if (/Cabeza|Boolean|Ears|Cylinder/i.test(lineage)) {
    material.color = new THREE.Color('#f0f4e8');
    material.roughness = 0.38;
  } else if (/Cuerpo|Cube/i.test(lineage)) {
    material.color = new THREE.Color('#47c78f');
    material.roughness = 0.46;
    material.metalness = 0.22;
  } else if (/Button|Botón|Text/i.test(lineage)) {
    material.color = new THREE.Color('#ffcc5c');
    material.emissive = new THREE.Color('#4d3200');
    material.emissiveIntensity = 0.25;
    material.roughness = 0.35;
  } else {
    material.color = new THREE.Color('#aeb8b1');
  }

  material.userData.baseColor = material.color.clone();
  material.userData.baseEmissive = material.emissive ? material.emissive.clone() : new THREE.Color('#000000');
  return material;
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
      material.emissive.copy(material.userData.baseEmissive).lerp(new THREE.Color('#51d78b'), amount);
      material.emissiveIntensity = (material.userData.baseEmissive.getHex() !== 0 ? 0.35 : 0) + amount * 0.7;
    }
  });
}

function animate(time) {
  const seconds = time * 0.001;
  pointer.lerp(pointerTarget, 0.1);
  updateHover();

  if (robotRoot) {
    const idle = performance.now() - lastPointerAt > 2200;
    const idleX = idle ? Math.sin(seconds * 0.55) * 0.18 : pointer.x * 0.34;
    const idleY = idle ? Math.sin(seconds * 0.72) * 0.08 : pointer.y * 0.18;

    robotRoot.rotation.y += (idleX - robotRoot.rotation.y) * 0.045;
    robotRoot.position.y = Math.sin(seconds * 1.35) * 0.035 + (active ? Math.sin(seconds * 5.2) * 0.018 : 0);
    robotRoot.scale.setScalar(1 + (hovered ? 0.025 : 0) + (active ? 0.035 : 0));

    if (head) {
      head.rotation.y += (pointer.x * 0.46 - head.rotation.y) * 0.11;
      head.rotation.x += (-pointer.y * 0.22 - head.rotation.x) * 0.11;
      head.rotation.z = Math.sin(seconds * 1.4) * (active ? 0.045 : 0.018);
    }

    if (eyes) {
      eyes.rotation.y += (pointer.x * 0.32 - eyes.rotation.y) * 0.14;
      eyes.rotation.x += (-pointer.y * 0.2 - eyes.rotation.x) * 0.14;
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

renderer.setAnimationLoop(animate);
