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
const loader = new THREE.GLTFLoader();
const scene = new THREE.Scene();
scene.background = new THREE.Color('#e5f0ed');
// The final Meshy asset already contains the office's colors, materials, and
// lighting cues. Fog and filmic tone mapping washed those embedded textures
// out, so keep the scene clear and let the GLB materials remain authoritative.
scene.fog = null;
const camera = new THREE.PerspectiveCamera(38, innerWidth / innerHeight, 0.2, 120);
const DEFAULT_CAMERA_POSITION = new THREE.Vector3(14, 16, 18);
const DEFAULT_CAMERA_TARGET = new THREE.Vector3(0, 0, 0);
const cameraOffset = DEFAULT_CAMERA_POSITION.clone().sub(DEFAULT_CAMERA_TARGET);
camera.position.copy(DEFAULT_CAMERA_POSITION);
camera.lookAt(DEFAULT_CAMERA_TARGET);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
// The Meshy office contains baked ambient shading. Disabling a second dynamic
// shadow pass prevents floor shadow-acne/moire while the user character keeps
// its own soft ground shadow mesh.
renderer.shadowMap.enabled = false;
renderer.toneMapping = THREE.NoToneMapping;
renderer.toneMappingExposure = 1;

const controls = new THREE.OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.enablePan = false;
controls.minDistance = 7;
controls.maxDistance = 36;
controls.minPolarAngle = 0.14;
controls.maxPolarAngle = Math.PI * 0.46;
controls.target.copy(DEFAULT_CAMERA_TARGET);

const hemi = new THREE.HemisphereLight('#fff9ef', '#b8ced0', 0.82);
scene.add(hemi);
const softAmbient = new THREE.AmbientLight('#fff9f2', 0.06);
scene.add(softAmbient);
const keyLight = new THREE.DirectionalLight('#fff5df', 0.9);
keyLight.position.set(-6, 13, 8);
scene.add(keyLight);
const fillLight = new THREE.DirectionalLight('#a8d9ff', 0.25);
fillLight.position.set(10, 7, -8);
scene.add(fillLight);

const maxTextureAnisotropy = 16;

function refineMeshyMaterials(model) {
  const anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), maxTextureAnisotropy);
  const textureSlots = ['map', 'emissiveMap', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'alphaMap'];
  model.traverse(node => {
    if (!node.isMesh) return;
    // The GLB's baked appearance is authoritative; avoid a second shadow
    // layer that caused the floor shimmer during camera movement.
    node.castShadow = false;
    node.receiveShadow = false;
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    materials.filter(Boolean).forEach(material => {
      // Keep the authored material response, only preventing an unusually
      // glossy surface from becoming harsh. The previous .72 floor made the
      // whole office look dusty and low-quality rather than clean and soft.
      material.roughness = Math.min(1, Math.max(material.roughness ?? .82, .64));
      material.metalness = Math.min(material.metalness ?? 0, .08);
      material.flatShading = false;
      textureSlots.forEach(slot => {
        const texture = material[slot];
        if (!texture) return;
        texture.anisotropy = anisotropy;
        texture.magFilter = THREE.LinearFilter;
        texture.minFilter = THREE.LinearMipmapLinearFilter;
        texture.generateMipmaps = true;
        if (slot === 'map' || slot === 'emissiveMap') texture.colorSpace = THREE.SRGBColorSpace;
        texture.needsUpdate = true;
      });
      material.needsUpdate = true;
    });
  });
}

const interactables = [];
const obstacles = [];
const characters = [];
let userController = null;
let hoverObject = null;
let selectedObject = null;
let autoWalk = false;
let mode = 'office';
let cameraGoal = new THREE.Vector3(14, 16, 18);
let targetGoal = new THREE.Vector3(0, 0, 0);
let toastTimer = 0;

const OFFICE_STATES = Object.freeze({
  OFFICE_IDLE: 'OFFICE_IDLE',
  OFFICE_MANUAL_MOVEMENT: 'OFFICE_MANUAL_MOVEMENT',
  OFFICE_AUTO_NAVIGATION: 'OFFICE_AUTO_NAVIGATION',
  WORKSTATION_ARRIVAL: 'WORKSTATION_ARRIVAL',
  CHARACTER_SEATING: 'CHARACTER_SEATING',
  FIRST_PERSON_TRANSITION: 'FIRST_PERSON_TRANSITION',
  WORKSTATION_HUB: 'WORKSTATION_HUB',
  TYPING_LEARNING: 'TYPING_LEARNING',
  SPEAKING_LEARNING: 'SPEAKING_LEARNING',
  RETURN_TO_OFFICE: 'RETURN_TO_OFFICE',
});

let officeState = OFFICE_STATES.OFFICE_IDLE;
let cameraFollowEnabled = false;
let transitionActive = false;
let transitionDispatched = false;
let transitionWorkstation = null;
let selectedWorkstation = null;
let navigationPurpose = null;
let autoPatrol = false;
let patrolIndex = 0;
let returnFromLearning = false;
let hoverMarker = null;
let personalWorkstationHighlight = null;
let personalHighlightState = 'hidden';
let personalWorkstationLabel = null;
let personalWorkstationHint = null;
let personalWorkstationHover = false;
let pointerDown = null;
let pointerDragged = false;
let lastPointerWasDrag = false;
const NAV_DEBUG = new URLSearchParams(window.location.search).get('navDebug') === '1';

const WORKSTATIONS = Object.freeze({
  'UserDesk-monitor': Object.freeze({
    id: 'personal-workstation-01',
    monitorInteractionId: 'UserDesk-monitor',
    monitorPosition: new THREE.Vector3(3.3, 1.45, 1.05),
    approachPosition: new THREE.Vector3(3.3, 0, 3.1),
    chairPosition: new THREE.Vector3(3.3, 0, 2.46),
    standingPosition: new THREE.Vector3(3.3, 0, 3.1),
    seatingRotation: Math.PI,
    firstPersonPosition: new THREE.Vector3(3.3, 2.95, 4.55),
    firstPersonTarget: new THREE.Vector3(3.3, 1.22, 1.18),
  }),
});
const ENTRY_POSITION = Object.freeze({ x: -5.5, z: 4.8 });

function setOfficeState(next, detail = {}) {
  officeState = next;
  window.__perwor3dOfficeState = { state: next, ...detail };
  document.body.dataset.perworOfficeState = next;
}

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

function setupDailyTaskPanel() {
  if (!welcomePanel) return;
  welcomePanel.classList.add('daily-panel');
  const eyebrow = welcomePanel.querySelector('.eyebrow');
  if (eyebrow) eyebrow.textContent = 'TODAY';
  sceneTitle.textContent = '오늘 업무 리스트';
  sceneCopy.textContent = '자신의 자리로 가서 업무를 시작하세요!';
  const notice = welcomePanel.querySelector('.notice');
  if (notice) notice.remove();
  const walkButton = document.querySelector('#toggleWalk');
  if (walkButton) walkButton.textContent = '오피스 둘러보기';

  let taskList = welcomePanel.querySelector('.daily-task-list');
  if (!taskList) {
    taskList = document.createElement('div');
    taskList.className = 'daily-task-list';
    taskList.innerHTML = `
      <div class="daily-task-row" id="typingTaskRow">
        <span class="daily-task-mark" id="typingTaskMark">·</span>
        <span>타이핑 학습</span>
        <span class="daily-task-state" id="typingTaskState">기록 없음</span>
      </div>
      <div class="daily-task-row" id="speakingTaskRow">
        <span class="daily-task-mark" id="speakingTaskMark">·</span>
        <span>말하기 학습</span>
        <span class="daily-task-state" id="speakingTaskState">기록 없음</span>
      </div>`;
    const actions = welcomePanel.querySelector('.panel-actions');
    welcomePanel.insertBefore(taskList, actions || null);
  }

  if (!personalWorkstationLabel) {
    personalWorkstationLabel = document.createElement('div');
    personalWorkstationLabel.id = 'personalWorkstationLabel';
    personalWorkstationLabel.className = 'personal-workstation-label';
    personalWorkstationLabel.textContent = '내 자리';
    document.querySelector('#app')?.appendChild(personalWorkstationLabel);
  }
  if (!personalWorkstationHint) {
    personalWorkstationHint = document.createElement('div');
    personalWorkstationHint.id = 'personalWorkstationHint';
    personalWorkstationHint.className = 'personal-workstation-hint';
    personalWorkstationHint.textContent = '클릭하여 업무 시작';
    document.querySelector('#app')?.appendChild(personalWorkstationHint);
  }

  if (!document.querySelector('#perwor-personal-ux-style')) {
    const style = document.createElement('style');
    style.id = 'perwor-personal-ux-style';
    style.textContent = `
      .daily-panel { width: min(280px, calc(100vw - 40px)); padding: 14px; border-radius: 18px; }
      .daily-panel .eyebrow { margin-bottom: 5px; font-size: 9px; }
      .daily-panel h1 { font-size: 19px; }
      .daily-panel p { margin-top: 6px; font-size: 12px; line-height: 1.4; }
      .daily-panel .panel-actions { gap: 6px; margin-top: 12px; }
      .daily-panel .panel-actions .action { padding: 8px 10px; font-size: 11px; }
      .daily-task-list { display: grid; gap: 6px; margin-top: 12px; padding-top: 10px; border-top: 1px solid rgba(35,59,91,.12); }
      .daily-task-row { display: grid; grid-template-columns: 20px 1fr auto; align-items: center; gap: 6px; padding: 7px 8px; border-radius: 10px; background: #f7fafc; color: #233b5b; font-size: 12px; }
      .daily-task-row.is-complete { background: #ecf8f1; color: #276e59; }
      .daily-task-mark { color: #9aabb8; font-size: 16px; line-height: 1; }
      .daily-task-row.is-complete .daily-task-mark { color: #3da980; }
      .daily-task-state { color: #7d8d9c; font-size: 10px; }
      .daily-task-row.is-complete .daily-task-state { color: #3da980; }
      #personalWorkstationLabel, #personalWorkstationHint { position: absolute; z-index: 5; display: none; transform: translate(-50%, -50%); white-space: nowrap; pointer-events: none; user-select: none; }
      .personal-workstation-label { padding: 5px 9px; border: 1px solid rgba(246,223,152,.88); border-radius: 999px; background: rgba(255,247,220,.96); box-shadow: 0 6px 16px rgba(35,59,91,.16); color: #876c2e; font-size: 11px; font-weight: 900; letter-spacing: -.02em; }
      .personal-workstation-hint { padding: 6px 9px; border-radius: 999px; background: rgba(24,42,70,.92); box-shadow: 0 6px 16px rgba(35,59,91,.18); color: #fff; font-size: 10px; font-weight: 800; }
      @media (max-width: 680px) { .daily-panel { top: 70px; left: 10px; width: min(280px, calc(100vw - 20px)); } }
      @media (prefers-reduced-motion: reduce) { .personal-workstation-label, .personal-workstation-hint { transition: none !important; } }
    `;
    document.head.appendChild(style);
  }
  updateDailyTaskPanel();
}

function updateDailyTaskPanel() {
  const state = readState();
  const tasks = [
    { key: 'typing', done: Boolean(state && (Object.prototype.hasOwnProperty.call(state, 'typingDone') || Object.prototype.hasOwnProperty.call(state, 'typingGoal'))) && Number(state?.typingDone || 0) >= Math.max(1, Number(state?.typingGoal || 3)) },
    { key: 'speaking', done: Boolean(state && (Object.prototype.hasOwnProperty.call(state, 'speakingDone') || Object.prototype.hasOwnProperty.call(state, 'speakingGoal'))) && Number(state?.speakingDone || 0) >= Math.max(1, Number(state?.speakingGoal || 3)) },
  ];
  tasks.forEach(task => {
    const row = document.querySelector(`#${task.key}TaskRow`);
    const mark = document.querySelector(`#${task.key}TaskMark`);
    const status = document.querySelector(`#${task.key}TaskState`);
    if (!row || !mark || !status) return;
    const hasTaskProgress = Boolean(state && (
      Object.prototype.hasOwnProperty.call(state, `${task.key}Done`) ||
      Object.prototype.hasOwnProperty.call(state, `${task.key}Goal`)
    ));
    row.classList.toggle('is-complete', task.done);
    mark.textContent = hasTaskProgress ? (task.done ? '✓' : '□') : '·';
    status.textContent = hasTaskProgress ? (task.done ? '완료' : '미완료') : '기록 없음';
  });
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

function createMicrophone(name, position) {
  const microphone = new THREE.Group();
  microphone.name = name;
  microphone.position.set(position[0], position[1], position[2]);
  microphone.add(cylinder(name + '-Base', .16, .07, [0, .035, 0], '#526c91', 20));
  microphone.add(cylinder(name + '-Stem', .035, .28, [0, .19, 0], '#6d829e', 14));
  const head = new THREE.Mesh(new THREE.SphereGeometry(.13, 18, 12), material('#6d9bc2', .56, .12));
  head.scale.set(.86, 1.2, .86);
  head.position.set(0, .39, 0);
  head.castShadow = true;
  microphone.add(head);
  const grille = new THREE.Mesh(new THREE.TorusGeometry(.075, .012, 8, 18), material('#d6eaf2', .5, .05));
  grille.rotation.x = Math.PI / 2;
  grille.position.set(0, .39, -.105);
  microphone.add(grille);
  return markInteractive(microphone, name, '마이크', 'speaking');
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
  const microphone = isUser ? createMicrophone(id + '-Microphone', [.88, 1.14, -.08]) : null;
  group.add(monitor, screen, stand, keyboard, mouse, plant);
  if (microphone) group.add(microphone);
  markInteractive(monitor, id + '-monitor', '모니터', 'monitor');
  markInteractive(keyboard, id + '-keyboard', '키보드', 'typing');
  if (isUser) markInteractive(plant, id + '-plant', '화분', 'watering');
  addObstacle(x, z, 1.45, .72);
  const chair = createChair(id + '-Chair', x, z + .95, isUser ? '#6d89d8' : '#a9bac4');
  scene.add(group, chair);
  return { group, monitor, keyboard, microphone, plant, chair };
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

/*
 * The Meshy GLB is the only visible office environment. The old procedural
 * office builders above are intentionally kept as historical code and are no
 * longer called, so no Blender-colored duplicate geometry can be rendered.
 * These tiny invisible hit targets preserve the existing interaction flow
 * without placing substitute desks, plants, or furniture over the GLB.
 */
function interactionProxy(name, size, position, id, label, action) {
  const proxy = new THREE.Mesh(
    new THREE.BoxGeometry(size[0], size[1], size[2]),
    new THREE.MeshBasicMaterial({ color: action === 'monitor' ? '#78c7b0' : '#6b89e8', transparent: true, opacity: NAV_DEBUG ? .24 : 0, depthWrite: false })
  );
  proxy.name = name;
  proxy.position.set(position[0], position[1], position[2]);
  proxy.userData.isInteractionProxy = true;
  markInteractive(proxy, id, label, action);
  scene.add(proxy);
  return proxy;
}

function createPersonalMonitorHighlight(position) {
  const group = new THREE.Group();
  group.name = 'PersonalWorkstationHighlight';

  const glowCanvas = document.createElement('canvas');
  glowCanvas.width = 96;
  glowCanvas.height = 72;
  const glowContext = glowCanvas.getContext('2d');
  const glowGradient = glowContext.createRadialGradient(48, 36, 4, 48, 36, 52);
  glowGradient.addColorStop(0, 'rgba(255, 241, 196, .72)');
  glowGradient.addColorStop(.48, 'rgba(246, 223, 152, .24)');
  glowGradient.addColorStop(1, 'rgba(246, 223, 152, 0)');
  glowContext.fillStyle = glowGradient;
  glowContext.fillRect(0, 0, glowCanvas.width, glowCanvas.height);
  const glowTexture = new THREE.CanvasTexture(glowCanvas);
  glowTexture.colorSpace = THREE.SRGBColorSpace;
  const glowMaterial = new THREE.SpriteMaterial({
    map: glowTexture,
    color: '#F6DF98',
    transparent: true,
    opacity: 0,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
  });
  const glow = new THREE.Sprite(glowMaterial);
  glow.name = 'PersonalWorkstationSoftGlow';
  glow.position.z = .32;
  glow.scale.set(2.25, 1.62, 1);
  glow.renderOrder = 3;
  group.add(glow);

  const outerMaterial = new THREE.LineBasicMaterial({
    color: '#FFF1C4',
    transparent: true,
    opacity: 0,
    depthWrite: false,
    depthTest: false,
  });
  const innerMaterial = new THREE.LineBasicMaterial({
    color: '#F6DF98',
    transparent: true,
    opacity: 0,
    depthWrite: false,
    depthTest: false,
  });
  const outer = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1.52, 1.25, .56)), outerMaterial);
  const inner = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1.43, 1.16, .50)), innerMaterial);
  outer.name = 'PersonalWorkstationGlowOuter';
  inner.name = 'PersonalWorkstationGlowInner';
  outer.renderOrder = 4;
  inner.renderOrder = 5;
  group.add(outer, inner);
  group.position.copy(position);
  group.visible = false;
  scene.add(group);
  return {
    group,
    glowMaterial,
    outerMaterial,
    innerMaterial,
    baseOuter: .30,
    baseInner: .16,
  };
}

function setPersonalHighlightState(nextState) {
  personalHighlightState = nextState;
  if (!personalWorkstationHighlight) return;
  const intensity = {
    hidden: { glow: 0, outer: 0, inner: 0 },
    normal: { glow: .055, outer: .34, inner: .20 },
    hover: { glow: .18, outer: .90, inner: .54 },
    navigation: { glow: .025, outer: .18, inner: .09 },
  }[nextState] || { glow: 0, outer: 0, inner: 0 };
  personalWorkstationHighlight.glowMaterial.opacity = intensity.glow || 0;
  personalWorkstationHighlight.outerMaterial.opacity = intensity.outer;
  personalWorkstationHighlight.innerMaterial.opacity = intensity.inner;
  personalWorkstationHighlight.group.visible = nextState !== 'hidden' && mode === 'office';
  if (personalWorkstationHint) {
    personalWorkstationHint.style.display = nextState === 'hover' ? 'block' : 'none';
  }
}

function createInteractionMarker(position) {
  const marker = new THREE.Mesh(
    new THREE.RingGeometry(.22, .29, 28),
    new THREE.MeshBasicMaterial({ color: '#6bcab1', transparent: true, opacity: .72, depthWrite: false, side: THREE.DoubleSide })
  );
  marker.name = 'WorkstationSelectionMarker';
  marker.rotation.x = -Math.PI / 2;
  marker.position.set(position.x, .025, position.z);
  marker.visible = NAV_DEBUG;
  marker.renderOrder = 2;
  scene.add(marker);
  return marker;
}

function createOfficeObjects() {
  obstacles.length = 0;
  // These normalized world positions are interaction-only anchors. The GLB is
  // the visible source of truth; no procedural replacement geometry is added.
  const userDesk = new THREE.Group();
  userDesk.name = 'UserDeskInteractionAnchor';
  userDesk.position.set(3.3, 0, 1.5);
  userDesk.monitor = interactionProxy('UserDesk-Monitor-HitTarget', [1.35, 1.1, .45], [3.3, 1.45, 1.05], 'UserDesk-monitor', '모니터', 'monitor');
  userDesk.monitor.userData.workstationId = 'personal-workstation-01';
  userDesk.monitor.userData.hoverMarker = createInteractionMarker(WORKSTATIONS['UserDesk-monitor'].standingPosition);
  personalWorkstationHighlight = createPersonalMonitorHighlight(WORKSTATIONS['UserDesk-monitor'].monitorPosition);
  userDesk.keyboard = interactionProxy('UserDesk-Keyboard-HitTarget', [1.25, .28, .7], [3.3, 1.0, 1.7], 'UserDesk-keyboard', '키보드', 'typing');
  userDesk.microphone = interactionProxy('UserDesk-Microphone-HitTarget', [.6, .85, .6], [4.2, 1.1, 1.2], 'UserDesk-microphone', '마이크', 'speaking');
  userDesk.plant = interactionProxy('UserDesk-Plant-HitTarget', [.7, .7, .7], [2.55, 1.1, 1.2], 'UserDesk-plant', '화분', 'watering');
  const growthPlant = new THREE.Group();
  growthPlant.name = 'GrowthPlant';
  growthPlant.userData.stage = 'grown';
  growthPlant.add(interactionProxy('GrowthPlant-HitTarget', [1.1, 1.1, 1.1], [7.1, 1.0, 2.45], 'growth-plant', '화분 성장 공간', 'watering'));
  scene.add(growthPlant);
  // Keep movement bounds aligned to the scaled Meshy office footprint.
  addObstacle(3.3, 1.5, 1.0, .65);
  // Conservative collision volumes for the visible Meshy office furniture.
  // They keep the avatar on the walkable aisles without hiding the GLB.
  addObstacle(-4.2, -0.75, 1.75, .78);
  addObstacle(-.4, -0.75, 1.75, .78);
  addObstacle(-.4, 2.35, 1.55, .72);
  addObstacle(5.9, 1.0, 1.35, 1.15);
  addObstacle(6.4, -3.15, 1.55, 1.0);
  return userDesk;
}

const meshyOfficeUrl = '../assets/3d/office/meshy-textured/Meshy_AI_Pastel_Garden_Office_1117142039_texture.glb';
let officeEnvironment = null;
let officeEnvironmentPromise = null;

async function loadMeshyOfficeEnvironment() {
  if (!officeEnvironmentPromise) {
    officeEnvironmentPromise = loader.loadAsync(meshyOfficeUrl).then(gltf => {
      const model = gltf.scene;
      model.name = 'MeshyPastelGardenOffice';
      refineMeshyMaterials(model);
      let bounds = new THREE.Box3().setFromObject(model);
      const size = bounds.getSize(new THREE.Vector3());
      const horizontalSpan = Math.max(size.x, size.z, .01);
      const targetSpan = 18.6;
      model.scale.setScalar(targetSpan / horizontalSpan);
      bounds = new THREE.Box3().setFromObject(model);
      const center = bounds.getCenter(new THREE.Vector3());
      model.position.x -= center.x;
      model.position.z -= center.z;
      model.position.y -= bounds.min.y;
      scene.add(model);
      officeEnvironment = model;
      window.__perworMeshyOffice = {
        source: meshyOfficeUrl,
        dimensions: { x: size.x, y: size.y, z: size.z },
        scale: model.scale.x,
        visible: true,
      };
      return model;
    });
  }
  return officeEnvironmentPromise;
}

const characterPackUrl = '../assets/3d/models/perwor-character-pack.glb';
const riggedCharacterUrl = '../assets/3d/models/rigged/meshy-office-doll-mixamo.glb';
// Use the Mixamo-rigged Meshy doll for grounded locomotion. Its Walking and
// Running clips drive the visible limbs while the root controller handles
// office navigation and collision-aware movement.
const SHOW_PLACEHOLDER_STAFF = false;
let riggedCharacterPromise;
function loadRiggedCharacterPack() {
  if (!riggedCharacterPromise) riggedCharacterPromise = loader.loadAsync(riggedCharacterUrl);
  return riggedCharacterPromise;
}

const animationAliases = {
  idle: ['Idle', 'idle'],
  walk: ['Walk', 'Walking', 'Run', 'Running'],
  sit: ['Sit', 'Sitting', 'Seated', 'SitIdle'],
  celebrate: ['Celebrate', 'Wave', 'ThumbUp', 'TPose'],
  listening: ['Idle', 'Survey'],
  nod: ['Yes', 'Nod', 'Survey'],
  resting: ['Idle', 'Survey'],
  speaking: ['Speaking', 'Talking', 'Survey'],
  typing: ['Typing', 'Working'],
  watering: ['Watering', 'Working']
};

function findAnimationClip(clips, aliases) {
  const normalized = aliases.map(name => name.toLowerCase());
  return clips.find(clip => normalized.includes(clip.name.toLowerCase())) || null;
}

function createFallbackClip(state) {
  const duration = state === 'typing' ? .72 : state === 'nod' ? .9 : state === 'speaking' ? 1.1 : state === 'watering' ? 1.2 : state === 'sit' ? 1 : .9;
  const tracks = [];
  if (state === 'typing') {
    tracks.push(new THREE.NumberKeyframeTrack('.rotation[z]', [0, duration * .5, duration], [0, .035, -.025]));
    tracks.push(new THREE.NumberKeyframeTrack('.position[y]', [0, duration * .5, duration], [0, .008, 0]));
  } else if (state === 'nod' || state === 'listening') {
    tracks.push(new THREE.NumberKeyframeTrack('.rotation[x]', [0, duration * .45, duration], [0, .06, 0]));
  } else if (state === 'speaking') {
    tracks.push(new THREE.NumberKeyframeTrack('.rotation[y]', [0, duration * .5, duration], [0, .04, -.035]));
  } else if (state === 'watering') {
    tracks.push(new THREE.NumberKeyframeTrack('.rotation[z]', [0, duration * .5, duration], [0, -.055, .04]));
  } else if (state === 'celebrate') {
    tracks.push(new THREE.NumberKeyframeTrack('.rotation[z]', [0, duration * .35, duration * .7, duration], [0, -.07, .07, 0]));
    tracks.push(new THREE.NumberKeyframeTrack('.position[y]', [0, duration * .35, duration * .7, duration], [0, .08, 0, 0]));
  } else if (state === 'sit') {
    // The source GLB has no seated clip. This neutral fallback keeps the
    // mixer alive while the non-destructive seat pose is applied to bones.
    tracks.push(new THREE.NumberKeyframeTrack('.rotation[y]', [0, duration * .5, duration], [0, .01, 0]));
  } else {
    tracks.push(new THREE.NumberKeyframeTrack('.rotation[y]', [0, duration * .5, duration], [0, .018, 0]));
  }
  return new THREE.AnimationClip('Perwor-' + state, duration, tracks);
}

function setupCharacterAnimations(controller, gltf) {
  const clips = gltf.animations || [];
  const mixer = new THREE.AnimationMixer(controller.model);
  const actions = {};
  const fallbackStates = [];
  Object.keys(animationAliases).forEach(state => {
    const sourceClip = findAnimationClip(clips, animationAliases[state]);
    const clip = sourceClip || createFallbackClip(state);
    if (!sourceClip) fallbackStates.push(state);
    actions[state] = mixer.clipAction(clip);
    actions[state].setLoop(THREE.LoopRepeat, Infinity);
  });
  controller.mixer = mixer;
  controller.actions = actions;
  controller.animationSource = clips.length ? 'gltf-plus-fallback-clips' : 'fallback-clips';
  controller.availableClips = clips.map(clip => clip.name);
  controller.fallbackStates = fallbackStates;
  controller.bones = {};
  ['Hips', 'Spine', 'Spine1', 'LeftUpLeg', 'RightUpLeg', 'LeftLeg', 'RightLeg', 'Head', 'Neck', 'LeftArm', 'RightArm', 'LeftForeArm', 'RightForeArm', 'LeftHand', 'RightHand'].forEach(name => {
    const bone = controller.model.getObjectByName('mixamorig:' + name) || controller.model.getObjectByName(name);
    if (bone) controller.bones[name] = bone;
  });
  setCharacterAnimation(controller, 'idle', true);
  mixer.update(.16);
  controller.baseBoneRotations = {};
  Object.keys(controller.bones).forEach(name => {
    controller.baseBoneRotations[name] = controller.bones[name].rotation.clone();
  });
}

function setCharacterAnimation(controller, state, immediate = false) {
  if (!controller || !controller.actions) return;
  if (controller.state === state && controller.activeAction) return;
  const next = controller.actions[state] || controller.actions.idle;
  if (!next) return;
  const isOverlay = state !== 'idle' && controller.fallbackStates?.includes(state);
  if (isOverlay) {
    const baseAction = controller.actions.idle;
    if (controller.activeAction && controller.activeAction !== baseAction) controller.activeAction.fadeOut(immediate ? 0 : .16);
    if (controller.overlayAction && controller.overlayAction !== next) controller.overlayAction.fadeOut(immediate ? 0 : .16);
    baseAction.reset().fadeIn(immediate ? 0 : .16).play();
    next.reset().fadeIn(immediate ? 0 : .16).play();
    controller.overlayAction = next;
    controller.activeAction = baseAction;
    controller.state = state;
    controller.root.userData.animationState = state;
    return;
  }
  const previous = controller.activeAction;
  if (previous && previous !== next) previous.fadeOut(immediate ? 0 : .16);
  if (controller.overlayAction) {
    controller.overlayAction.fadeOut(immediate ? 0 : .16);
    controller.overlayAction = null;
  }
  next.reset().fadeIn(immediate ? 0 : .16).play();
  controller.activeAction = next;
  controller.state = state;
  controller.root.userData.animationState = state;
}

function animateRiggedPose(controller, time) {
  if (!controller.bones) return;
  const customStates = new Set(['typing', 'nod', 'speaking', 'watering', 'celebrate']);
  if (!customStates.has(controller.state)) return;
  const bones = controller.bones;
  const base = controller.baseBoneRotations;
  Object.keys(base).forEach(name => bones[name].rotation.copy(base[name]));
  const phase = time + controller.phase;
  if (controller.state === 'typing') {
    const beat = Math.sin(phase * 10);
    if (bones.LeftArm) bones.LeftArm.rotation.x = base.LeftArm.x - .22;
    if (bones.RightArm) bones.RightArm.rotation.x = base.RightArm.x - .22;
    if (bones.LeftForeArm) bones.LeftForeArm.rotation.x = base.LeftForeArm.x - .36 + beat * .045;
    if (bones.RightForeArm) bones.RightForeArm.rotation.x = base.RightForeArm.x - .36 - beat * .045;
    if (bones.LeftHand) bones.LeftHand.rotation.z = base.LeftHand.z + .04;
    if (bones.RightHand) bones.RightHand.rotation.z = base.RightHand.z - .04;
  } else if (controller.state === 'nod') {
    const nod = Math.sin(phase * 5.5) * .075;
    if (bones.Neck) bones.Neck.rotation.x = base.Neck.x + nod * .55;
    if (bones.Head) bones.Head.rotation.x = base.Head.x + nod;
  } else if (controller.state === 'speaking') {
    const talk = Math.sin(phase * 4.5);
    if (bones.Head) bones.Head.rotation.y = base.Head.y + talk * .055;
    if (bones.RightArm) bones.RightArm.rotation.z = base.RightArm.z - .14 + Math.max(0, talk) * .08;
    if (bones.RightForeArm) bones.RightForeArm.rotation.z = base.RightForeArm.z - .12 + talk * .06;
  } else if (controller.state === 'watering') {
    const pour = Math.sin(phase * 3.2);
    if (bones.LeftArm) bones.LeftArm.rotation.x = base.LeftArm.x - .3;
    if (bones.RightArm) bones.RightArm.rotation.x = base.RightArm.x - .3;
    if (bones.LeftForeArm) bones.LeftForeArm.rotation.z = base.LeftForeArm.z + .18 + pour * .05;
    if (bones.RightForeArm) bones.RightForeArm.rotation.z = base.RightForeArm.z - .18 - pour * .05;
  } else if (controller.state === 'celebrate') {
    const cheer = Math.sin(phase * 5) * .08;
    if (bones.LeftArm) bones.LeftArm.rotation.z = base.LeftArm.z + .65 + cheer;
    if (bones.RightArm) bones.RightArm.rotation.z = base.RightArm.z - .65 - cheer;
  }
}

function applySeatedPose(controller, amount = 1) {
  if (!controller?.bones || !controller.baseBoneRotations) return;
  const bones = controller.bones;
  const base = controller.baseBoneRotations;
  const value = Math.max(0, Math.min(1, amount));
  // A conservative, non-destructive pose prototype. It uses the existing
  // humanoid rig only; the original GLB and its Idle/Walk clips are untouched.
  if (bones.Hips) bones.Hips.rotation.x = base.Hips.x + value * .16;
  if (bones.Spine) bones.Spine.rotation.x = base.Spine.x - value * .10;
  if (bones.Spine1) bones.Spine1.rotation.x = base.Spine1.x - value * .08;
  if (bones.LeftUpLeg) bones.LeftUpLeg.rotation.x = base.LeftUpLeg.x + value * .58;
  if (bones.RightUpLeg) bones.RightUpLeg.rotation.x = base.RightUpLeg.x + value * .58;
  if (bones.LeftLeg) bones.LeftLeg.rotation.x = base.LeftLeg.x - value * .72;
  if (bones.RightLeg) bones.RightLeg.rotation.x = base.RightLeg.x - value * .72;
}

async function loadCharacter(id, role, genderValue, position, staffRole, targetHeight = 1.72) {
  const root = new THREE.Group();
  root.name = id;
  root.position.set(position[0], 0, position[1]);
  root.userData.characterId = id;
  root.userData.role = staffRole;
  root.userData.animationState = 'idle';
  root.userData.groundAnchorY = 0;
  root.userData.shadowPosition = { x: position[0], y: .018, z: position[1] };
  root.userData.collisionRadius = .36;
  root.userData.positionSpace = 'office-world';
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(.48, 32), new THREE.MeshBasicMaterial({ color: '#37516b', transparent: true, opacity: .16, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = .018;
  shadow.name = id + '-GroundShadow';
  root.add(shadow);
  try {
    loadingText.textContent = staffRole + ' 리깅 캐릭터와 모션을 불러오는 중…';
    const gltf = await loadRiggedCharacterPack();
    if (!THREE.SkeletonUtils) throw new Error('SkeletonUtils가 로드되지 않았습니다.');
    const model = THREE.SkeletonUtils.clone(gltf.scene);
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
    root.userData.referenceAsset = riggedCharacterUrl;
    root.userData.legacyVariant = role + '-' + genderValue;
    root.userData.gltfAnimations = gltf.animations.length;
    scene.add(root);
    const controller = {
      id,
      root,
      model,
      staffRole,
      state: 'idle',
      base: root.position.clone(),
      target: root.position.clone(),
      phase: Math.random() * 6.28,
      speed: .95,
      queue: [],
      collisionRadius: .36,
      groundAnchorY: 0,
      shadowPosition: root.position.clone(),
      interactionTarget: null,
      seating: null,
      seated: false,
      modelBasePosition: model.position.clone(),
    };
    root.userData.controller = controller;
    setupCharacterAnimations(controller, gltf);
    characters.push(controller);
    return controller;
  } catch (error) {
    console.error('[Perwor 3D] character load failed', id, error);
    setStatus(staffRole + ' 모델을 불러오지 못했습니다. 에셋 경로를 확인해 주세요.', true);
    root.userData.loadError = true;
    scene.add(root);
    const controller = { id, root, model: null, staffRole, state: 'error', base: root.position.clone(), target: root.position.clone(), phase: 0, speed: .95, queue: [], collisionRadius: .36, groundAnchorY: 0, shadowPosition: root.position.clone(), seating: null, seated: false };
    root.userData.controller = controller;
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
  const distance = Math.min(step, direction.length());
  const nextX = controller.root.position.x + direction.x * distance;
  const nextZ = controller.root.position.z + direction.z * distance;
  // Resolve each axis separately so the avatar slides around desks instead
  // of tunnelling through them when a frame is long or the route is diagonal.
  if (!isBlocked(nextX, controller.root.position.z, controller.collisionRadius)) controller.root.position.x = nextX;
  if (!isBlocked(controller.root.position.x, nextZ, controller.collisionRadius)) controller.root.position.z = nextZ;
  controller.root.rotation.y = Math.atan2(direction.x, direction.z);
  controller.state = 'walk';
  return false;
}

function isBlocked(x, z, radius = .35) {
  if (x < -9.2 || x > 9.2 || z < -9.2 || z > 9.2) return true;
  return obstacles.some(o => Math.abs(x - o.x) < o.halfX + radius && Math.abs(z - o.z) < o.halfZ + radius);
}

function resetOfficeCamera() {
  controls.enabled = true;
  controls.enableRotate = true;
  controls.enableZoom = true;
  cameraFollowEnabled = false;
  transitionActive = false;
  transitionDispatched = false;
  cameraGoal.copy(DEFAULT_CAMERA_POSITION);
  targetGoal.copy(DEFAULT_CAMERA_TARGET);
  camera.position.copy(DEFAULT_CAMERA_POSITION);
  controls.target.copy(DEFAULT_CAMERA_TARGET);
  controls.update();
}

function frameUserAtEntrance(controller) {
  if (!controller?.root) return;
  controller.root.rotation.y = Math.PI;
  const position = controller.root.position;
  camera.position.set(position.x, 3.2, position.z + 5.8);
  controls.target.set(position.x, 1.05, position.z - 2.4);
  camera.lookAt(controls.target);
  cameraFollowEnabled = true;
  controls.update();
}

function frameUserFrontOnReturn(controller) {
  if (!controller?.root) return;
  controller.root.rotation.y = 0;
  const position = controller.root.position;
  camera.position.set(position.x, 2.9, position.z + 5.4);
  controls.target.set(position.x, 1.0, position.z);
  camera.lookAt(controls.target);
  cameraFollowEnabled = true;
  controls.update();
}

function setMode(nextMode) {
  mode = nextMode;
  selectedObject = null;
  setPersonalHighlightState(nextMode === 'office' ? 'normal' : 'hidden');
  if (nextMode === 'office') {
    autoWalk = false;
    autoPatrol = false;
    patrolIndex = 0;
    navigationPurpose = null;
    if (userController) {
      userController.queue = [];
      userController.seating = null;
      userController.seated = false;
      applySeatedPose(userController, 0);
      setCharacterAnimation(userController, 'idle');
    }
    resetOfficeCamera();
    setOfficeState(OFFICE_STATES.OFFICE_IDLE);
    modePanel.hidden = true;
    welcomePanel.hidden = false;
    sceneTitle.textContent = '오늘 업무 리스트';
    sceneCopy.textContent = '자신의 자리로 가서 업무를 시작하세요!';
    updateDailyTaskPanel();
  } else if (nextMode === 'work-start') {
    controls.enabled = false;
    modePanel.hidden = false;
    welcomePanel.hidden = false;
    modeTitle.textContent = '업무를 시작할까요?';
    modeCopy.textContent = '모니터 주변의 업무 도구를 선택해 오늘의 학습을 시작하세요.';
    sceneTitle.textContent = '내 자리에서 업무를 시작해요';
    sceneCopy.textContent = '키보드·마이크·화분을 선택하면 해당 업무 공간으로 이동합니다.';
    cameraGoal.set(8, 6.6, 8.6);
    targetGoal.set(2.4, .7, 1.5);
    setOfficeState(OFFICE_STATES.WORKSTATION_HUB);
  } else if (nextMode === 'typing') {
    controls.enabled = false;
    modePanel.hidden = false;
    welcomePanel.hidden = true;
    modeTitle.textContent = '타이핑 업무 공간';
    modeCopy.textContent = '1인칭 타이핑 화면으로 전환할 준비가 됐어요.';
    cameraGoal.set(4.4, 3.1, 4.9);
    targetGoal.set(3.3, 1.2, 1.4);
    setOfficeState(OFFICE_STATES.TYPING_LEARNING);
    showToast('키보드 선택 · 타이핑 화면 준비');
  } else if (nextMode === 'speaking') {
    controls.enabled = false;
    modePanel.hidden = false;
    welcomePanel.hidden = true;
    modeTitle.textContent = '말하기 업무 공간';
    modeCopy.textContent = '화상회의 상대와 영어로 대화하는 화면으로 전환합니다.';
    cameraGoal.set(8.4, 3.8, 5.4);
    targetGoal.set(3.3, 1.1, 1.5);
    setOfficeState(OFFICE_STATES.SPEAKING_LEARNING);
    showToast('마이크 선택 · 말하기 화면 준비');
  } else if (nextMode === 'watering') {
    controls.enabled = false;
    modePanel.hidden = false;
    welcomePanel.hidden = true;
    modeTitle.textContent = '화분 성장 공간';
    modeCopy.textContent = '학습을 완료하면 이 화분에 물을 주고 성장 포인트를 반영합니다.';
    cameraGoal.set(8.5, 4.2, 6.8);
    targetGoal.set(7.1, .8, 2.45);
    setOfficeState(OFFICE_STATES.WORKSTATION_HUB);
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

function lerpAngle(from, to, amount) {
  let delta = (to - from + Math.PI) % (Math.PI * 2) - Math.PI;
  return from + delta * amount;
}

function segmentClear(from, to, radius = .36) {
  const distance = Math.hypot(to.x - from.x, to.z - from.z);
  const steps = Math.max(2, Math.ceil(distance / .22));
  for (let i = 1; i <= steps; i += 1) {
    const amount = i / steps;
    const x = from.x + (to.x - from.x) * amount;
    const z = from.z + (to.z - from.z) * amount;
    if (isBlocked(x, z, radius)) return false;
  }
  return true;
}

function buildNavigationPath(start, destination) {
  const origin = new THREE.Vector3(start.x, 0, start.z);
  const target = new THREE.Vector3(destination.x, 0, destination.z);
  if (segmentClear(origin, target)) return [target];

  // The current Meshy asset is a single environment mesh. This small,
  // validated waypoint graph keeps the user's route in the visible central
  // aisle and around the only known interaction obstacle.
  const candidates = [
    new THREE.Vector3(origin.x, 0, Math.max(origin.z, 3.9)),
    new THREE.Vector3(1.15, 0, 3.9),
    new THREE.Vector3(2.35, 0, 3.1),
    target,
  ];
  const result = [];
  let cursor = origin;
  for (const candidate of candidates) {
    if (cursor.distanceTo(candidate) < .06) continue;
    if (!segmentClear(cursor, candidate)) return [];
    result.push(candidate.clone());
    cursor = candidate;
  }
  return result;
}

function cancelOfficeNavigation(reason = 'manual') {
  autoWalk = false;
  autoPatrol = false;
  patrolIndex = 0;
  navigationPurpose = null;
  if (userController) {
    userController.queue = [];
    userController.seating = null;
    userController.seated = false;
    applySeatedPose(userController, 0);
    setCharacterAnimation(userController, 'idle');
  }
  cameraFollowEnabled = true;
  setPersonalHighlightState('normal');
  setOfficeState(reason === 'manual' ? OFFICE_STATES.OFFICE_MANUAL_MOVEMENT : OFFICE_STATES.OFFICE_IDLE);
}

function beginWorkstationNavigation(workstation, purpose = 'monitor') {
  if (!workstation || !userController || officeState === OFFICE_STATES.CHARACTER_SEATING || officeState === OFFICE_STATES.FIRST_PERSON_TRANSITION) return;
  const destination = purpose === 'monitor' ? workstation.approachPosition : workstation.standingPosition;
  const route = buildNavigationPath(userController.root.position, destination);
  if (!route.length && userController.root.position.distanceTo(destination) > .1) {
    setStatus('선택한 자리까지 안전한 이동 경로를 찾지 못했습니다.', true);
    showToast('다른 자리를 선택해 주세요.');
    return;
  }
  selectedWorkstation = workstation;
  navigationPurpose = purpose;
  autoWalk = route.length > 0;
  autoPatrol = false;
  patrolIndex = 0;
  userController.queue = route;
  userController.seated = false;
  userController.seating = null;
  cameraFollowEnabled = true;
  controls.enabled = true;
  mode = 'office';
  personalWorkstationHover = false;
  setPersonalHighlightState('navigation');
  welcomePanel.hidden = false;
  modePanel.hidden = true;
  setOfficeState(OFFICE_STATES.OFFICE_AUTO_NAVIGATION, { workstationId: workstation.id, purpose });
  setCharacterAnimation(userController, autoWalk ? 'walk' : 'idle');
  setStatus(purpose === 'monitor' ? '선택한 모니터로 이동 중 · 카메라는 3인칭을 유지합니다.' : '본인 자리로 이동 중입니다.');
  showToast(purpose === 'monitor' ? '업무 자리로 이동 중' : '자동 출근 시작');
  if (!autoWalk) beginWorkstationArrival();
}

function beginWorkstationArrival() {
  if (!selectedWorkstation || !userController) return;
  autoWalk = false;
  userController.queue = [];
  setCharacterAnimation(userController, 'idle');
  setOfficeState(OFFICE_STATES.WORKSTATION_ARRIVAL, { workstationId: selectedWorkstation.id });
  setStatus('자리 앞에 도착했습니다 · 의자 위치를 맞추는 중입니다.');
}

function beginSeating() {
  const workstation = selectedWorkstation;
  const controller = userController;
  if (!workstation || !controller || officeState !== OFFICE_STATES.WORKSTATION_ARRIVAL) return;
  const fromPosition = controller.root.position.clone();
  const toPosition = workstation.chairPosition.clone();
  controller.seating = {
    elapsed: 0,
    duration: .9,
    fromPosition,
    toPosition,
    fromRotation: controller.root.rotation.y,
    toRotation: workstation.seatingRotation,
  };
  controller.seated = false;
  setOfficeState(OFFICE_STATES.CHARACTER_SEATING, { workstationId: workstation.id, sourceAnimation: controller.fallbackStates?.includes('sit') ? 'prototype' : 'gltf' });
  setCharacterAnimation(controller, 'sit');
  setStatus(controller.fallbackStates?.includes('sit') ? '의자에 맞추는 중 · 착석 모션 프로토타입' : '의자에 맞추는 중 · 착석 애니메이션 실행');
}

function updateSeating(delta) {
  const controller = userController;
  const sequence = controller?.seating;
  if (!controller || !sequence) return;
  sequence.elapsed = Math.min(sequence.duration, sequence.elapsed + delta);
  const raw = sequence.duration ? sequence.elapsed / sequence.duration : 1;
  const amount = raw < 1 ? raw * raw * (3 - 2 * raw) : 1;
  controller.root.position.lerpVectors(sequence.fromPosition, sequence.toPosition, amount);
  controller.root.rotation.y = lerpAngle(sequence.fromRotation, sequence.toRotation, amount);
  applySeatedPose(controller, amount);
  if (raw >= 1) {
    controller.seating = null;
    controller.seated = true;
    applySeatedPose(controller, 1);
    setCharacterAnimation(controller, 'sit');
    setStatus('착석 완료 · 1인칭 업무 공간으로 이동합니다.');
    beginFirstPersonTransition();
  }
}

function persistWorkstationReturn(workstation) {
  try {
    sessionStorage.setItem('perwor-selected-workstation', JSON.stringify({
      id: workstation.id,
      standingPosition: workstation.standingPosition.toArray(),
      standingRotation: workstation.seatingRotation,
    }));
  } catch {}
}

function beginFirstPersonTransition() {
  const workstation = selectedWorkstation;
  if (!workstation || !userController || !userController.seated) return;
  persistWorkstationReturn(workstation);
  transitionWorkstation = workstation;
  transitionActive = true;
  transitionDispatched = false;
  cameraFollowEnabled = false;
  controls.enabled = false;
  personalWorkstationHover = false;
  setPersonalHighlightState('hidden');
  cameraGoal.copy(workstation.firstPersonPosition);
  targetGoal.copy(workstation.firstPersonTarget);
  setOfficeState(OFFICE_STATES.FIRST_PERSON_TRANSITION, { workstationId: workstation.id });
  welcomePanel.hidden = true;
  modePanel.hidden = true;
  showToast('착석 완료 · 워크스테이션 화면으로 이동 중');
}

function dispatchWorkstationHub() {
  if (transitionDispatched || !transitionWorkstation) return;
  transitionDispatched = true;
  transitionActive = false;
  const detail = { id: transitionWorkstation.monitorInteractionId, workstationId: transitionWorkstation.id, action: 'monitor', source: 'seated-monitor' };
  setOfficeState(OFFICE_STATES.WORKSTATION_HUB, detail);
  window.dispatchEvent(new CustomEvent('perwor:workstation-selected', { detail }));
  // index.html is the standalone office entry and has no Phase 1 router. In
  // that entry, use the existing hub document directly; phase1.html handles
  // the same event through its router when present.
  if (!window.__perworPhase1) {
    window.location.href = './workstation-hub.html?from=office&source=seated-monitor';
  }
}

function restoreReturnPosition(controller) {
  try {
    const raw = sessionStorage.getItem('perwor-selected-workstation');
    if (!raw) return false;
    const savedReturn = JSON.parse(raw);
    const workstation = Object.values(WORKSTATIONS).find(item => (
      item.id === savedReturn.id || (savedReturn.id === 'UserDesk' && item.id === 'personal-workstation-01')
    ));
    if (!workstation) return false;
    const position = Array.isArray(savedReturn.standingPosition) ? savedReturn.standingPosition : workstation.standingPosition.toArray();
    controller.root.position.set(position[0], 0, position[2]);
    controller.root.rotation.y = Number.isFinite(savedReturn.standingRotation) ? savedReturn.standingRotation : workstation.seatingRotation;
    selectedWorkstation = workstation;
    controller.seated = false;
    sessionStorage.removeItem('perwor-selected-workstation');
    setStatus('이전 업무 자리 앞에 도착했습니다 · 모니터를 선택해 업무를 시작하세요.');
    returnFromLearning = true;
    showToast('업무 자리로 돌아왔어요');
    return true;
  } catch {
    return false;
  }
}

function handleInteraction(interaction) {
  if (!interaction) return;
  if (interaction.action === 'monitor') {
    const workstation = Object.values(WORKSTATIONS).find(item => item.monitorInteractionId === interaction.id);
    if (!workstation) {
      setStatus('이 모니터에 연결된 워크스테이션 정보가 없습니다.', true);
      return;
    }
    beginWorkstationNavigation(workstation, 'monitor');
  } else if (interaction.action === 'typing') {
    if (officeState !== OFFICE_STATES.WORKSTATION_HUB && mode !== 'work-start') return;
    setMode('typing');
    window.dispatchEvent(new CustomEvent('perwor:typing-requested', { detail: { source: 'keyboard' } }));
  } else if (interaction.action === 'watering') {
    if (officeState !== OFFICE_STATES.WORKSTATION_HUB && mode !== 'work-start') return;
    setMode('watering');
  }
}

function handleWorkstationKey() {
  if (mode !== 'office' || !userController || userController.seated) return;
  const workstation = WORKSTATIONS['UserDesk-monitor'];
  const distance = userController.root.position.distanceTo(workstation.standingPosition);
  if (distance <= 1.65) {
    beginWorkstationNavigation(workstation, 'monitor');
  } else {
    showToast('내 자리 가까이에서 E키를 눌러 주세요.');
    setStatus('내 자리 표시를 따라 이동한 뒤 E키를 눌러 업무를 시작하세요.');
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
  if (hoverMarker) hoverMarker.visible = false;
  hoverObject = picked;
  if (hoverObject && hoverObject.material && hoverObject.material.emissive) hoverObject.material.emissive.set('#193b66');
  if (interaction?.action === 'monitor' && hoverObject?.userData?.hoverMarker) {
    hoverMarker = hoverObject.userData.hoverMarker;
    hoverMarker.visible = true;
  }
  const isPersonalMonitor = interaction?.id === 'UserDesk-monitor';
  const canHoverPersonalMonitor = mode === 'office' && officeState !== OFFICE_STATES.OFFICE_AUTO_NAVIGATION && officeState !== OFFICE_STATES.WORKSTATION_ARRIVAL && officeState !== OFFICE_STATES.CHARACTER_SEATING && officeState !== OFFICE_STATES.FIRST_PERSON_TRANSITION;
  personalWorkstationHover = Boolean(isPersonalMonitor && canHoverPersonalMonitor);
  if (personalWorkstationHover) setPersonalHighlightState('hover');
  else if (mode === 'office' && (officeState === OFFICE_STATES.OFFICE_AUTO_NAVIGATION || officeState === OFFICE_STATES.WORKSTATION_ARRIVAL || officeState === OFFICE_STATES.CHARACTER_SEATING)) setPersonalHighlightState('navigation');
  else if (mode === 'office') setPersonalHighlightState('normal');
  else setPersonalHighlightState('hidden');
  canvas.style.cursor = interaction ? 'pointer' : 'default';
  if (activate) handleInteraction(interaction);
  return interaction;
}
canvas.addEventListener('pointermove', event => pick(event, false));
canvas.addEventListener('pointerleave', () => {
  personalWorkstationHover = false;
  if (mode === 'office' && (officeState === OFFICE_STATES.OFFICE_AUTO_NAVIGATION || officeState === OFFICE_STATES.WORKSTATION_ARRIVAL || officeState === OFFICE_STATES.CHARACTER_SEATING)) setPersonalHighlightState('navigation');
  else if (mode === 'office') setPersonalHighlightState('normal');
  else setPersonalHighlightState('hidden');
  canvas.style.cursor = 'default';
});
canvas.addEventListener('pointerdown', event => {
  pointerDown = { x: event.clientX, y: event.clientY, pointerId: event.pointerId };
  pointerDragged = false;
});
function releasePointer(event) {
  if (!pointerDown) return;
  const distance = Math.hypot(event.clientX - pointerDown.x, event.clientY - pointerDown.y);
  pointerDragged = pointerDragged || distance > 7;
  lastPointerWasDrag = pointerDragged;
  pointerDown = null;
  pointerDragged = false;
}
canvas.addEventListener('pointerup', releasePointer);
window.addEventListener('pointerup', releasePointer);
canvas.addEventListener('click', event => {
  if (lastPointerWasDrag) {
    lastPointerWasDrag = false;
    return;
  }
  const interaction = pick(event, true);
  if (NAV_DEBUG) showToast('캔버스 클릭 · ' + (interaction?.id || '히트 없음'));
});
canvas.addEventListener('pointercancel', () => {
  pointerDown = null;
  pointerDragged = false;
});
canvas.addEventListener('pointermove', event => {
  if (!pointerDown) return;
  if (Math.hypot(event.clientX - pointerDown.x, event.clientY - pointerDown.y) > 7) pointerDragged = true;
});

const keys = new Set();

// The office scene owns WASD/arrow navigation, but it must never intercept
// keystrokes while the user is typing in an editable control. The previous
// global handler called preventDefault() for W/A/S/D even when the Phase 3
// textarea had focus, so words containing those letters were silently lost.
function isTextEntryTarget(target) {
  return target instanceof HTMLElement && (
    target.isContentEditable ||
    target.matches('input, textarea, select, [role="textbox"]')
  );
}

window.addEventListener('keydown', event => {
  if (isTextEntryTarget(event.target)) return;
  if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','w','a','s','d','W','A','S','D'].includes(event.key)) {
    if (mode !== 'office' || officeState === OFFICE_STATES.CHARACTER_SEATING || officeState === OFFICE_STATES.FIRST_PERSON_TRANSITION) return;
    event.preventDefault();
    keys.add(event.key.toLowerCase());
    if (userController) {
      if (autoWalk || officeState === OFFICE_STATES.OFFICE_AUTO_NAVIGATION || officeState === OFFICE_STATES.WORKSTATION_ARRIVAL) cancelOfficeNavigation('manual');
      cameraFollowEnabled = true;
      setOfficeState(OFFICE_STATES.OFFICE_MANUAL_MOVEMENT);
      setCharacterAnimation(userController, 'walk');
      setStatus('직접 이동 중 · 자동 이동이 취소됐습니다.');
    }
  }
  if (event.key === 'e' || event.key === 'E') {
    event.preventDefault();
    handleWorkstationKey();
  }
  if (event.key === 'Escape') {
    if (officeState === OFFICE_STATES.OFFICE_AUTO_NAVIGATION || officeState === OFFICE_STATES.WORKSTATION_ARRIVAL || officeState === OFFICE_STATES.CHARACTER_SEATING) cancelOfficeNavigation('manual');
    setMode('office');
  }
});
window.addEventListener('keyup', event => keys.delete(event.key.toLowerCase()));

function updateUser(delta) {
  if (!userController || !userController.root) return;
  if (officeState === OFFICE_STATES.WORKSTATION_ARRIVAL) {
    beginSeating();
    return;
  }
  if (officeState === OFFICE_STATES.CHARACTER_SEATING) {
    updateSeating(delta);
    return;
  }
  if (officeState === OFFICE_STATES.FIRST_PERSON_TRANSITION || mode !== 'office') return;
  if (autoPatrol && !autoWalk) {
    const patrolPoints = [
      new THREE.Vector3(-5.5, 0, 3.9),
      new THREE.Vector3(-1.2, 0, 3.9),
      new THREE.Vector3(1.15, 0, 3.9),
      new THREE.Vector3(1.15, 0, 1.9),
      new THREE.Vector3(-1.5, 0, 1.9),
      new THREE.Vector3(-4.8, 0, 1.9),
    ];
    const patrolTarget = patrolPoints[patrolIndex % patrolPoints.length];
    if (!userController.queue.length) {
      const route = buildNavigationPath(userController.root.position, patrolTarget);
      if (route.length) {
        userController.queue = route;
        autoWalk = true;
        setCharacterAnimation(userController, 'walk');
      }
      else patrolIndex = (patrolIndex + 1) % patrolPoints.length;
    }
  }
  if (autoWalk && userController.queue.length) {
    const next = userController.queue[0];
    if (moveToward(userController, next, delta)) {
      userController.queue.shift();
      if (!userController.queue.length) {
        autoWalk = false;
        const purpose = navigationPurpose;
        navigationPurpose = null;
        if (autoPatrol) {
          patrolIndex = (patrolIndex + 1) % 6;
          setCharacterAnimation(userController, 'idle');
          setStatus('오피스를 둘러보는 중입니다 · 내 자리를 선택하면 착석합니다.');
          return;
        }
        if (purpose === 'monitor') {
          beginWorkstationArrival();
        } else {
          setCharacterAnimation(userController, 'idle');
          setOfficeState(OFFICE_STATES.OFFICE_IDLE);
          setStatus('본인 자리 앞에 도착했습니다 · 모니터를 선택해 업무를 시작하세요.');
          showToast('자리 도착');
        }
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
    if (userController.state === 'walk') setCharacterAnimation(userController, 'idle');
    if (officeState === OFFICE_STATES.OFFICE_MANUAL_MOVEMENT) setOfficeState(OFFICE_STATES.OFFICE_IDLE);
    return;
  }
  direction.normalize();
  const nextX = userController.root.position.x + direction.x * delta * 2.6;
  const nextZ = userController.root.position.z + direction.z * delta * 2.6;
  if (!isBlocked(nextX, userController.root.position.z)) userController.root.position.x = nextX;
  if (!isBlocked(userController.root.position.x, nextZ)) userController.root.position.z = nextZ;
  userController.root.rotation.y = Math.atan2(direction.x, direction.z);
  cameraFollowEnabled = true;
  setOfficeState(OFFICE_STATES.OFFICE_MANUAL_MOVEMENT);
  setCharacterAnimation(userController, 'walk');
}

function animateCharacters(time, delta) {
  characters.forEach(character => {
    if (!character.model) return;
    if (character.mixer) character.mixer.update(delta);
    animateRiggedPose(character, time);
    if (character.seated || character.seating) applySeatedPose(character, character.seating ? Math.min(1, character.seating.elapsed / character.seating.duration) : 1);
    character.root.userData.position = { x: character.root.position.x, y: character.root.position.y, z: character.root.position.z };
    character.root.userData.rotation = character.root.rotation.y;
    character.root.userData.shadowPosition = { x: character.root.position.x, y: .018, z: character.root.position.z };
    const t = time + character.phase;
    if (character === userController) {
      if (character.state === 'walk') character.model.rotation.z = Math.sin(t * 8) * .025;
      else character.model.rotation.z = Math.sin(t * 1.5) * .008;
      return;
    }
    if (character.staffRole === '타이핑 업무 직원') {
      setCharacterAnimation(character, 'typing');
    } else if (character.staffRole === '회의 진행 직원') {
      setCharacterAnimation(character, 'speaking');
    } else if (character.staffRole === '회의 참여 직원') {
      setCharacterAnimation(character, 'nod');
    } else if (character.staffRole === '안내 데스크 직원') {
      setCharacterAnimation(character, 'idle');
    } else if (character.staffRole === '복도 직원') {
      setCharacterAnimation(character, 'walk');
      character.root.position.x = character.base.x + Math.sin(t * .35) * 1.5;
      character.root.rotation.y = Math.cos(t * .35) > 0 ? Math.PI / 2 : -Math.PI / 2;
    } else if (character.staffRole === '소파 휴식 직원') {
      setCharacterAnimation(character, 'resting');
    } else if (character.staffRole === '화분 관리 직원') {
      setCharacterAnimation(character, 'watering');
    }
  });
  const growth = scene.getObjectByName('GrowthPlant');
  if (growth && mode === 'watering') {
    const pulse = 1 + Math.sin(time * 3.2) * .035;
    growth.scale.set(pulse, pulse, pulse);
  }
  if (hoverMarker?.visible) {
    const pulse = 1 + Math.sin(time * 3.4) * .08;
    hoverMarker.scale.set(pulse, pulse, pulse);
  }
}

function updatePersonalWorkstationOverlay(time) {
  if (!personalWorkstationLabel || !personalWorkstationHint) return;
  const officeVisible = mode === 'office' && officeState !== OFFICE_STATES.FIRST_PERSON_TRANSITION && officeState !== OFFICE_STATES.WORKSTATION_HUB && officeState !== OFFICE_STATES.TYPING_LEARNING && officeState !== OFFICE_STATES.SPEAKING_LEARNING;
  if (!officeVisible) {
    personalWorkstationLabel.style.display = 'none';
    personalWorkstationHint.style.display = 'none';
    return;
  }
  const anchor = WORKSTATIONS['UserDesk-monitor'].monitorPosition.clone();
  anchor.y += .82;
  anchor.project(camera);
  const visible = anchor.z >= -1 && anchor.z <= 1 && Math.abs(anchor.x) <= 1.08 && Math.abs(anchor.y) <= 1.08;
  if (!visible) {
    personalWorkstationLabel.style.display = 'none';
    personalWorkstationHint.style.display = 'none';
    return;
  }
  const rect = canvas.getBoundingClientRect();
  const x = rect.left + (anchor.x * .5 + .5) * rect.width;
  const y = rect.top + (-anchor.y * .5 + .5) * rect.height;
  personalWorkstationLabel.style.left = `${x}px`;
  personalWorkstationLabel.style.top = `${y}px`;
  personalWorkstationLabel.style.display = 'block';
  personalWorkstationHint.style.left = `${x}px`;
  personalWorkstationHint.style.top = `${y + 28}px`;
  personalWorkstationHint.style.display = personalWorkstationHover && personalHighlightState === 'hover' ? 'block' : 'none';

  if (personalWorkstationHighlight?.group.visible) {
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const breath = reducedMotion ? 0 : (Math.sin(time * 2.1) + 1) * .5;
    const stateScale = personalHighlightState === 'hover' ? 1.12 : personalHighlightState === 'navigation' ? .78 : 1;
    personalWorkstationHighlight.glowMaterial.opacity = (personalHighlightState === 'hover' ? .15 : personalHighlightState === 'navigation' ? .02 : .045) * stateScale + breath * (personalHighlightState === 'hover' ? .05 : .018);
    personalWorkstationHighlight.outerMaterial.opacity = (personalHighlightState === 'hover' ? .66 : personalHighlightState === 'navigation' ? .14 : .25) * stateScale + breath * (personalHighlightState === 'hover' ? .12 : .07);
    personalWorkstationHighlight.innerMaterial.opacity = (personalHighlightState === 'hover' ? .34 : personalHighlightState === 'navigation' ? .06 : .14) * stateScale + breath * (personalHighlightState === 'hover' ? .08 : .04);
  }
}

function startAutoWalk() {
  if (!userController) return;
  autoWalk = false;
  autoPatrol = true;
  patrolIndex = 0;
  navigationPurpose = null;
  userController.queue = [];
  userController.seating = null;
  userController.seated = false;
  cameraFollowEnabled = true;
  setPersonalHighlightState('normal');
  setOfficeState(OFFICE_STATES.OFFICE_AUTO_NAVIGATION, { purpose: 'patrol' });
  setCharacterAnimation(userController, 'walk');
  setStatus('오피스를 둘러보는 중입니다 · 내 자리를 선택하면 착석합니다.');
  showToast('오피스 둘러보기 시작');
}

setupDailyTaskPanel();
document.querySelector('#resetView').addEventListener('click', () => setMode('office'));
document.querySelector('#toggleWalk').addEventListener('click', () => startAutoWalk());
document.querySelector('#typingAction').addEventListener('click', () => setMode('typing'));
document.querySelector('#speakingAction').addEventListener('click', () => setMode('speaking'));
document.querySelector('#wateringAction').addEventListener('click', () => setMode('watering'));
window.addEventListener('storage', updateDailyTaskPanel);
window.addEventListener('perwor:typing-result-ready', updateDailyTaskPanel);
window.addEventListener('perwor:speaking-result-ready', updateDailyTaskPanel);

// Publicly expose only the scene transition hook needed by the isolated Phase
// 1 shell. Learning data still flows through LearningBridge/API, not here.
window.__perwor3dSetMode = setMode;
window.__perwor3dReturnToOffice = () => setMode('office');
window.__perwor3dWorkstations = WORKSTATIONS;

function resize() {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
}
window.addEventListener('resize', resize);

async function boot() {
  try {
    const userDesk = createOfficeObjects();
    loadingText.textContent = '최종 Meshy 오피스 GLB를 불러오는 중…';
    await loadMeshyOfficeEnvironment();
    const user = await loadCharacter('UserCharacter', userModelRole, gender, [ENTRY_POSITION.x, ENTRY_POSITION.z], '사용자 캐릭터', 1.95);
    userController = user;
    user.target = new THREE.Vector3(3.3, 0, 1.5);
    const restoredFromWorkstation = restoreReturnPosition(user);
    if (!restoredFromWorkstation) {
      cameraFollowEnabled = false;
      frameUserAtEntrance(user);
      setStatus('입구 도착 · 오피스 안쪽을 바라보고 있습니다. WASD/방향키로 이동하세요.');
    } else {
      frameUserFrontOnReturn(user);
    }
    if (SHOW_PLACEHOLDER_STAFF) {
      await Promise.all([
        loadCharacter('StaffTyping', 'developer', 'male', [-1.6, -1.35], '타이핑 업무 직원', 1.62),
        loadCharacter('StaffMeetingLead', 'analyst', 'female', [-4.8, -3.5], '회의 진행 직원', 1.7),
        loadCharacter('StaffMeetingParticipant', 'associate', 'male', [-3.5, -3.5], '회의 참여 직원', 1.7),
        loadCharacter('StaffReception', 'teacher', 'female', [-7.2, -4.05], '안내 데스크 직원', 1.68),
        loadCharacter('StaffWalking', 'designer', 'male', [0, 3.3], '복도 직원', 1.72),
        loadCharacter('StaffResting', 'marketer', 'female', [6.7, -4.0], '소파 휴식 직원', 1.64),
        loadCharacter('StaffWatering', 'doctor', 'female', [7.1, 2.1], '화분 관리 직원', 1.68)
      ]);
    }
    loading.hidden = true;
    const riggedCount = characters.filter(character => character.mixer).length;
    const clipCount = characters.reduce((count, character) => count + (character.availableClips?.length || 0), 0);
    const fallbackStates = [...new Set(characters.flatMap(character => character.fallbackStates || []))];
    if (!restoredFromWorkstation) setStatus('Meshy textured 오피스 준비 완료 · 사용자 캐릭터 ' + (riggedCount ? '연결' : '대기') + ' · 모니터 선택으로 업무 시작');
    setMode('office');
    if (!restoredFromWorkstation) frameUserAtEntrance(user);
    else frameUserFrontOnReturn(user);
    renderer.setAnimationLoop(render);
  } catch (error) {
    console.error('[Perwor 3D] boot failed', error);
    const detail = ' · ' + (error && error.message ? error.message : String(error || 'unknown error'));
    loadingText.textContent = '3D 공간을 초기화하지 못했습니다.' + detail;
    setStatus('3D 오피스 초기화 실패', true);
  }
}

function render() {
  const delta = Math.min(clock.getDelta(), .05);
  const elapsed = clock.elapsedTime;
  updateUser(delta);
  animateCharacters(elapsed, delta);
  if (transitionActive) {
    const cameraEase = 1 - Math.exp(-delta * 4.2);
    camera.position.lerp(cameraGoal, cameraEase);
    controls.target.lerp(targetGoal, cameraEase);
    if (camera.position.distanceTo(cameraGoal) < .06 && controls.target.distanceTo(targetGoal) < .06) dispatchWorkstationHub();
  } else if (mode === 'office') {
    const desiredTarget = cameraFollowEnabled && userController
      ? new THREE.Vector3(userController.root.position.x, .82, userController.root.position.z)
      : DEFAULT_CAMERA_TARGET;
    controls.target.lerp(desiredTarget, 1 - Math.exp(-delta * 3.6));
    controls.update();
  } else {
    camera.position.lerp(cameraGoal, 1 - Math.exp(-delta * 4.2));
    controls.target.lerp(targetGoal, 1 - Math.exp(-delta * 4.2));
  }
  updatePersonalWorkstationOverlay(elapsed);
  renderer.render(scene, camera);
}

boot();
