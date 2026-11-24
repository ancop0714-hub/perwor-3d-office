import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.mjs';
import { OrbitControls } from 'three/addons/controls/OrbitControls.mjs';
window.__perwor3dBooted = true;

const canvas = document.querySelector('#scene');
const loading = document.querySelector('#loading');
const loadingText = document.querySelector('#loadingText');
const statusEl = document.querySelector('#status');
const statusText = document.querySelector('#statusText');
const toastEl = document.querySelector('#toast');
const welcomePanel = document.querySelector('#welcomePanel');
const modePanel = document.querySelector('#modePanel');
const modeTitle = document.querySelector('#modeTitle');
const modeCopy = document.querySelector('#modeCopy');
const sceneTitle = document.querySelector('#sceneTitle');
const sceneCopy = document.querySelector('#sceneCopy');
const identityName = document.querySelector('#identityName');
const identityMeta = document.querySelector('#identityMeta');
const identityDot = document.querySelector('#identityDot');
window.addEventListener('error', event => {
  const message = event.error?.message || event.message || '알 수 없는 브라우저 오류';
  console.error('[Perwor 3D] window error', event.error || event.message);
  if (loadingText) loadingText.textContent = '초기화 오류: ' + message;
  if (statusEl) setStatus('3D 화면 초기화 오류', true);
});
window.addEventListener('unhandledrejection', event => {
  const message = event.reason?.message || String(event.reason || '비동기 초기화 오류');
  console.error('[Perwor 3D] unhandled rejection', event.reason);
  if (loadingText) loadingText.textContent = '초기화 오류: ' + message;
  if (statusEl) setStatus('3D 화면 초기화 오류', true);
});

const STORAGE_KEY = 'perwor-state-v3';
const saved = readState();
const userCharacter = saved?.character || { name: '', job: '마케터', gender: 'female' };
const roleToModel = {
  '마케터': 'marketer',
  '회사원·대리': 'associate',
  '대리': 'associate',
  '의사': 'doctor',
  '선생님': 'teacher',
  '디자이너': 'designer',
  '개발자': 'developer',
  '데이터 분석가': 'analyst',
  '연구원': 'analyst'
};
const jobLabel = userCharacter.job || '마케터';
const gender = userCharacter.gender === 'male' || userCharacter.gender === '남성' ? 'male' : 'female';
const userModelRole = roleToModel[jobLabel] || 'marketer';
const todayProgress = saved ? Math.round(((saved.speakingDone || 0) + (saved.typingDone || 0)) / Math.max(1, (saved.speakingGoal || 3) + (saved.typingGoal || 3)) * 100) : 0;

identityName.textContent = (saved?.rankName || '인턴') + (userCharacter.name ? ' ' + userCharacter.name + '님' : '님');
identityMeta.textContent = jobLabel + ' · ' + todayProgress + '% 오늘 성장';
identityDot.textContent = (userCharacter.name || 'P').slice(0, 1).toUpperCase();
document.title = 'Perwor 3D Office · ' + (userCharacter.name || '게스트');

const clock = new THREE.Clock();
const loader = new GLTFLoader();
const scene = new THREE.Scene();
scene.background = new THREE.Color('#e5f0ed');
scene.fog = new THREE.Fog('#e5f0ed', 20, 38);
const camera = new THREE.PerspectiveCamera(38, innerWidth / innerHeight, 0.1, 100);
camera.position.set(10, 9.5, 11.5);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 7;
controls.maxDistance = 23;
controls.maxPolarAngle = Math.PI * 0.46;
controls.target.set(0, 0, 0);

const hemi = new THREE.HemisphereLight('#fff9ef', '#91aca8', 2.2);
scene.add(hemi);
const keyLight = new THREE.DirectionalLight('#fff5df', 3.1);
keyLight.position.set(-6, 13, 8);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(2048, 2048);
keyLight.shadow.camera.left = -14;
keyLight.shadow.camera.right = 14;
keyLight.shadow.camera.top = 14;
keyLight.shadow.camera.bottom = -14;
scene.add(keyLight);
const fillLight = new THREE.DirectionalLight('#a8d9ff', 1.1);
fillLight.position.set(10, 7, -8);
scene.add(fillLight);

const interactables = [];
const obstacles = [];
const characters = [];
let userController = null;
let hoverObject = null;
let selectedObject = null;
let autoWalk = false;
let mode = 'office';
let cameraGoal = new THREE.Vector3(10, 9.5, 11.5);
let targetGoal = new THREE.Vector3(0, 0, 0);
let toastTimer = 0;

function readState() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); }
  catch { return null; }
}

function setStatus(message, error = false) {
  statusText.textContent = message;
  statusEl.classList.toggle('error', error);
}

function showToast(message) {
  toastEl.textContent = message;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2200);
}

function material(color, roughness = .78, metalness = 0) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}

function box(name, size, position, color, options = {}) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(size[0], size[1], size[2]), material(color, options.roughness || .78, options.metalness || 0));
  mesh.name = name;
  mesh.position.set(position[0], position[1], position[2]);
  if (options.rotation) mesh.rotation.set(options.rotation[0], options.rotation[1], options.rotation[2]);
  mesh.castShadow = options.castShadow !== false;
  mesh.receiveShadow = options.receiveShadow !== false;
  return mesh;
}

function cylinder(name, radius, height, position, color, segments = 24) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, segments), material(color));
  mesh.name = name;
  mesh.position.set(position[0], position[1], position[2]);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function markInteractive(object, id, label, action) {
  object.userData.interaction = { id, label, action };
  interactables.push(object);
  return object;
}

function addObstacle(x, z, halfX, halfZ) {
  obstacles.push({ x, z, halfX, halfZ });
}

function createFloor() {
  const floor = new THREE.Mesh(new THREE.BoxGeometry(20, .18, 13), material('#e8dfd2'));
  floor.name = 'WalkableFloor';
  floor.position.y = -.09;
  floor.receiveShadow = true;
  scene.add(floor);
  const centralRug = new THREE.Mesh(new THREE.PlaneGeometry(8.4, 9.8), new THREE.MeshStandardMaterial({ color: '#dbe9e7', roughness: 1 }));
  centralRug.rotation.x = -Math.PI / 2;
  centralRug.position.set(.5, .01, .5);
  centralRug.name = 'WalkableAisle';
  centralRug.receiveShadow = true;
  scene.add(centralRug);
  const entryRug = new THREE.Mesh(new THREE.PlaneGeometry(3.1, 1.4), new THREE.MeshStandardMaterial({ color: '#c9dcf4', roughness: 1 }));
  entryRug.rotation.x = -Math.PI / 2;
  entryRug.position.set(0, .015, 5.1);
  scene.add(entryRug);
}

function createOfficeShell() {
  createFloor();
  const backWall = box('BackWall', [20, 5.2, .18], [0, 2.6, -6.35], '#f7f2e9', { castShadow: false });
  scene.add(backWall);
  for (let i = -3; i <= 3; i++) {
    const window = box('Window-' + i, [2.35, 2.7, .05], [i * 2.7, 3.2, -6.23], i % 2 ? '#b9dff1' : '#c9e8f3', { castShadow: false, receiveShadow: false });
    scene.add(window);
    const frame = box('WindowFrame-' + i, [2.48, .12, .11], [i * 2.7, 1.83, -6.17], '#d3c6b6', { castShadow: false });
    scene.add(frame);
  }
  const ceilingBeam = box('CeilingBeam', [20, .12, .2], [0, 5.2, -3.6], '#d9e1e1', { castShadow: false });
  scene.add(ceilingBeam);
  const pendant = new THREE.Group();
  pendant.name = 'OfficeLight';
  pendant.add(cylinder('PendantStem', .025, .72, [0, 4.55, 0], '#8da1a2', 12));
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(.24, 20, 12), new THREE.MeshStandardMaterial({ color: '#ffe6a9', emissive: '#ffd781', emissiveIntensity: 1.3 }));
  lamp.position.set(0, 4.12, 0);
  pendant.add(lamp);
  scene.add(pendant);
}

function createDesk(id, x, z, color, isUser = false) {
  const group = new THREE.Group();
  group.name = id;
  group.position.set(x, 0, z);
  const top = box(id + '-Top', [2.65, .16, 1.2], [0, 1.02, 0], color);
  const legA = box(id + '-LegA', [.12, 1, .9], [-1.1, .5, 0], '#d4c0a7');
  const legB = box(id + '-LegB', [.12, 1, .9], [1.1, .5, 0], '#d4c0a7');
  const drawer = box(id + '-Drawer', [.48, .62, .65], [-.72, .53, .03], '#d9c8b4');
  group.add(top, legA, legB, drawer);
  const monitor = box(id + '-Monitor', [.95, .66, .13], [.23, 1.52, -.18], '#2f466d', { metalness: .15 });
  const screen = box(id + '-Screen', [.78, .48, .025], [.23, 1.53, -.25], '#b9dcf5', { castShadow: false, receiveShadow: false });
  const stand = box(id + '-MonitorStand', [.12, .3, .12], [.23, 1.13, -.12], '#657691');
  const keyboard = box(id + '-Keyboard', [.92, .08, .35], [.23, 1.13, .2], '#d8e4ee', { castShadow: false });
  const mouse = new THREE.Mesh(new THREE.SphereGeometry(.1, 16, 8), material('#536a8b'));
  mouse.scale.set(1, .35, 1);
  mouse.position.set(.83, 1.14, .2);
  const plant = createPlant(id + '-Plant', isUser ? 'sprout' : 'grown');
  plant.position.set(-.9, 1.15, -.2);
  group.add(monitor, screen, stand, keyboard, mouse, plant);
  markInteractive(monitor, id + '-monitor', '모니터', 'monitor');
  markInteractive(keyboard, id + '-keyboard', '키보드', 'typing');
  if (isUser) markInteractive(plant, id + '-plant', '화분', 'watering');
  addObstacle(x, z, 1.45, .72);
  const chair = createChair(id + '-Chair', x, z + .95, isUser ? '#6d89d8' : '#a9bac4');
  scene.add(group, chair);
  return { group, monitor, keyboard, plant, chair };
}

function createChair(name, x, z, color) {
  const chair = new THREE.Group();
  chair.name = name;
  chair.position.set(x, 0, z);
  chair.add(box(name + '-Seat', [.75, .12, .72], [0, .65, 0], color));
  chair.add(box(name + '-Back', [.75, 1.1, .12], [0, 1.14, -.3], color));
  chair.add(cylinder(name + '-Stem', .06, .55, [0, .32, 0], '#8f9fa6', 16));
  return chair;
}

function createPlant(name, stage) {
  const plant = new THREE.Group();
  plant.name = name;
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(.28, .35, .42, 20), material('#d6b28b'));
  pot.position.y = .21;
  pot.castShadow = true;
  plant.add(pot);
  const soil = new THREE.Mesh(new THREE.CylinderGeometry(.25, .25, .035, 20), material('#7d5e49'));
  soil.position.y = .43;
  plant.add(soil);
  const height = stage === 'sprout' ? .42 : stage === 'grown' ? .72 : 1;
  const stem = cylinder(name + '-Stem', .035, height, [0, .43 + height / 2, 0], '#4e9b70', 12);
  plant.add(stem);
  const leafA = new THREE.Mesh(new THREE.SphereGeometry(.17, 16, 10), material('#64ad7c'));
  leafA.scale.set(1.8, .55, .8);
  leafA.position.set(-.16, .62 + height * .65, 0);
  leafA.rotation.z = -.35;
  const leafB = leafA.clone();
  leafB.position.x = .16;
  leafB.rotation.z = .35;
  plant.add(leafA, leafB);
  plant.userData.stage = stage;
  return markInteractive(plant, name, '화분', 'watering');
}

function createSofa() {
  const sofa = new THREE.Group();
  sofa.name = 'RestArea';
  sofa.position.set(6.7, 0, -4.25);
  sofa.add(box('SofaSeat', [3.2, .42, 1.1], [0, .52, 0], '#839fc2'));
  sofa.add(box('SofaBack', [3.2, 1.25, .35], [0, 1.12, -.4], '#7894b8'));
  sofa.add(box('SofaArmL', [.35, .8, 1.15], [-1.43, .78, 0], '#7894b8'));
  sofa.add(box('SofaArmR', [.35, .8, 1.15], [1.43, .78, 0], '#7894b8'));
  scene.add(sofa);
  addObstacle(6.7, -4.25, 1.7, .75);
}

function createMeetingArea() {
  const table = new THREE.Group();
  table.name = 'MeetingArea';
  table.position.set(-4.2, 0, -3.5);
  table.add(new THREE.Mesh(new THREE.CylinderGeometry(1.35, 1.35, .14, 32), material('#f7efe2')));
  table.children[0].position.y = .82;
  table.add(cylinder('MeetingLeg', .12, .78, [0, .39, 0], '#d5bfa5', 20));
  scene.add(table);
  addObstacle(-4.2, -3.5, 1.6, 1.2);
}

function createReception() {
  const reception = new THREE.Group();
  reception.name = 'ReceptionDesk';
  reception.position.set(-7.2, 0, -4.25);
  reception.add(box('ReceptionFront', [3.2, 1.2, .55], [0, .62, 0], '#e2c49d'));
  reception.add(box('ReceptionTop', [3.35, .12, .8], [0, 1.27, 0], '#f7e5c9'));
  reception.add(new THREE.Mesh(new THREE.SphereGeometry(.18, 16, 10), material('#ffd889')));
  reception.children[2].position.set(-.9, 1.48, -.05);
  scene.add(reception);
  addObstacle(-7.2, -4.25, 1.8, .7);
}

function createOfficeObjects() {
  createOfficeShell();
  const userDesk = createDesk('UserDesk', 3.3, 1.5, '#d7b991', true);
  createDesk('TypingDesk', -1.6, -1.35, '#d8e7ec');
  createDesk('DeskSouth', 1.4, -1.35, '#d8e7ec');
  createMeetingArea();
  createReception();
  createSofa();
  const growthPlant = createPlant('GrowthPlant', 'grown');
  growthPlant.position.set(7.1, 0, 2.45);
  scene.add(growthPlant);
  markInteractive(growthPlant, 'growth-plant', '화분 성장 공간', 'watering');
  const entrance = new THREE.Mesh(new THREE.RingGeometry(.7, .86, 32), new THREE.MeshBasicMaterial({ color: '#76c9a9', transparent: true, opacity: .52, side: THREE.DoubleSide }));
  entrance.rotation.x = -Math.PI / 2;
  entrance.position.set(0, .025, 5.15);
  entrance.name = 'Entrance';
  scene.add(entrance);
  addObstacle(3.3, 1.5, 1.45, .72);
  return userDesk;
}

const characterPackUrl = new URL('../assets/3d/models/perwor-character-pack.glb', import.meta.url).href;
let characterPackPromise;
function loadCharacterPack() {
  if (!characterPackPromise) characterPackPromise = loader.loadAsync(characterPackUrl);
  return characterPackPromise;
}

async function loadCharacter(id, role, genderValue, position, staffRole, targetHeight = 1.72) {
  const root = new THREE.Group();
  root.name = id;
  root.position.set(position[0], 0, position[1]);
  root.userData.characterId = id;
  root.userData.role = staffRole;
  root.userData.animationState = 'idle';
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(.48, 32), new THREE.MeshBasicMaterial({ color: '#37516b', transparent: true, opacity: .16, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = .018;
  shadow.name = id + '-GroundShadow';
  root.add(shadow);
  try {
    loadingText.textContent = staffRole + ' 캐릭터를 불러오는 중…';
    const gltf = await loadCharacterPack();
    const templateName = role + '-' + genderValue;
    const template = gltf.scene.getObjectByName(templateName);
    if (!template) throw new Error('character variant not found: ' + templateName);
    const model = template.clone(true);
    model.position.set(0, 0, 0);
    model.rotation.set(0, 0, 0);
    model.name = id + '-Model';
    model.traverse(node => {
      if (node.isMesh) {
        node.castShadow = true;
        node.receiveShadow = true;
      }
    });
    let bounds = new THREE.Box3().setFromObject(model);
    const height = Math.max(bounds.max.y - bounds.min.y, .01);
    model.scale.setScalar(targetHeight / height);
    bounds = new THREE.Box3().setFromObject(model);
    model.position.y -= bounds.min.y;
    root.add(model);
    root.userData.model = model;
    root.userData.referenceAsset = characterPackUrl + '#' + templateName;
    root.userData.gltfAnimations = gltf.animations.length;
    scene.add(root);
    const controller = { id, root, model, staffRole, state: 'idle', base: root.position.clone(), target: root.position.clone(), phase: Math.random() * 6.28, speed: .95, queue: [] };
    characters.push(controller);
    return controller;
  } catch (error) {
    console.error('[Perwor 3D] character load failed', id, error);
    setStatus(staffRole + ' 모델을 불러오지 못했습니다. 에셋 경로를 확인해 주세요.', true);
    root.userData.loadError = true;
    scene.add(root);
    const controller = { id, root, model: null, staffRole, state: 'error', base: root.position.clone(), target: root.position.clone(), phase: 0, speed: .95, queue: [] };
    characters.push(controller);
    return controller;
  }
}

function moveToward(controller, target, delta) {
  const point = new THREE.Vector3(target.x, 0, target.z);
  const direction = point.clone().sub(controller.root.position);
  direction.y = 0;
  if (direction.length() < .08) {
    controller.root.position.x = point.x;
    controller.root.position.z = point.z;
    controller.state = 'idle';
    return true;
  }
  direction.normalize();
  const step = controller.speed * delta;
  controller.root.position.addScaledVector(direction, Math.min(step, direction.length()));
  controller.root.rotation.y = Math.atan2(direction.x, direction.z);
  controller.state = 'walk';
  return false;
}

function isBlocked(x, z, radius = .35) {
  if (x < -9.2 || x > 9.2 || z < -5.5 || z > 5.5) return true;
  return obstacles.some(o => Math.abs(x - o.x) < o.halfX + radius && Math.abs(z - o.z) < o.halfZ + radius);
}

function setMode(nextMode) {
  mode = nextMode;
  selectedObject = null;
  if (nextMode === 'office') {
    modePanel.hidden = true;
    welcomePanel.hidden = false;
    sceneTitle.textContent = '내 자리로 출근해요';
    sceneCopy.textContent = 'WASD 또는 방향키로 이동하고, 모니터를 선택하면 업무 도구가 열립니다.';
    cameraGoal.set(10, 9.5, 11.5);
    targetGoal.set(0, 0, 0);
  } else if (nextMode === 'work-start') {
    modePanel.hidden = false;
    welcomePanel.hidden = false;
    modeTitle.textContent = '업무를 시작할까요?';
    modeCopy.textContent = '모니터 주변의 업무 도구를 선택해 오늘의 학습을 시작하세요.';
    sceneTitle.textContent = '내 자리에서 업무를 시작해요';
    sceneCopy.textContent = '키보드·마이크·화분을 선택하면 해당 업무 공간으로 이동합니다.';
    cameraGoal.set(8, 6.6, 8.6);
    targetGoal.set(2.4, .7, 1.5);
  } else if (nextMode === 'typing') {
    modePanel.hidden = false;
    welcomePanel.hidden = true;
    modeTitle.textContent = '타이핑 업무 공간';
    modeCopy.textContent = '1인칭 타이핑 화면으로 전환할 준비가 됐어요.';
    cameraGoal.set(4.4, 3.1, 4.9);
    targetGoal.set(3.3, 1.2, 1.4);
    showToast('키보드 선택 · 타이핑 화면 준비');
  } else if (nextMode === 'speaking') {
    modePanel.hidden = false;
    welcomePanel.hidden = true;
    modeTitle.textContent = '말하기 업무 공간';
    modeCopy.textContent = '화상회의 상대와 영어로 대화하는 화면으로 전환합니다.';
    cameraGoal.set(-1.8, 3.7, 5.5);
    targetGoal.set(-1.5, 1.1, -1.8);
    showToast('마이크 선택 · 말하기 화면 준비');
  } else if (nextMode === 'watering') {
    modePanel.hidden = false;
    welcomePanel.hidden = true;
    modeTitle.textContent = '화분 성장 공간';
    modeCopy.textContent = '학습을 완료하면 이 화분에 물을 주고 성장 포인트를 반영합니다.';
    cameraGoal.set(8.5, 4.2, 6.8);
    targetGoal.set(7.1, .8, 2.45);
    showToast('화분 선택 · 성장 연출 준비');
  }
  updatePlantMood(nextMode);
}

function updatePlantMood(nextMode) {
  const growth = scene.getObjectByName('GrowthPlant');
  if (!growth) return;
  const scale = nextMode === 'watering' ? 1.06 : 1;
  growth.scale.set(scale, scale, scale);
}

function handleInteraction(interaction) {
  if (!interaction) return;
  if (interaction.action === 'monitor') {
    setMode('work-start');
    showToast('모니터를 선택했어요. 업무 도구가 열렸습니다.');
  } else if (interaction.action === 'typing') {
    setMode('typing');
  } else if (interaction.action === 'watering') {
    setMode('watering');
  }
}

function findInteraction(object) {
  let current = object;
  while (current) {
    if (current.userData && current.userData.interaction) return current.userData.interaction;
    current = current.parent;
  }
  return null;
}

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
function pointerFromEvent(event) {
  const rect = canvas.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
}
function pick(event, activate = false) {
  pointerFromEvent(event);
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(interactables, true);
  const hit = hits[0];
  const interaction = hit ? findInteraction(hit.object) : null;
  const picked = hit ? hit.object : null;
  if (hoverObject && hoverObject.material && hoverObject.material.emissive) hoverObject.material.emissive.set('#000000');
  hoverObject = picked;
  if (hoverObject && hoverObject.material && hoverObject.material.emissive) hoverObject.material.emissive.set('#193b66');
  canvas.style.cursor = interaction ? 'pointer' : 'default';
  if (activate) handleInteraction(interaction);
}
canvas.addEventListener('pointermove', event => pick(event, false));
canvas.addEventListener('pointerdown', event => pick(event, true));

const keys = new Set();
window.addEventListener('keydown', event => {
  if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','w','a','s','d','W','A','S','D'].includes(event.key)) {
    event.preventDefault();
    keys.add(event.key.toLowerCase());
    if (userController) { autoWalk = false; userController.state = 'walk'; setStatus('직접 이동 중 · 바닥 동선 안에서 이동합니다.'); }
  }
  if (event.key === 'Escape') setMode('office');
});
window.addEventListener('keyup', event => keys.delete(event.key.toLowerCase()));

function updateUser(delta) {
  if (!userController || !userController.root) return;
  if (autoWalk && userController.queue.length) {
    const next = userController.queue[0];
    if (moveToward(userController, next, delta)) {
      userController.queue.shift();
      if (!userController.queue.length) {
        autoWalk = false;
        userController.state = 'idle';
        setStatus('본인 자리 도착 · 모니터를 선택해 업무를 시작하세요.');
        showToast('자리 도착');
      }
    }
    return;
  }
  const direction = new THREE.Vector3();
  if (keys.has('arrowup') || keys.has('w')) direction.z -= 1;
  if (keys.has('arrowdown') || keys.has('s')) direction.z += 1;
  if (keys.has('arrowleft') || keys.has('a')) direction.x -= 1;
  if (keys.has('arrowright') || keys.has('d')) direction.x += 1;
  if (!direction.length()) {
    if (userController.state === 'walk') userController.state = 'idle';
    return;
  }
  direction.normalize();
  const nextX = userController.root.position.x + direction.x * delta * 2.6;
  const nextZ = userController.root.position.z + direction.z * delta * 2.6;
  if (!isBlocked(nextX, userController.root.position.z)) userController.root.position.x = nextX;
  if (!isBlocked(userController.root.position.x, nextZ)) userController.root.position.z = nextZ;
  userController.root.rotation.y = Math.atan2(direction.x, direction.z);
  userController.state = 'walk';
}

function animateCharacters(time) {
  characters.forEach(character => {
    if (!character.model) return;
    const t = time + character.phase;
    if (character === userController) {
      if (character.state === 'walk') character.model.rotation.z = Math.sin(t * 8) * .025;
      else character.model.rotation.z = Math.sin(t * 1.5) * .008;
      return;
    }
    if (character.staffRole === '타이핑 업무 직원') {
      character.state = 'typing';
      character.model.rotation.z = Math.sin(t * 5) * .018;
    } else if (character.staffRole === '회의 진행 직원') {
      character.state = 'speaking';
      character.model.rotation.y = Math.sin(t * 1.2) * .05;
    } else if (character.staffRole === '회의 참여 직원') {
      character.state = 'listening';
      character.model.rotation.z = Math.sin(t * 1.15) * .018;
    } else if (character.staffRole === '안내 데스크 직원') {
      character.state = 'idle';
      character.model.rotation.y = Math.sin(t * 1.2) * .045;
    } else if (character.staffRole === '복도 직원') {
      character.state = 'walk';
      character.root.position.x = character.base.x + Math.sin(t * .35) * 1.5;
      character.root.rotation.y = Math.cos(t * .35) > 0 ? Math.PI / 2 : -Math.PI / 2;
    } else if (character.staffRole === '소파 휴식 직원') {
      character.state = 'resting';
      character.model.rotation.z = Math.sin(t * .75) * .02;
    } else if (character.staffRole === '화분 관리 직원') {
      character.state = 'watering';
      character.model.rotation.z = Math.sin(t * 2.4) * .035;
    }
  });
  const growth = scene.getObjectByName('GrowthPlant');
  if (growth && mode === 'watering') {
    const pulse = 1 + Math.sin(time * 3.2) * .035;
    growth.scale.set(pulse, pulse, pulse);
  }
}

function startAutoWalk() {
  if (!userController) return;
  userController.queue = [
    new THREE.Vector3(0, 0, 3.7),
    new THREE.Vector3(1.1, 0, 2.7),
    new THREE.Vector3(2.3, 0, 2.1),
    new THREE.Vector3(3.3, 0, 1.5)
  ];
  autoWalk = true;
  userController.state = 'walk';
  setStatus('출근 중 · 본인 자리로 이동하고 있습니다.');
  showToast('자동 출근 시작');
}

document.querySelector('#resetView').addEventListener('click', () => setMode('office'));
document.querySelector('#toggleWalk').addEventListener('click', () => startAutoWalk());
document.querySelector('#typingAction').addEventListener('click', () => setMode('typing'));
document.querySelector('#speakingAction').addEventListener('click', () => setMode('speaking'));
document.querySelector('#wateringAction').addEventListener('click', () => setMode('watering'));

function resize() {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
  renderer.setSize(innerWidth, innerHeight);
}
window.addEventListener('resize', resize);

async function boot() {
  try {
    const userDesk = createOfficeObjects();
    const user = await loadCharacter('UserCharacter', userModelRole, gender, [0, 5.1], '사용자 캐릭터', 1.95);
    userController = user;
    user.target = new THREE.Vector3(3.3, 0, 1.5);
    await Promise.all([
      loadCharacter('StaffTyping', 'developer', 'male', [-1.6, -1.35], '타이핑 업무 직원', 1.62),
      loadCharacter('StaffMeetingLead', 'analyst', 'female', [-4.8, -3.5], '회의 진행 직원', 1.7),
      loadCharacter('StaffMeetingParticipant', 'associate', 'male', [-3.5, -3.5], '회의 참여 직원', 1.7),
      loadCharacter('StaffReception', 'teacher', 'female', [-7.2, -4.05], '안내 데스크 직원', 1.68),
      loadCharacter('StaffWalking', 'designer', 'male', [0, 3.3], '복도 직원', 1.72),
      loadCharacter('StaffResting', 'marketer', 'female', [6.7, -4.0], '소파 휴식 직원', 1.64),
      loadCharacter('StaffWatering', 'doctor', 'female', [7.1, 2.1], '화분 관리 직원', 1.68)
    ]);
    loading.hidden = true;
    setStatus('오피스 준비 완료 · 캐릭터의 발 기준선과 그림자를 적용했습니다.');
    setMode('office');
    renderer.setAnimationLoop(render);
  } catch (error) {
    console.error('[Perwor 3D] boot failed', error);
    loadingText.textContent = '3D 공간을 초기화하지 못했습니다. 콘솔 오류를 확인해 주세요.';
    setStatus('3D 오피스 초기화 실패', true);
  }
}

function render() {
  const delta = Math.min(clock.getDelta(), .05);
  const elapsed = clock.elapsedTime;
  updateUser(delta);
  animateCharacters(elapsed);
  camera.position.lerp(cameraGoal, 1 - Math.exp(-delta * 4.2));
  controls.target.lerp(targetGoal, 1 - Math.exp(-delta * 4.2));
  controls.update();
  renderer.render(scene, camera);
}

boot();
