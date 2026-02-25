import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

// ════════════════════════════════════════════════════════════
// State
// ════════════════════════════════════════════════════════════
let state = {
  power: false,
  mode: "cool",
  heatMode: false,
  temperature: 24
};

// ════════════════════════════════════════════════════════════
// Scene variables
// ════════════════════════════════════════════════════════════
let scene, camera, renderer, orbitControls, composer;
let modelsPlaced = false;

// Models
let miniSplitModel = null;
let coolModel = null;
let heatModel = null;
let modeModel = null;
let controlModel = null;
let anchorGroup = null;
let originalMaterials = [];

// Control model interactive meshes
const controlMeshes = [];

// Text sprites
let tempSprite = null;
let controlTempSprite = null;

// Animation
let miniMixer = null;
let miniAnimations = [];
let coolMixer = null;
let coolAnimations = [];
let heatMixer = null;
let heatAnimations = [];
let modeMixer = null;
let modeAnimations = [];
let controlMixer = null;
let controlAnimations = [];
let clock = new THREE.Clock();

// Auto temperature ramp interval
let tempInterval = null;

// Entrance animation
let entranceStartTime = 0;
let entranceActive = false;
const ENTRANCE_DURATION = 1.8; // seconds

// Wind sound for fan mode
let windSoundSource = null;
let windGainNode = null;
let windNoise = null;

// Cold air sound for cool mode
let coldAirSoundSource = null;
let coldAirGainNode = null;
let coldAirNoise = null;

// Model loading tracker
let modelsLoadedCount = 0;

// Prevent duplicate event listeners on re-entry
let listenersWired = false;

// Tap detection (distinguish tap from orbit drag)
let touchStartTime = 0;
let touchStartX = 0;
let touchStartY = 0;

// Audio
let audioCtx = null;
let musicPlaying = false;
let musicNodes = [];

// External experience
let extScene, extCamera, extRenderer, extOrbitControls, extComposer;
let extModel = null;
let extMixer = null;
let extClock = new THREE.Clock();
let extActive = false;

// Internal experience
let intScene, intCamera, intRenderer, intOrbitControls, intComposer;
let intModel = null;
let intMixer = null;
let intClock = new THREE.Clock();
let intActive = false;

// ════════════════════════════════════════════════════════════
// Splash screen
// ════════════════════════════════════════════════════════════
document.getElementById('btn-start').addEventListener('click', startExperience);
document.getElementById('btn-external').addEventListener('click', startExternalExperience);
document.getElementById('btn-internal').addEventListener('click', startInternalExperience);

function setupFadeInElements() {
  // Get all elements that should fade in
  const elements = [
    '#instructions',
    '#panel',
    '#connecting-lines',
    '#btn-back-main',
    '#btn-music',
    '#control-buttons',
    '.ctrl-btn'
  ];

  // Add fade-in class to all elements
  elements.forEach(selector => {
    const els = document.querySelectorAll(selector);
    els.forEach(el => {
      el.classList.add('fade-in-element');
    });
  });

  // Trigger fade-in with staggered delays
  setTimeout(() => {
    document.querySelector('#instructions')?.classList.add('visible');
  }, 200);

  setTimeout(() => {
    document.querySelector('#panel')?.classList.add('visible');
  }, 400);

  setTimeout(() => {
    document.querySelector('#connecting-lines')?.classList.add('visible');
  }, 600);

  setTimeout(() => {
    document.querySelector('#btn-back-main')?.classList.add('visible');
    document.querySelector('#btn-music')?.classList.add('visible');
  }, 800);

  setTimeout(() => {
    document.querySelector('#control-buttons')?.classList.add('visible');
  }, 1000);

  setTimeout(() => {
    const buttons = document.querySelectorAll('.ctrl-btn');
    buttons.forEach((btn, index) => {
      setTimeout(() => {
        btn.classList.add('visible');
      }, index * 100);
    });
  }, 1200);
}

function startExperience() {
  document.getElementById('splash').classList.add('hidden');
  document.getElementById('overlay').classList.remove('hidden');

  // Add fade-in classes to all elements
  setupFadeInElements();

  // Init audio context (must be after user gesture)
  initAudio();

  // Init scene + controls
  initScene();

  // Wire HTML control buttons (only once)
  if (!listenersWired) {
    setupHTMLButtons();
    document.getElementById('btn-music').addEventListener('click', toggleMusic);
    document.getElementById('btn-back-main').addEventListener('click', resetExperience);
    listenersWired = true;
  } else {
    // Reposition buttons on re-entry
    repositionHTMLButtons();
  }

  // Load models (they auto-place when both are ready)
  loadModels();

  // Start render loop
  renderer.setAnimationLoop(render);

  // Auto-start background music
  startMusic();
}

// ════════════════════════════════════════════════════════════
// HTML control buttons (guaranteed interactivity)
// ════════════════════════════════════════════════════════════
function setupHTMLButtons() {
  const actions = {
    'btn-power': togglePower,
    'btn-mode':  toggleMode,
    'btn-temp':  decreaseTemp,
    'btn-heat':  increaseTemp,
  };

  // Positions: ON/OFF + MODE on right, COOL + HEAT on left, all aligned vertically
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const sampleBtn = document.getElementById('btn-power');
  const btnW = sampleBtn.offsetWidth  || 130;
  const btnH = sampleBtn.offsetHeight || 80;
  const isMobile = vw <= 600;

  const gap = isMobile ? 8 : 12;
  const rightX = isMobile ? (vw - btnW - 8) : (vw * 0.5 + 180);
  const leftX  = isMobile ? 8 : (vw * 0.5 - 180 - btnW);
  const baseY  = Math.round(vh * 0.42);

  const positions = {
    'btn-power': { left: rightX, top: baseY },
    'btn-mode':  { left: rightX, top: baseY + btnH + gap },
    'btn-temp':  { left: leftX,  top: baseY },
    'btn-heat':  { left: leftX,  top: baseY + btnH + gap },
  };

  Object.entries(positions).forEach(([id, pos]) => {
    const btn = document.getElementById(id);
    btn.style.left = pos.left + 'px';
    btn.style.top  = pos.top  + 'px';
  });

  // Make each button draggable + clickable
  Object.entries(actions).forEach(([id, action]) => {
    const btn = document.getElementById(id);
    makeDraggable(btn, action);
  });
}

function repositionHTMLButtons() {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const sampleBtn = document.getElementById('btn-power');
  const btnW = sampleBtn.offsetWidth  || 130;
  const btnH = sampleBtn.offsetHeight || 80;
  const isMobile = vw <= 600;

  const gap = isMobile ? 8 : 12;
  const rightX = isMobile ? (vw - btnW - 8) : (vw * 0.5 + 180);
  const leftX  = isMobile ? 8 : (vw * 0.5 - 180 - btnW);
  const baseY  = Math.round(vh * 0.42);

  const positions = {
    'btn-power': { left: rightX, top: baseY },
    'btn-mode':  { left: rightX, top: baseY + btnH + gap },
    'btn-temp':  { left: leftX,  top: baseY },
    'btn-heat':  { left: leftX,  top: baseY + btnH + gap },
  };

  Object.entries(positions).forEach(([id, pos]) => {
    const btn = document.getElementById(id);
    btn.style.left = pos.left + 'px';
    btn.style.top  = pos.top  + 'px';
  });
}

function makeDraggable(btn, clickAction) {
  let dragging = false;
  let startX, startY, origLeft, origTop;
  const DRAG_THRESHOLD = 8; // px — below this is a click

  btn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragging = false;
    startX = e.clientX;
    startY = e.clientY;
    origLeft = btn.offsetLeft;
    origTop  = btn.offsetTop;
    btn.classList.add('dragging');
    btn.setPointerCapture(e.pointerId);
  });

  btn.addEventListener('pointermove', (e) => {
    if (startX === undefined) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;

    if (!dragging && (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD)) {
      dragging = true;
    }

    if (dragging) {
      btn.style.left = (origLeft + dx) + 'px';
      btn.style.top  = (origTop  + dy) + 'px';
    }
  });

  btn.addEventListener('pointerup', (e) => {
    e.stopPropagation();
    btn.classList.remove('dragging');
    btn.releasePointerCapture(e.pointerId);

    if (!dragging) {
      // It was a click, not a drag
      clickAction();
    }

    startX = undefined;
    startY = undefined;
    dragging = false;
  });
}

function updatePowerButton() {
  const btn = document.getElementById('btn-power');
  btn.classList.toggle('power-on', state.power);
  btn.classList.toggle('power-off', !state.power);
}

// ════════════════════════════════════════════════════════════
// Scene init
// ════════════════════════════════════════════════════════════
function initScene() {
  scene = new THREE.Scene();

  // Gradient background — bright blue top, dark bottom
  const bgCanvas = document.createElement('canvas');
  bgCanvas.width = 2;
  bgCanvas.height = 512;
  const bgCtx = bgCanvas.getContext('2d');
  const grad = bgCtx.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0, '#84b2d7ff');
  grad.addColorStop(0.3, '#689acfff');
  grad.addColorStop(0.7, '#1b4584');
  grad.addColorStop(1, '#030c1a');
  bgCtx.fillStyle = grad;
  bgCtx.fillRect(0, 0, 2, 512);
  scene.background = new THREE.CanvasTexture(bgCanvas);

  camera = new THREE.PerspectiveCamera(
    60,
    window.innerWidth / window.innerHeight,
    0.01,
    50
  );
  camera.position.set(0, 0.4, 2.2);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  document.getElementById('container').appendChild(renderer.domElement);

  // Lighting
  scene.add(new THREE.HemisphereLight(0xffffff, 0xbbbbff, 1.5));
  const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
  dirLight.position.set(1, 2, 1.5);
  dirLight.castShadow = true;
  dirLight.shadow.mapSize.width = 1024;
  dirLight.shadow.mapSize.height = 1024;
  dirLight.shadow.camera.near = 0.1;
  dirLight.shadow.camera.far = 10;
  dirLight.shadow.camera.left = -2;
  dirLight.shadow.camera.right = 2;
  dirLight.shadow.camera.top = 2;
  dirLight.shadow.camera.bottom = -2;
  scene.add(dirLight);
  const dirLight2 = new THREE.DirectionalLight(0xffffff, 0.6);
  dirLight2.position.set(-1, 0.5, -1);
  scene.add(dirLight2);

  // Bloom post-processing
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.6,   // strength
    0.5,   // radius
    0.7    // threshold
  );
  composer.addPass(bloomPass);

  // OrbitControls — allows 3D rotation by dragging
  orbitControls = new OrbitControls(camera, renderer.domElement);
  orbitControls.enableDamping = true;
  orbitControls.dampingFactor = 0.08;
  orbitControls.target.set(0, 0.15, 0);
  orbitControls.minDistance = 0.8;
  orbitControls.maxDistance = 5;
  orbitControls.maxPolarAngle = Math.PI * 0.85;
  orbitControls.update();

  window.addEventListener('resize', onWindowResize);
}

// ════════════════════════════════════════════════════════════
// Model loading
// ════════════════════════════════════════════════════════════
function loadModels() {
  const loader = new GLTFLoader();

  loader.load(
    'models/miniB.glb',
    (gltf) => {
      miniSplitModel = gltf.scene;
      miniSplitModel.traverse((child) => {
        if (child.isMesh) {
          child.material = child.material.clone();
          originalMaterials.push({
            mesh: child,
            emissive: child.material.emissive
              ? child.material.emissive.clone()
              : new THREE.Color(0x000000),
            emissiveIntensity: child.material.emissiveIntensity || 0,
            transparent: child.material.transparent,
            opacity: child.material.opacity
          });
        }
      });
      miniSplitModel.scale.set(2, 2, 2);

      // Pantalla (LED screen): restore shader + add emissive glow for bloom
      const pantalla = miniSplitModel.getObjectByName('pantalla');
      if (pantalla && pantalla.isMesh) {
        pantalla.material.transparent = true;
        pantalla.material.opacity = pantalla.material.opacity || 1;
        pantalla.material.emissive = new THREE.Color(0x00aaff);
        pantalla.material.emissiveIntensity = 5.0;
        pantalla.material.toneMapped = false;
      }

      // Setup animation mixer if animations exist
      if (gltf.animations && gltf.animations.length > 0) {
        miniMixer = new THREE.AnimationMixer(miniSplitModel);
        miniAnimations = gltf.animations;
        console.log('Mini split animations:', miniAnimations.map(a => a.name));
      }
      console.log('Mini split model loaded (miniB)');
      modelsLoadedCount++;
      autoPlaceWhenReady();
    },
    undefined,
    (err) => console.error('Error loading miniB.glb:', err)
  );

  // Load cool.glb
  loader.load(
    'models/cool.glb',
    (gltf) => {
      coolModel = gltf.scene;
      coolModel.traverse((child) => {
        if (child.isMesh) {
          child.material = child.material.clone();
        }
      });
      coolModel.scale.set(2, 2, 2);
      coolModel.visible = false; // Start hidden

      // Pantalla (LED screen): restore shader + add emissive glow for bloom
      const pantallaCool = coolModel.getObjectByName('pantalla');
      if (pantallaCool && pantallaCool.isMesh) {
        pantallaCool.material.transparent = true;
        pantallaCool.material.opacity = pantallaCool.material.opacity || 1;
        pantallaCool.material.emissive = new THREE.Color(0x00aaff);
        pantallaCool.material.emissiveIntensity = 5.0;
        pantallaCool.material.toneMapped = false;
      }

      // Setup animation mixer if animations exist
      if (gltf.animations && gltf.animations.length > 0) {
        coolMixer = new THREE.AnimationMixer(coolModel);
        coolAnimations = gltf.animations;
        console.log('Cool animations:', coolAnimations.map(a => a.name));
      }
      console.log('Cool model loaded');
      modelsLoadedCount++;
      autoPlaceWhenReady();
    },
    undefined,
    (err) => console.error('Error loading cool.glb:', err)
  );

  // Load heat.glb
  loader.load(
    'models/heat.glb',
    (gltf) => {
      heatModel = gltf.scene;
      heatModel.traverse((child) => {
        if (child.isMesh) {
          child.material = child.material.clone();
        }
      });
      heatModel.scale.set(2, 2, 2);
      heatModel.visible = false; // Start hidden

      // Pantalla (LED screen): restore shader + add emissive glow for bloom
      const pantallaHeat = heatModel.getObjectByName('pantalla');
      if (pantallaHeat && pantallaHeat.isMesh) {
        pantallaHeat.material.transparent = true;
        pantallaHeat.material.opacity = pantallaHeat.material.opacity || 1;
        pantallaHeat.material.emissive = new THREE.Color(0x00aaff);
        pantallaHeat.material.emissiveIntensity = 5.0;
        pantallaHeat.material.toneMapped = false;
      }

      // Setup animation mixer if animations exist
      if (gltf.animations && gltf.animations.length > 0) {
        heatMixer = new THREE.AnimationMixer(heatModel);
        heatAnimations = gltf.animations;
        console.log('Heat animations:', heatAnimations.map(a => a.name));
      }
      console.log('Heat model loaded');
      modelsLoadedCount++;
      autoPlaceWhenReady();
    },
    undefined,
    (err) => console.error('Error loading heat.glb:', err)
  );

  // Load mode.glb
  loader.load(
    'models/mode.glb',
    (gltf) => {
      modeModel = gltf.scene;
      modeModel.traverse((child) => {
        if (child.isMesh) {
          child.material = child.material.clone();
        }
      });
      modeModel.scale.set(2, 2, 2);
      modeModel.visible = false; // Start hidden

      // Pantalla (LED screen): restore shader + add emissive glow for bloom
      const pantallaMode = modeModel.getObjectByName('pantalla');
      if (pantallaMode && pantallaMode.isMesh) {
        pantallaMode.material.transparent = true;
        pantallaMode.material.opacity = pantallaMode.material.opacity || 1;
        pantallaMode.material.emissive = new THREE.Color(0x00aaff);
        pantallaMode.material.emissiveIntensity = 5.0;
        pantallaMode.material.toneMapped = false;
      }

      // Setup animation mixer if animations exist
      if (gltf.animations && gltf.animations.length > 0) {
        modeMixer = new THREE.AnimationMixer(modeModel);
        modeAnimations = gltf.animations;
        console.log('Mode animations:', modeAnimations.map(a => a.name));
      }
      console.log('Mode model loaded');
      modelsLoadedCount++;
      autoPlaceWhenReady();
    },
    undefined,
    (err) => console.error('Error loading mode.glb:', err)
  );

  loader.load(
    'models/controlB.glb',
    (gltf) => {
      controlModel = gltf.scene;
      controlModel.scale.set(0.75, 0.75, 0.75);

      controlModel.traverse((child) => {
        if (child.isMesh) {
          child.geometry.computeBoundingBox();
          controlMeshes.push(child);
        }
      });

      // Setup control animation mixer
      if (gltf.animations && gltf.animations.length > 0) {
        controlMixer = new THREE.AnimationMixer(controlModel);
        controlAnimations = gltf.animations;
        console.log('Control animations:', controlAnimations.map(a => a.name));
      }

      modelsLoadedCount++;
      autoPlaceWhenReady();
    },
    undefined,
    (err) => console.error('Error loading controlB.glb:', err)
  );
}

// ════════════════════════════════════════════════════════════
// Auto-place when both models are loaded
// ════════════════════════════════════════════════════════════
function autoPlaceWhenReady() {
  if (modelsLoadedCount < 5 || modelsPlaced) return;
  placeModels(new THREE.Vector3(0, 0, 0));
}

// ════════════════════════════════════════════════════════════
// Place models in scene
// ════════════════════════════════════════════════════════════
function placeModels(position) {
  if (modelsPlaced) return;
  if (!miniSplitModel || !controlModel || !coolModel || !heatModel || !modeModel) return;

  anchorGroup = new THREE.Group();
  anchorGroup.position.copy(position);

  // Mini split — raised higher, pushed back
  anchorGroup.add(miniSplitModel);
  miniSplitModel.position.set(0, 0.7, -0.5);

  // Cool model — same position as mini split, start hidden
  anchorGroup.add(coolModel);
  coolModel.position.set(0, 0.7, -0.5);
  coolModel.visible = false;

  // Heat model — same position as mini split, start hidden
  anchorGroup.add(heatModel);
  heatModel.position.set(0, 0.7, -0.5);
  heatModel.visible = false;

  // Mode model — same position as mini split, start hidden
  anchorGroup.add(modeModel);
  modeModel.position.set(0, 0.7, -0.5);
  modeModel.visible = false;

  // Control remote — centered, raised
  anchorGroup.add(controlModel);
  controlModel.position.set(0, -0.15, 0.2);

  // Enable shadow casting on control model
  controlModel.traverse((child) => {
    if (child.isMesh) child.castShadow = true;
  });

  // Invisible shadow-receiving floor under control
  const floorGeo = new THREE.PlaneGeometry(3, 3);
  const floorMat = new THREE.ShadowMaterial({ opacity: 0.35 });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, -0.95, 0.35);
  floor.receiveShadow = true;
  anchorGroup.add(floor);

  // Temperature text — 3X scale, parented to pantalla mesh so it rotates with 3D
  const pantallaMesh = miniSplitModel.getObjectByName('pantalla');
  tempSprite = createTextMesh(String(state.temperature), {
    scaleX: 4.05, scaleY: 1.62,
    font: 'bold 72px Orbitron, monospace',
    textColor: '#00C7FF',
    bgColor: 'rgba(0, 0, 0, 0)'
  });
  tempSprite.rotation.x = -Math.PI / 2;
  if (pantallaMesh) {
    tempSprite.position.set(-0.495, 0, 0.02);
    pantallaMesh.add(tempSprite);
  } else {
    tempSprite.position.set(-0.075, 0.9, -0.5);
    anchorGroup.add(tempSprite);
  }
  tempSprite.visible = false;

  // Temperature text on control — linked to Pinicio mesh in controlB.glb
  const pinicioMesh = controlModel.getObjectByName('Pinicio');
  controlTempSprite = createTextMesh(String(state.temperature), {
    scaleX: 3.24, scaleY: 1.296,
    font: 'bold 72px Orbitron, monospace',
    textColor: '#232820',
    bgColor: 'rgba(0, 0, 0, 0)'
  });
  controlTempSprite.rotation.x = -Math.PI / 2;
  if (pinicioMesh) {
    controlTempSprite.position.set(0.397, 0, -.18);
    pinicioMesh.add(controlTempSprite);
  } else {
    controlTempSprite.position.set(0, -0.15, 0.25);
    anchorGroup.add(controlTempSprite);
  }
  controlTempSprite.visible = false;

  scene.add(anchorGroup);
  modelsPlaced = true;

  // Show control in OFF state (first frame of 'encender')
  resetControlToFirstFrame('encender');

  // Start entrance animation
  startEntranceEffect();

  document.getElementById('instructions').textContent =
    'Arrastra para girar · Botones para interactuar';
  updateUI();
}

// ════════════════════════════════════════════════════════════
// Entrance effect — virtual materialization
// ════════════════════════════════════════════════════════════
function startEntranceEffect() {
  // Set initial state: scale 0, transparent
  miniSplitModel.scale.set(0, 0, 0);
  controlModel.scale.set(0, 0, 0);

  // Make all meshes transparent for fade-in
  [miniSplitModel, controlModel].forEach((model) => {
    model.traverse((child) => {
      if (child.isMesh) {
        child.material.transparent = true;
        child.material.opacity = 0;
      }
    });
  });

  entranceStartTime = clock.getElapsedTime();
  entranceActive = true;
}

function updateEntranceEffect() {
  if (!entranceActive) return;

  const elapsed = clock.getElapsedTime() - entranceStartTime;
  const t = Math.min(elapsed / ENTRANCE_DURATION, 1);

  // EaseOutBack curve for scale (slight overshoot)
  const c1 = 1.70158;
  const c3 = c1 + 1;
  const easeScale = 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);

  // Smooth opacity fade
  const easeOpacity = 1 - Math.pow(1.2 - t, 3);

  // Mini split target scale: 2
  const ms = easeScale * 2;
  miniSplitModel.scale.set(ms, ms, ms);

  // Control target scale: 0.75
  const cs = easeScale * 0.75;
  controlModel.scale.set(cs, cs, cs);

  // Fade opacity
  [miniSplitModel, controlModel].forEach((model) => {
    model.traverse((child) => {
      if (child.isMesh) {
        child.material.opacity = easeOpacity;
      }
    });
  });

  if (t >= 1) {
    entranceActive = false;
    // Restore original transparency state for each mesh
    [miniSplitModel, controlModel].forEach((model) => {
      model.traverse((child) => {
        if (child.isMesh) {
          // Find original state if saved
          const orig = originalMaterials.find(o => o.mesh === child);
          if (orig) {
            child.material.opacity = orig.opacity;
            child.material.transparent = orig.transparent;
          } else {
            child.material.opacity = 1;
            child.material.transparent = false;
          }
        }
      });
    });

    // Re-apply pantalla glow after entrance
    const pantalla = miniSplitModel.getObjectByName('pantalla');
    if (pantalla && pantalla.isMesh) {
      pantalla.material.transparent = true;
      pantalla.material.emissive = new THREE.Color(0x00aaff);
      pantalla.material.emissiveIntensity = 5.0;
      pantalla.material.toneMapped = false;
    }
  }
}

// ════════════════════════════════════════════════════════════
// Tap detection — differentiates taps from orbit drags
// ════════════════════════════════════════════════════════════
function onTouchStart(e) {
  if (e.touches.length !== 1) return;
  touchStartTime = performance.now();
  touchStartX = e.touches[0].clientX;
  touchStartY = e.touches[0].clientY;
}

function onTouchEnd(e) {
  const dt = performance.now() - touchStartTime;
  const ct = e.changedTouches[0];
  const dx = ct.clientX - touchStartX;
  const dy = ct.clientY - touchStartY;
  const dist = Math.sqrt(dx * dx + dy * dy);

  // Short tap, little movement → button interaction
  if (dt < 400 && dist < 20) {
    const coords = new THREE.Vector2(
      (ct.clientX / window.innerWidth) * 2 - 1,
      -(ct.clientY / window.innerHeight) * 2 + 1
    );
    performRaycast(coords);
  }
}

function onClick(e) {
  // Desktop clicks — OrbitControls doesn't fire click on drag
  const coords = new THREE.Vector2(
    (e.clientX / window.innerWidth) * 2 - 1,
    -(e.clientY / window.innerHeight) * 2 + 1
  );
  performRaycast(coords);
}

// ════════════════════════════════════════════════════════════
// Raycaster — zone-based on control model
// ════════════════════════════════════════════════════════════
function performRaycast(coords) {
  if (!modelsPlaced || controlMeshes.length === 0) return;

  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(coords, camera);

  const intersects = raycaster.intersectObjects(controlMeshes, true);
  if (intersects.length > 0) {
    let hitObj = intersects[0].object;
    const buttonActions = {
      'ON':   togglePower,
      'MODE': toggleMode,
      'COOL': decreaseTemp,
      'HEAT': increaseTemp,
    };

    // Check the hit mesh name and its ancestors
    while (hitObj) {
      if (buttonActions[hitObj.name]) {
        buttonActions[hitObj.name]();
        return;
      }
      hitObj = hitObj.parent;
      if (hitObj === controlModel) break;
    }

    // Fallback: use nearest named button by distance
    const hitPoint = intersects[0].point.clone();
    let closestName = null;
    let closestDist = Infinity;
    for (const name of Object.keys(buttonActions)) {
      const obj = controlModel.getObjectByName(name);
      if (!obj) continue;
      const wp = new THREE.Vector3();
      obj.getWorldPosition(wp);
      const d = hitPoint.distanceTo(wp);
      if (d < closestDist) {
        closestDist = d;
        closestName = name;
      }
    }
    if (closestName) {
      buttonActions[closestName]();
    }
  }
}

// ════════════════════════════════════════════════════════════
// Power alert — shown when pressing buttons while power is off
// ════════════════════════════════════════════════════════════
let powerAlertTimeout = null;
function showPowerAlert() {
  // Remove existing alert if present
  let el = document.getElementById('power-alert');
  if (!el) {
    el = document.createElement('div');
    el.id = 'power-alert';
    el.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);' +
      'background:rgba(0,0,0,0.45);color:#38DC00;padding:18px 32px;border-radius:16px;' +
      'font-family:Roboto Condensed,sans-serif;font-size:16px;font-weight:700;' +
      'text-align:center;z-index:100;backdrop-filter:blur(8px);' +
      'border:1.5px solid #38DC00;pointer-events:none;' +
      'animation:fadeInOut 2.5s forwards;';
    document.body.appendChild(el);
  }
  el.textContent = 'Enciende primero el equipo BOTON ON';
  el.style.opacity = '1';

  if (powerAlertTimeout) clearTimeout(powerAlertTimeout);
  powerAlertTimeout = setTimeout(() => {
    el.style.transition = 'opacity 0.5s';
    el.style.opacity = '0';
  }, 2000);
}

// ════════════════════════════════════════════════════════════
// State logic
// ════════════════════════════════════════════════════════════
function togglePower() {
  state.power = !state.power;
  state.heatMode = false; // Reset heat mode when power toggles
  playButtonSound(state.power ? 'on' : 'off');

  // Cancel any running temp ramp
  if (tempInterval) { clearInterval(tempInterval); tempInterval = null; }

  // Play/stop mini split animation (once, no loop)
  if (miniMixer && miniAnimations.length > 0) {
    miniAnimations.forEach((clip) => {
      const action = miniMixer.clipAction(clip);
      if (state.power) {
        action.reset();
        action.clampWhenFinished = true;
        action.setLoop(THREE.LoopOnce);
        action.play();
      } else {
        action.stop();
        action.reset();
      }
    });
  }

  // Play 'encender' control animation on power on, rewind on power off
  if (controlMixer && controlAnimations.length > 0) {
    if (state.power) {
      playControlAnimation('encender');
    } else {
      // Rewind 'encender' without playing
      resetControlToFirstFrame('encender');
    }
  }

  // Show/hide temp sprites based on power state
  if (tempSprite) {
    tempSprite.visible = state.power;
  }
  if (controlTempSprite) {
    controlTempSprite.visible = state.power;
  }

  // Hide cool and heat models when power is off
  if (coolModel && !state.power) {
    coolModel.visible = false;
  }
  if (heatModel && !state.power) {
    heatModel.visible = false;
  }
  if (modeModel && !state.power) {
    modeModel.visible = false;
  }
  
  // Stop wind sound when power is off
  if (!state.power) {
    stopWindSound();
  }

  updateUI();
  updatePowerButton();
  flashControl();
}

function toggleMode() {
  if (!state.power) { showPowerAlert(); return; }
  playButtonSound('click');

  // Always activate fan mode when pressed
  state.mode = 'fan';
  state.heatMode = false; // Reset heat mode when mode changes
  
  // Play ventilator animation on control remote
  playControlAnimation('ventilador');

  // Hide heat model when mode changes
  if (heatModel) {
    heatModel.visible = false;
  }

  // Always activate fan mode when MODE is pressed
  // Hide cool model when switching to fan
  if (coolModel) {
    coolModel.visible = false;
  }
  // Show mode model if it exists
  if (modeModel) {
    modeModel.visible = true;
    if (modeMixer && modeAnimations.length > 0) {
      modeAnimations.forEach((clip) => {
        const action = modeMixer.clipAction(clip);
        action.reset();
        action.clampWhenFinished = true;
        action.setLoop(THREE.LoopOnce);
        action.play();
      });
    }
    // Start wind sound for fan mode
    startWindSound();
  }

  updateUI();
  flashControl();
}

function decreaseTemp() {
  if (!state.power) { showPowerAlert(); return; }
  if (state.temperature <= 18) return;
  playButtonSound('beep');
  flashControl();
  playControlAnimation('HEAT');

  // Set heat mode inactive and cool mode active
  state.heatMode = false;
  state.mode = 'cool';

  // Stop wind sound when using temperature controls
  stopWindSound();

  // Update UI immediately
  updateUI();

  // Show cool model and play its animation, hide heat model
  if (coolModel) {
    coolModel.visible = true;
    if (coolMixer && coolAnimations.length > 0) {
      coolAnimations.forEach((clip) => {
        const action = coolMixer.clipAction(clip);
        action.reset();
        action.clampWhenFinished = true;
        action.setLoop(THREE.LoopOnce);
        action.play();
      });
    }
  }
  if (heatModel) {
    heatModel.visible = false;
  }
  if (modeModel) {
    modeModel.visible = false;
  }

  
  // Cancel any running ramp
  if (tempInterval) clearInterval(tempInterval);

  const target = 18;
  const steps = state.temperature - target;
  if (steps <= 0) return;
  const intervalMs = 5000 / steps;

  tempInterval = setInterval(() => {
    if (state.temperature <= target || !state.power) {
      clearInterval(tempInterval);
      tempInterval = null;
      return;
    }
    state.temperature--;
    replaceTempSprite();
    updateUI();
  }, intervalMs);
}

function increaseTemp() {
  if (!state.power) { showPowerAlert(); return; }
  if (state.temperature >= 38) return;
  playButtonSound('beep');
  flashControl();
  playControlAnimation('COOL');

  // Set heat mode active
  state.heatMode = true;

  // Stop wind sound when using temperature controls
  stopWindSound();

  // Update UI immediately
  updateUI();

  // Hide cool model and show heat model
  if (coolModel) {
    coolModel.visible = false;
  }
  if (heatModel) {
    heatModel.visible = true;
    if (heatMixer && heatAnimations.length > 0) {
      heatAnimations.forEach((clip) => {
        const action = heatMixer.clipAction(clip);
        action.reset();
        action.clampWhenFinished = true;
        action.setLoop(THREE.LoopOnce);
        action.play();
      });
    }
  }
  if (modeModel) {
    modeModel.visible = false;
  }

  
  // Cancel any running ramp
  if (tempInterval) clearInterval(tempInterval);

  const target = 38;
  const steps = target - state.temperature;
  if (steps <= 0) return;
  const intervalMs = 5000 / steps;

  tempInterval = setInterval(() => {
    if (state.temperature >= target || !state.power) {
      clearInterval(tempInterval);
      tempInterval = null;
      return;
    }
    state.temperature++;
    replaceTempSprite();
    updateUI();
  }, intervalMs);
}

// ════════════════════════════════════════════════════════════
// Control animation helpers
// ════════════════════════════════════════════════════════════
function playControlAnimation(name) {
  if (!controlMixer || controlAnimations.length === 0) return;
  // Stop all current control animations
  stopAllControlAnimations();
  // Find and play the named clip
  const clip = controlAnimations.find(c => c.name === name);
  if (clip) {
    const action = controlMixer.clipAction(clip);
    action.reset();
    action.clampWhenFinished = true;
    action.setLoop(THREE.LoopOnce);
    action.play();
  } else {
    console.warn('Control animation not found:', name);
  }
}

function stopAllControlAnimations() {
  if (!controlMixer || controlAnimations.length === 0) return;
  controlAnimations.forEach((clip) => {
    const action = controlMixer.clipAction(clip);
    action.stop();
    action.reset();
  });
}

function resetControlToFirstFrame(name) {
  if (!controlMixer || controlAnimations.length === 0) return;
  stopAllControlAnimations();
  const clip = controlAnimations.find(c => c.name === name);
  if (clip) {
    const action = controlMixer.clipAction(clip);
    action.reset();
    action.time = 0;
    action.clampWhenFinished = true;
    action.setLoop(THREE.LoopOnce);
    action.play();
    action.paused = true;
  }
}

// ════════════════════════════════════════════════════════════
// Sprite helpers
// ════════════════════════════════════════════════════════════
function replaceTempSprite() {
  // Update pantalla temp
  if (tempSprite) {
    const parent = tempSprite.parent;
    if (parent) {
      const oldPos = tempSprite.position.clone();
      const wasVisible = tempSprite.visible;
      parent.remove(tempSprite);
      tempSprite.material.map.dispose();
      tempSprite.material.dispose();
      tempSprite.geometry.dispose();

      tempSprite = createTextMesh(String(state.temperature), {
        scaleX: 4.05, scaleY: 1.62,
        font: 'bold 72px Orbitron, monospace',
        textColor: '#00C7FF',
        bgColor: 'rgba(0, 0, 0, 0)'
      });
      tempSprite.rotation.x = -Math.PI / 2;
      tempSprite.position.copy(oldPos);
      tempSprite.visible = wasVisible;
      parent.add(tempSprite);
    }
  }

  // Update control temp (Pinicio)
  if (controlTempSprite) {
    const parent2 = controlTempSprite.parent;
    if (parent2) {
      const oldPos2 = controlTempSprite.position.clone();
      const wasVisible2 = controlTempSprite.visible;
      parent2.remove(controlTempSprite);
      controlTempSprite.material.map.dispose();
      controlTempSprite.material.dispose();
      controlTempSprite.geometry.dispose();

      controlTempSprite = createTextMesh(String(state.temperature), {
        scaleX: 3.24, scaleY: 1.296,
        font: 'bold 72px Orbitron, monospace',
        textColor: '#232820',
        bgColor: 'rgba(0, 0, 0, 0)'
      });
      controlTempSprite.rotation.x = -Math.PI / 2;
      controlTempSprite.position.copy(oldPos2);
      controlTempSprite.visible = wasVisible2;
      parent2.add(controlTempSprite);
    }
  }
}

function flashControl() {
  if (!controlModel) return;
  const orig = controlModel.scale.clone();
  controlModel.scale.multiplyScalar(1.08);
  setTimeout(() => controlModel.scale.copy(orig), 120);
}

// ════════════════════════════════════════════════════════════
// Reset experience — return to splash screen
// ════════════════════════════════════════════════════════════
function resetExperience() {
  // Stop music
  if (musicPlaying) stopMusic();

  // Stop wind sound
  stopWindSound();

  // Stop render loop
  if (renderer) renderer.setAnimationLoop(null);

  // Stop all animations
  if (miniMixer) miniMixer.stopAllAction();
  if (coolMixer) coolMixer.stopAllAction();
  if (heatMixer) heatMixer.stopAllAction();
  if (modeMixer) modeMixer.stopAllAction();
  if (controlMixer) controlMixer.stopAllAction();

  // Remove scene objects
  if (anchorGroup && scene) scene.remove(anchorGroup);

  // Dispose renderer
  if (renderer) {
    renderer.dispose();
    const container = document.getElementById('container');
    if (container && renderer.domElement.parentNode === container) {
      container.removeChild(renderer.domElement);
    }
  }

  // Cancel temp ramp
  if (tempInterval) { clearInterval(tempInterval); tempInterval = null; }

  // Reset state
  state.power = false;
  state.mode = 'cool';
  state.heatMode = false;
  state.temperature = 24;
  modelsPlaced = false;
  modelsLoadedCount = 0;
  miniSplitModel = null;
  coolModel = null;
  heatModel = null;
  modeModel = null;
  controlModel = null;
  anchorGroup = null;
  originalMaterials = [];
  controlMeshes.length = 0;
  tempSprite = null;
  controlTempSprite = null;
  miniMixer = null;
  miniAnimations = [];
  coolMixer = null;
  coolAnimations = [];
  heatMixer = null;
  heatAnimations = [];
  modeMixer = null;
  modeAnimations = [];
  controlMixer = null;
  controlAnimations = [];
  entranceActive = false;

  // Reset UI
  document.getElementById('overlay').classList.add('hidden');
  document.getElementById('splash').classList.remove('hidden');
  document.getElementById('instructions').textContent = 'Cargando modelos...';

  // Remove fade-in classes so animation can play again
  const fadeElements = document.querySelectorAll('.fade-in-element');
  fadeElements.forEach(el => {
    el.classList.remove('fade-in-element', 'visible');
  });
}

// ════════════════════════════════════════════════════════════
// HTML overlay update
// ════════════════════════════════════════════════════════════
function updateUI() {
  const statusEl = document.getElementById('status-value');
  const modeEl = document.getElementById('mode-value');
  const tempEl = document.getElementById('temp-value');

  statusEl.textContent = state.power ? 'Encendido' : 'Apagado';
  statusEl.className = 'value ' + (state.power ? 'on' : 'off');
  
  // Update mode display with proper priority
  if (state.heatMode) {
    modeEl.textContent = 'Calor';
    modeEl.className = 'value heat-mode';
  } else if (state.mode === 'fan') {
    modeEl.textContent = 'Ventilador';
    modeEl.className = 'value fan-mode';
  } else {
    modeEl.textContent = 'Frío';
    modeEl.className = 'value cool-mode';
  }
  
  tempEl.textContent = state.temperature + '°C';
}

// ════════════════════════════════════════════════════════════
// Render loop
// ════════════════════════════════════════════════════════════
function render() {
  const delta = clock.getDelta();
  if (miniMixer) miniMixer.update(delta);
  if (coolMixer) coolMixer.update(delta);
  if (heatMixer) heatMixer.update(delta);
  if (modeMixer) modeMixer.update(delta);
  if (controlMixer) controlMixer.update(delta);
  updateEntranceEffect();
  orbitControls.update();
  updateConnectingLines();
  composer.render();
}

// ════════════════════════════════════════════════════════════
// Connecting lines from control model to HTML buttons
// ════════════════════════════════════════════════════════════
function updateConnectingLines() {
  if (!controlModel || !modelsPlaced || !anchorGroup) return;

  const svg = document.getElementById('connecting-lines');
  if (!svg) return;

  // Map to actual GLB button objects by name
  const glbNames = ['ON', 'MODE', 'COOL', 'HEAT'];
  const lineIds  = ['line-power', 'line-mode', 'line-temp', 'line-heat'];
  const dotIds   = ['dot-power',  'dot-mode',  'dot-temp',  'dot-heat'];
  const btnIds   = ['btn-power',  'btn-mode',  'btn-temp',  'btn-heat'];

  for (let i = 0; i < 4; i++) {
    const obj = controlModel.getObjectByName(glbNames[i]);
    if (!obj) continue;

    // Get world position of the actual GLB button
    const worldPos = new THREE.Vector3();
    obj.getWorldPosition(worldPos);
    worldPos.project(camera);

    const sx = (worldPos.x * 0.5 + 0.5) * window.innerWidth;
    const sy = (-worldPos.y * 0.5 + 0.5) * window.innerHeight;

    const btn = document.getElementById(btnIds[i]);
    if (!btn) continue;
    const rect = btn.getBoundingClientRect();
    const bx = rect.left + rect.width / 2;
    const by = rect.top;

    const line = document.getElementById(lineIds[i]);
    if (line) {
      line.setAttribute('x1', sx);
      line.setAttribute('y1', sy);
      line.setAttribute('x2', bx);
      line.setAttribute('y2', by);
    }

    const dot = document.getElementById(dotIds[i]);
    if (dot) {
      dot.setAttribute('cx', sx);
      dot.setAttribute('cy', sy);
    }
  }
}

// ════════════════════════════════════════════════════════════
// Window resize
// ════════════════════════════════════════════════════════════
function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
}

// ════════════════════════════════════════════════════════════
// Utility: text sprite from canvas
// ════════════════════════════════════════════════════════════
function createTextSprite(text, options = {}) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  canvas.width = options.canvasWidth || 512;
  canvas.height = options.canvasHeight || 128;

  ctx.fillStyle = options.bgColor || 'rgba(0, 0, 0, 0.75)';
  roundRect(ctx, 4, 4, canvas.width - 8, canvas.height - 8, 20);

  ctx.fillStyle = options.textColor || '#ffffff';
  ctx.font = options.font || 'bold 52px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;

  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false
  });

  const sprite = new THREE.Sprite(material);
  sprite.scale.set(options.scaleX || 0.3, options.scaleY || 0.08, 1);
  return sprite;
}

function createTextMesh(text, options = {}) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  canvas.width = options.canvasWidth || 512;
  canvas.height = options.canvasHeight || 128;

  // Clear canvas to fully transparent
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Only draw background if not fully transparent
  const bg = options.bgColor || 'rgba(0, 0, 0, 0.75)';
  if (bg !== 'rgba(0, 0, 0, 0)') {
    ctx.fillStyle = bg;
    roundRect(ctx, 4, 4, canvas.width - 8, canvas.height - 8, 20);
  }

  ctx.fillStyle = options.textColor || '#ffffff';
  ctx.font = options.font || 'bold 52px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.premultiplyAlpha = false;
  texture.needsUpdate = true;

  const geo = new THREE.PlaneGeometry(options.scaleX || 0.3, options.scaleY || 0.08);
  const mat = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    alphaTest: 0.01,
    depthTest: false,
    side: THREE.DoubleSide
  });

  return new THREE.Mesh(geo, mat);
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  ctx.fill();
}

// ════════════════════════════════════════════════════════════
// Audio system (Web Audio API)
// ════════════════════════════════════════════════════════════
function initAudio() {
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  // Mobile browsers require explicit resume during user gesture
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
}

function ensureAudioResumed() {
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
}

function playButtonSound(type) {
  if (!audioCtx) return;
  ensureAudioResumed();

  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.connect(gain);
  gain.connect(audioCtx.destination);

  const now = audioCtx.currentTime;

  if (type === 'on') {
    // Rising two-tone
    osc.type = 'sine';
    osc.frequency.setValueAtTime(440, now);
    osc.frequency.linearRampToValueAtTime(880, now + 0.12);
    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
    osc.start(now);
    osc.stop(now + 0.25);
  } else if (type === 'off') {
    // Falling two-tone
    osc.type = 'sine';
    osc.frequency.setValueAtTime(660, now);
    osc.frequency.linearRampToValueAtTime(330, now + 0.18);
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
    osc.start(now);
    osc.stop(now + 0.25);
  } else if (type === 'click') {
    // Short click
    osc.type = 'square';
    osc.frequency.setValueAtTime(1200, now);
    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
    osc.start(now);
    osc.stop(now + 0.06);
  } else if (type === 'beep') {
    // Soft beep
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1047, now); // C6
    gain.gain.setValueAtTime(0.1, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
    osc.start(now);
    osc.stop(now + 0.1);
  }
}

// Wind sound for fan mode
function startWindSound() {
  if (!audioCtx) return;
  ensureAudioResumed();
  
  // Stop any existing wind sound before starting new one
  if (windNoise) {
    stopWindSound();
  }

  // Create white noise using ScriptProcessorNode
  const bufferSize = 4096;
  windNoise = audioCtx.createScriptProcessor(bufferSize, 1, 1);
  windNoise.onaudioprocess = (e) => {
    const output = e.outputBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1; // White noise
    }
  };

  // Create gain node for volume control
  windGainNode = audioCtx.createGain();
  windGainNode.gain.value = 0; // Start at 0 for fade-in
  
  // Schedule fade-in from 0 to 0.4 over 1 second
  const now = audioCtx.currentTime;
  windGainNode.gain.setValueAtTime(0, now);
  windGainNode.gain.linearRampToValueAtTime(0.4, now + 1.0);

  // Create filter to shape the noise (low-pass for wind-like sound)
  const filter = audioCtx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 800; // Low frequency for wind
  filter.Q.value = 1;

  // Connect the nodes
  windNoise.connect(filter);
  filter.connect(windGainNode);
  windGainNode.connect(audioCtx.destination);

  // Start the noise
  windNoise.start();
}

function stopWindSound() {
  if (!windNoise) return;
  
  // Immediate cleanup to prevent multiple instances
  if (windNoise) {
    windNoise.disconnect();
    windNoise = null;
  }
  if (windGainNode) {
    windGainNode.disconnect();
    windGainNode = null;
  }
  windSoundSource = null;
}

// Cold air sound for cool mode
function startColdAirSound() {
  if (!audioCtx || coldAirSoundSource) return;
  ensureAudioResumed();

  // Create white noise using ScriptProcessorNode
  const bufferSize = 4096;
  coldAirNoise = audioCtx.createScriptProcessor(bufferSize, 1, 1);
  coldAirNoise.onaudioprocess = (e) => {
    const output = e.outputBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1; // White noise
    }
  };

  // Create gain node for volume control
  coldAirGainNode = audioCtx.createGain();
  coldAirGainNode.gain.value = 0.28; // Higher volume for exterior wind

  // Create filters to shape the noise (exterior wind + snow texture)
  const filter1 = audioCtx.createBiquadFilter();
  filter1.type = 'lowpass';
  filter1.frequency.value = 1200; // Lower frequency for wind
  filter1.Q.value = 1;

  const filter2 = audioCtx.createBiquadFilter();
  filter2.type = 'bandpass';
  filter2.frequency.value = 800; // Mid frequency for snow texture
  filter2.Q.value = 2;

  // Add a subtle high-frequency component for snow sparkle
  const filter3 = audioCtx.createBiquadFilter();
  filter3.type = 'highpass';
  filter3.frequency.value = 3000; // High frequency for snow particles
  filter3.Q.value = 1;

  // Connect the nodes
  coldAirNoise.connect(filter1);
  coldAirNoise.connect(filter3); // Direct high-frequency snow component
  filter1.connect(filter2);
  filter2.connect(coldAirGainNode);
  filter3.connect(coldAirGainNode); // Mix snow sparkle with main sound
  coldAirGainNode.connect(audioCtx.destination);

  // Start the noise
  coldAirNoise.start();
}

function stopColdAirSound() {
  if (!coldAirSoundSource && !coldAirNoise) return;
  
  // Fade out smoothly
  if (coldAirGainNode) {
    coldAirGainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.4);
    setTimeout(() => {
      if (coldAirNoise) {
        coldAirNoise.disconnect();
        coldAirNoise = null;
      }
      if (coldAirGainNode) {
        coldAirGainNode.disconnect();
        coldAirGainNode = null;
      }
      coldAirSoundSource = null;
    }, 500);
  } else {
    // Immediate cleanup if no gain node
    if (coldAirNoise) {
      coldAirNoise.disconnect();
      coldAirNoise = null;
    }
    if (coldAirGainNode) {
      coldAirGainNode.disconnect();
      coldAirGainNode = null;
    }
    coldAirSoundSource = null;
  }
}

function startMusic() {
  if (!audioCtx || musicPlaying) return;
  ensureAudioResumed();
  musicPlaying = true;
  document.getElementById('btn-music')?.classList.add('playing');
  document.getElementById('btn-music-ext')?.classList.add('playing');

  const master = audioCtx.createGain();
  master.gain.value = 0.5;
  master.connect(audioCtx.destination);

  // ── Compressor for glue ──
  const comp = audioCtx.createDynamicsCompressor();
  comp.threshold.value = -18;
  comp.ratio.value = 4;
  comp.connect(master);

  // ── Sub-bass pulse (sine, rhythmic sidechain feel) ──
  const bassGain = audioCtx.createGain();
  bassGain.gain.value = 0.35;
  bassGain.connect(comp);
  const bassFilter = audioCtx.createBiquadFilter();
  bassFilter.type = 'lowpass';
  bassFilter.frequency.value = 120;
  bassFilter.connect(bassGain);
  const bassOsc = audioCtx.createOscillator();
  bassOsc.type = 'sine';
  bassOsc.frequency.value = 55;
  bassOsc.connect(bassFilter);
  bassOsc.start();
  musicNodes.push(bassOsc);
  // Pulse the bass gain at ~120 BPM (2 Hz)
  const bassLfo = audioCtx.createOscillator();
  const bassLfoGain = audioCtx.createGain();
  bassLfo.type = 'square';
  bassLfo.frequency.value = 2;
  bassLfoGain.gain.value = 0.2;
  bassLfo.connect(bassLfoGain);
  bassLfoGain.connect(bassGain.gain);
  bassLfo.start();
  musicNodes.push(bassLfo);

  // ── Arpeggiator (sequenced, filtered saw) ──
  const arpGain = audioCtx.createGain();
  arpGain.gain.value = 0.12;
  arpGain.connect(comp);
  const arpFilter = audioCtx.createBiquadFilter();
  arpFilter.type = 'bandpass';
  arpFilter.frequency.value = 1500;
  arpFilter.Q.value = 2;
  arpFilter.connect(arpGain);
  // Sweep arp filter
  const arpLfo = audioCtx.createOscillator();
  const arpLfoG = audioCtx.createGain();
  arpLfo.type = 'sine';
  arpLfo.frequency.value = 0.15;
  arpLfoG.gain.value = 800;
  arpLfo.connect(arpLfoG);
  arpLfoG.connect(arpFilter.frequency);
  arpLfo.start();
  musicNodes.push(arpLfo);

  const arpNotes = [220, 330, 440, 523.25, 440, 330]; // Am arpeggio
  let arpIdx = 0;
  const arpOsc = audioCtx.createOscillator();
  arpOsc.type = 'sawtooth';
  arpOsc.frequency.value = arpNotes[0];
  arpOsc.connect(arpFilter);
  arpOsc.start();
  musicNodes.push(arpOsc);

  const arpInterval = setInterval(() => {
    if (!musicPlaying) return;
    arpIdx = (arpIdx + 1) % arpNotes.length;
    arpOsc.frequency.setTargetAtTime(arpNotes[arpIdx], audioCtx.currentTime, 0.02);
  }, 125); // 16th notes at ~120 BPM
  musicNodes._arpInterval = arpInterval;

  // ── Hi-hat (filtered noise bursts) ──
  const hatGain = audioCtx.createGain();
  hatGain.gain.value = 0;
  hatGain.connect(comp);
  const hatFilter = audioCtx.createBiquadFilter();
  hatFilter.type = 'highpass';
  hatFilter.frequency.value = 8000;
  hatFilter.connect(hatGain);
  // White noise via buffer
  const noiseLen = audioCtx.sampleRate * 2;
  const noiseBuf = audioCtx.createBuffer(1, noiseLen, audioCtx.sampleRate);
  const noiseData = noiseBuf.getChannelData(0);
  for (let i = 0; i < noiseLen; i++) noiseData[i] = Math.random() * 2 - 1;
  const noiseSrc = audioCtx.createBufferSource();
  noiseSrc.buffer = noiseBuf;
  noiseSrc.loop = true;
  noiseSrc.connect(hatFilter);
  noiseSrc.start();
  musicNodes.push(noiseSrc);

  // Schedule hi-hat pattern
  const hatPattern = [0.06, 0.02, 0.06, 0.02, 0.06, 0.04, 0.06, 0.02];
  let hatStep = 0;
  const hatInterval = setInterval(() => {
    if (!musicPlaying) return;
    const vol = hatPattern[hatStep % hatPattern.length];
    const t = audioCtx.currentTime;
    hatGain.gain.setValueAtTime(vol, t);
    hatGain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    hatStep++;
  }, 125);
  musicNodes._hatInterval = hatInterval;

  // ── Evolving pad (detuned saws through LP filter with slow LFO) ──
  const padGain = audioCtx.createGain();
  padGain.gain.value = 0.06;
  padGain.connect(comp);
  const padFilter = audioCtx.createBiquadFilter();
  padFilter.type = 'lowpass';
  padFilter.frequency.value = 400;
  padFilter.Q.value = 3;
  padFilter.connect(padGain);
  const padLfo = audioCtx.createOscillator();
  const padLfoG = audioCtx.createGain();
  padLfo.type = 'sine';
  padLfo.frequency.value = 0.06;
  padLfoG.gain.value = 250;
  padLfo.connect(padLfoG);
  padLfoG.connect(padFilter.frequency);
  padLfo.start();
  musicNodes.push(padLfo);

  [110, 164.81, 220, 329.63].forEach((freq) => {
    const o1 = audioCtx.createOscillator();
    o1.type = 'sawtooth';
    o1.frequency.value = freq;
    o1.detune.value = (Math.random() - 0.5) * 15;
    o1.connect(padFilter);
    o1.start();
    musicNodes.push(o1);
    const o2 = audioCtx.createOscillator();
    o2.type = 'sawtooth';
    o2.frequency.value = freq * 1.003;
    o2.connect(padFilter);
    o2.start();
    musicNodes.push(o2);
  });

  musicNodes.push(master, comp, bassGain, bassFilter, bassLfoGain,
    arpGain, arpFilter, arpLfoG, hatGain, hatFilter,
    padGain, padFilter, padLfoG);
}

function stopMusic() {
  musicPlaying = false;
  document.getElementById('btn-music')?.classList.remove('playing');
  document.getElementById('btn-music-ext')?.classList.remove('playing');

  // Clear sequencer intervals
  if (musicNodes._arpInterval) clearInterval(musicNodes._arpInterval);
  if (musicNodes._hatInterval) clearInterval(musicNodes._hatInterval);

  musicNodes.forEach((node) => {
    try { node.stop?.(); } catch (_) { /* already stopped */ }
    try { node.disconnect(); } catch (_) { /* ok */ }
  });
  musicNodes = [];
}

function toggleMusic() {
  if (musicPlaying) {
    stopMusic();
  } else {
    startMusic();
  }
}

// ════════════════════════════════════════════════════════════
// External equipment experience
// ════════════════════════════════════════════════════════════
function startExternalExperience() {
  document.getElementById('splash').classList.add('hidden');
  document.getElementById('overlay-external').classList.remove('hidden');

  initAudio();

  // Init scene
  extScene = new THREE.Scene();

  // Gradient background
  const bgCanvas = document.createElement('canvas');
  bgCanvas.width = 2;
  bgCanvas.height = 512;
  const bgCtx = bgCanvas.getContext('2d');
  const grad = bgCtx.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0, '#84b2d7ff');
  grad.addColorStop(0.3, '#689acfff');
  grad.addColorStop(0.7, '#1b4584');
  grad.addColorStop(1, '#030c1a');
  bgCtx.fillStyle = grad;
  bgCtx.fillRect(0, 0, 2, 512);
  extScene.background = new THREE.CanvasTexture(bgCanvas);

  extCamera = new THREE.PerspectiveCamera(
    60,
    window.innerWidth / window.innerHeight,
    0.01,
    50
  );
  extCamera.position.set(0, -0.45, 2.2);

  extRenderer = new THREE.WebGLRenderer({ antialias: true });
  extRenderer.setPixelRatio(window.devicePixelRatio);
  extRenderer.setSize(window.innerWidth, window.innerHeight);
  extRenderer.outputColorSpace = THREE.SRGBColorSpace;
  extRenderer.shadowMap.enabled = true;
  extRenderer.shadowMap.type = THREE.PCFSoftShadowMap;
  document.getElementById('container').appendChild(extRenderer.domElement);

  // Lighting
  extScene.add(new THREE.HemisphereLight(0xffffff, 0xbbbbff, 1.5));
  const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
  dirLight.position.set(1, 2, 1.5);
  dirLight.castShadow = true;
  dirLight.shadow.mapSize.width = 1024;
  dirLight.shadow.mapSize.height = 1024;
  dirLight.shadow.camera.near = 0.1;
  dirLight.shadow.camera.far = 10;
  dirLight.shadow.camera.left = -2;
  dirLight.shadow.camera.right = 2;
  dirLight.shadow.camera.top = 2;
  dirLight.shadow.camera.bottom = -2;
  extScene.add(dirLight);
  const dirLight2 = new THREE.DirectionalLight(0xffffff, 0.6);
  dirLight2.position.set(-1, 0.5, -1);
  extScene.add(dirLight2);

  // Bloom post-processing
  extComposer = new EffectComposer(extRenderer);
  extComposer.addPass(new RenderPass(extScene, extCamera));
  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.6, 0.5, 0.7
  );
  extComposer.addPass(bloomPass);

  // OrbitControls
  extOrbitControls = new OrbitControls(extCamera, extRenderer.domElement);
  extOrbitControls.enableDamping = true;
  extOrbitControls.dampingFactor = 0.08;
  extOrbitControls.target.set(0, -0.4, 0);
  extOrbitControls.minDistance = 0.8;
  extOrbitControls.maxDistance = 5;
  extOrbitControls.maxPolarAngle = Math.PI * 0.85;
  extOrbitControls.update();

  // Shadow floor
  const floorGeo = new THREE.PlaneGeometry(4, 4);
  const floorMat = new THREE.ShadowMaterial({ opacity: 0.35 });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, -0.85, 0);
  floor.receiveShadow = true;
  extScene.add(floor);

  // Load externo.glb
  const loader = new GLTFLoader();
  loader.load(
    'models/externo.glb',
    (gltf) => {
      extModel = gltf.scene;
      extModel.scale.set(0.175, 0.175, 0.175);
      extModel.position.set(0, -0.85, 0);

      // Start with model invisible for fade-in
      extModel.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.material = child.material.clone();
          child.material.transparent = true;
          child.material.opacity = 0;
        }
      });

      extScene.add(extModel);

      // Fade in over 2 seconds
      const fadeDuration = 1500; // 1 seconds
      const startTime = Date.now();
      
      function fadeIn() {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / fadeDuration, 1);
        
        extModel.traverse((child) => {
          if (child.isMesh && child.material.transparent) {
            child.material.opacity = progress;
          }
        });
        
        if (progress < 1) {
          requestAnimationFrame(fadeIn);
        }
      }
      
      fadeIn();

      // Auto-play all animations in loop
      if (gltf.animations && gltf.animations.length > 0) {
        extMixer = new THREE.AnimationMixer(extModel);
        gltf.animations.forEach((clip) => {
          const action = extMixer.clipAction(clip);
          action.setLoop(THREE.LoopRepeat);
          action.play();
        });
      }

      console.log('External model loaded (externo.glb)');
    },
    undefined,
    (err) => console.error('Error loading externo.glb:', err)
  );

  extActive = true;
  extClock = new THREE.Clock();
  extRenderer.setAnimationLoop(renderExternal);

  // Wire buttons
  document.getElementById('btn-back-splash').addEventListener('click', stopExternalExperience);
  document.getElementById('btn-music-ext').addEventListener('click', toggleMusic);

  // Resize handler
  window.addEventListener('resize', onExtWindowResize);

  // Show 80.png image after 2 seconds with fade-in
  setTimeout(() => {
    const badge = document.getElementById('external-badge');
    if (badge) {
      badge.classList.add('show');
    }
  }, 2000);

  
  startMusic();
}

function renderExternal() {
  const delta = extClock.getDelta();
  if (extMixer) extMixer.update(delta);
  extOrbitControls.update();
  extComposer.render();
}

function onExtWindowResize() {
  if (!extActive) return;
  extCamera.aspect = window.innerWidth / window.innerHeight;
  extCamera.updateProjectionMatrix();
  extRenderer.setSize(window.innerWidth, window.innerHeight);
  extComposer.setSize(window.innerWidth, window.innerHeight);
}

function stopExternalExperience() {
  extActive = false;

  // Stop music
  if (musicPlaying) stopMusic();

  // Stop render loop
  if (extRenderer) extRenderer.setAnimationLoop(null);

  // Stop animations
  if (extMixer) extMixer.stopAllAction();

  // Remove model from scene
  if (extModel && extScene) extScene.remove(extModel);

  // Dispose renderer
  if (extRenderer) {
    extRenderer.dispose();
    const container = document.getElementById('container');
    if (container && extRenderer.domElement.parentNode === container) {
      container.removeChild(extRenderer.domElement);
    }
  }

  // Clean up
  extScene = null;
  extCamera = null;
  extRenderer = null;
  extOrbitControls = null;
  extComposer = null;
  extModel = null;
  extMixer = null;

  window.removeEventListener('resize', onExtWindowResize);

  // Hide 80.png image
  const badge = document.getElementById('external-badge');
  if (badge) {
    badge.classList.remove('show');
  }

  // Show splash
  document.getElementById('overlay-external').classList.add('hidden');
  document.getElementById('splash').classList.remove('hidden');
}

function startInternalExperience() {
  document.getElementById('splash').classList.add('hidden');
  document.getElementById('overlay-internal').classList.remove('hidden');

  // Init audio context if not already done
  if (!audioCtx) initAudio();

  // Create scene
  intScene = new THREE.Scene();

  // Create gradient background (same as external)
  const bgCanvas = document.createElement('canvas');
  bgCanvas.width = 2;
  bgCanvas.height = 512;
  const bgCtx = bgCanvas.getContext('2d');
  const grad = bgCtx.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0, '#84b2d7ff');
  grad.addColorStop(0.3, '#689acfff');
  grad.addColorStop(0.7, '#1b4584');
  grad.addColorStop(1, '#030c1a');
  bgCtx.fillStyle = grad;
  bgCtx.fillRect(0, 0, 2, 512);
  intScene.background = new THREE.CanvasTexture(bgCanvas);

  // Camera (same as external)
  intCamera = new THREE.PerspectiveCamera(
    60,
    window.innerWidth / window.innerHeight,
    0.01,
    50
  );
  intCamera.position.set(0, -0.45, 2.2);

  // Renderer
  intRenderer = new THREE.WebGLRenderer({ antialias: true });
  intRenderer.setSize(window.innerWidth, window.innerHeight);
  intRenderer.setPixelRatio(window.devicePixelRatio);
  intRenderer.outputColorSpace = THREE.SRGBColorSpace;
  intRenderer.shadowMap.enabled = true;
  intRenderer.shadowMap.type = THREE.PCFSoftShadowMap;
  document.getElementById('overlay-internal').appendChild(intRenderer.domElement);

  // OrbitControls (same as external)
  intOrbitControls = new OrbitControls(intCamera, intRenderer.domElement);
  intOrbitControls.enableDamping = true;
  intOrbitControls.dampingFactor = 0.08;
  intOrbitControls.target.set(0, -0.4, 0);
  intOrbitControls.minDistance = 0.8;
  intOrbitControls.maxDistance = 5;
  intOrbitControls.maxPolarAngle = Math.PI * 0.85;
  intOrbitControls.update();

  // Lighting (same as external)
  intScene.add(new THREE.HemisphereLight(0xffffff, 0xbbbbff, 1.5));
  const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
  dirLight.position.set(1, 2, 1.5);
  dirLight.castShadow = true;
  dirLight.shadow.mapSize.width = 1024;
  dirLight.shadow.mapSize.height = 1024;
  dirLight.shadow.camera.near = 0.1;
  dirLight.shadow.camera.far = 10;
  dirLight.shadow.camera.left = -2;
  dirLight.shadow.camera.right = 2;
  dirLight.shadow.camera.top = 2;
  dirLight.shadow.camera.bottom = -2;
  intScene.add(dirLight);
  const dirLight2 = new THREE.DirectionalLight(0xffffff, 0.6);
  dirLight2.position.set(-1, 0.5, -1);
  intScene.add(dirLight2);

  // Additional blue lights for internal section
  const blueLightLeft = new THREE.DirectionalLight(0x4169e1, 0.8);
  blueLightLeft.position.set(-3, 1, 0);
  intScene.add(blueLightLeft);

  const blueLightRight = new THREE.DirectionalLight(0x4169e1, 0.8);
  blueLightRight.position.set(3, 1, 0);
  intScene.add(blueLightRight);

  // Bloom post-processing (same as external)
  intComposer = new EffectComposer(intRenderer);
  intComposer.addPass(new RenderPass(intScene, intCamera));
  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.6, 0.5, 0.7
  );
  intComposer.addPass(bloomPass);

  // Shadow floor
  const floorGeo = new THREE.PlaneGeometry(4, 4);
  const floorMat = new THREE.ShadowMaterial({ opacity: 0.35 });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, -0.95, 0);
  floor.receiveShadow = true;
  intScene.add(floor);

  // Load miniDes.glb
  const loader = new GLTFLoader();
  loader.load(
    'models/miniDes.glb',
    (gltf) => {
      console.log('miniDes.glb loaded successfully');
      console.log('Scene:', gltf.scene);
      console.log('Animations:', gltf.animations);
      
      intModel = gltf.scene;
      intModel.scale.set(1.75, 1.75, 1.75);
      intModel.position.set(0, -0.7, 0);

      // Debug and fix textures
      intModel.traverse((child) => {
        if (child.isMesh) {
          console.log('Mesh found:', child.name, 'Material:', child.material);
          
          // Check for texture issues
          if (child.material) {
            if (child.material.map) {
              console.log('Texture map found for', child.name, ':', child.material.map);
              child.material.map.needsUpdate = true;
            }
            if (child.material.normalMap) {
              console.log('Normal map found for', child.name);
              child.material.normalMap.needsUpdate = true;
            }
            if (child.material.roughnessMap) {
              console.log('Roughness map found for', child.name);
              child.material.roughnessMap.needsUpdate = true;
            }
            if (child.material.metalnessMap) {
              console.log('Metalness map found for', child.name);
              child.material.metalnessMap.needsUpdate = true;
            }
            
            // Ensure proper material properties
            child.material.needsUpdate = true;
            child.material.transparent = true;
            child.material.opacity = 0; // Start invisible for fade-in
            child.castShadow = true;
            child.receiveShadow = true;
            
            // Clone material to avoid conflicts
            child.material = child.material.clone();
          }
        }
      });

      intScene.add(intModel);

      // Fade in over 2 seconds
      const fadeDuration = 2000; // 2 seconds
      const startTime = Date.now();
      
      function fadeIn() {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / fadeDuration, 1);
        
        intModel.traverse((child) => {
          if (child.isMesh && child.material.transparent) {
            child.material.opacity = progress;
          }
        });
        
        if (progress < 1) {
          requestAnimationFrame(fadeIn);
        }
      }
      
      fadeIn();

      // Auto-play all animations in loop
      if (gltf.animations && gltf.animations.length > 0) {
        intMixer = new THREE.AnimationMixer(intModel);
        gltf.animations.forEach((clip) => {
          const action = intMixer.clipAction(clip);
          action.setLoop(THREE.LoopRepeat);
          action.play();
        });
      }

      console.log('Internal model loaded (miniDes.glb) with textures checked');
    },
    (progress) => {
      console.log('Loading progress:', (progress.loaded / progress.total * 100) + '%');
    },
    (err) => {
      console.error('Error loading miniDes.glb:', err);
      console.error('Detailed error:', err.message || err);
      if (err.stack) console.error('Stack trace:', err.stack);
    }
  );

  intActive = true;
  intClock = new THREE.Clock();
  intRenderer.setAnimationLoop(renderInternal);

  // Wire buttons
  document.getElementById('btn-back-splash-internal').addEventListener('click', stopInternalExperience);
  document.getElementById('btn-music-internal').addEventListener('click', toggleMusic);

  // Resize handler
  window.addEventListener('resize', onIntWindowResize);

  startMusic();
}

function renderInternal() {
  const delta = intClock.getDelta();
  if (intMixer) intMixer.update(delta);
  intOrbitControls.update();
  intComposer.render();
}

function onIntWindowResize() {
  if (!intCamera || !intRenderer) return;
  intCamera.aspect = window.innerWidth / window.innerHeight;
  intCamera.updateProjectionMatrix();
  intRenderer.setSize(window.innerWidth, window.innerHeight);
  if (intComposer) intComposer.setSize(window.innerWidth, window.innerHeight);
}

function stopInternalExperience() {
  intActive = false;

  // Stop music
  if (musicPlaying) stopMusic();

  // Stop and reset animations
  if (intMixer) {
    intMixer.stopAllAction();
    intMixer = null;
  }

  // Stop render loop
  if (intRenderer) intRenderer.setAnimationLoop(null);

  // Remove canvas from DOM so a fresh one is created on re-entry
  if (intRenderer && intRenderer.domElement && intRenderer.domElement.parentNode) {
    intRenderer.domElement.parentNode.removeChild(intRenderer.domElement);
  }

  // Dispose Three.js objects
  if (intScene) {
    intScene.traverse((child) => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (Array.isArray(child.material)) {
          child.material.forEach(mat => mat.dispose());
        } else {
          child.material.dispose();
        }
      }
    });
  }

  // Clean up
  intScene = null;
  intCamera = null;
  intRenderer = null;
  intOrbitControls = null;
  intComposer = null;
  intModel = null;

  window.removeEventListener('resize', onIntWindowResize);

  // Show splash
  document.getElementById('overlay-internal').classList.add('hidden');
  document.getElementById('splash').classList.remove('hidden');
}
