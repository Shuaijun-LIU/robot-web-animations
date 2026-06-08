import './styles.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const canvas = document.querySelector('#scene');
document.body.classList.add('loading');

const scene = new THREE.Scene();
scene.background = new THREE.Color('#101214');
scene.fog = new THREE.Fog('#101214', 7, 14);

const camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0.15, 1.35, 6.2);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;

const controls = new OrbitControls(camera, renderer.domElement);
controls.enablePan = false;
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 3.8;
controls.maxDistance = 8;
controls.maxPolarAngle = Math.PI * 0.68;
controls.target.set(0, 0.65, 0);

const key = new THREE.SpotLight('#ffffff', 18, 12, 0.52, 0.55, 1.1);
key.position.set(2.8, 4.4, 4.5);
key.castShadow = true;
key.shadow.mapSize.set(1024, 1024);
scene.add(key);

const fill = new THREE.SpotLight('#b7e8ff', 5, 10, 0.7, 0.65, 1.5);
fill.position.set(-3.5, 2.5, 3.2);
scene.add(fill);

scene.add(new THREE.HemisphereLight('#dfefff', '#22201c', 1.5));

const floor = new THREE.Mesh(
  new THREE.CircleGeometry(3.8, 96),
  new THREE.MeshStandardMaterial({
    color: '#191c1d',
    roughness: 0.72,
    metalness: 0.12,
  }),
);
floor.rotation.x = -Math.PI / 2;
floor.position.y = -1.05;
floor.receiveShadow = true;
scene.add(floor);

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

loader.load('/models/robot.glb', (gltf) => {
  robotScene = gltf.scene;
  normalizeModel(robotScene, 3.05);
  robotScene.traverse((object) => {
    if (object.isMesh) {
      object.castShadow = true;
      object.receiveShadow = true;
      clickableMeshes.push(object);
      if (object.material) {
        object.material = object.material.clone();
        object.material.roughness = Math.min(object.material.roughness ?? 0.55, 0.62);
      }
    }
  });

  head = robotScene.getObjectByName('Cabeza');
  eyes = robotScene.getObjectByName('Ojos');
  button = robotScene.getObjectByName('Button') || robotScene.getObjectByName('Botón');

  robotRoot.add(robotScene);
  document.body.classList.remove('loading');
});

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
    if (!material.userData.baseEmissive && material.emissive) {
      material.userData.baseEmissive = material.emissive.clone();
    }
    if (material.emissive) {
      material.emissive.copy(material.userData.baseEmissive).lerp(new THREE.Color('#51d78b'), amount);
      material.emissiveIntensity = amount * 0.75;
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
