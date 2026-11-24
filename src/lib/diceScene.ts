import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import * as CANNON from "cannon-es";
import {
  buildDieBlueprint,
  BuiltDieBlueprint,
  DICE_FINISHES,
  DiceFinishId,
  DieKind,
  disposeDieBlueprint,
  getDieFlatness,
  readLandedDieValue,
} from "./diceGeometry";
import { diceAudio } from "./diceAudio";
import {
  cryptoMinimumSpinVector,
  cryptoRandomFloat,
  cryptoRandomRange,
  cryptoUniformQuaternion,
  DEFAULT_DICE_SETTINGS,
  DiceTraySettings,
  drawCryptoFaceValue,
  findSymmetryRotation,
  getPolyhedronSymmetryGroup,
} from "./diceRandomness";

export interface RollDieRequest {
  id: string;
  kind: DieKind;
  groupId: string; // links d100 tens + ones pair together
  accentFinish?: DiceFinishId;
}

export interface LandedDieResult {
  id: string;
  kind: DieKind;
  groupId: string;
  value: number;
}

export interface TrayInteractionEvent {
  kind:
    | "reroll-die"
    | "grab-die"
    | "toss-die"
    | "toss-all"
    | "cancel-grab"
    | "hover-die";
  groupId?: string | null;
  concealed?: boolean;
  throwDir?: { x: number; z: number };
}

interface ActiveDie {
  id: string;
  kind: DieKind;
  groupId: string;
  finishId: DiceFinishId;
  blueprint: BuiltDieBlueprint;
  mesh: THREE.Mesh;
  body: CANNON.Body;
  settledFrames: number;
  cockedFrames: number;
  nudgeCount: number;
  settled: boolean;
  concealed: boolean;
  dropped: boolean;
}

interface DragSample {
  x: number;
  z: number;
  t: number;
}

type PointerSession =
  | {
      mode: "pending-die";
      pointerId: number;
      die: ActiveDie;
      startX: number;
      startY: number;
      holdTimer: number;
    }
  | {
      mode: "dragging-die";
      pointerId: number;
      die: ActiveDie;
      targetX: number;
      targetZ: number;
      samples: DragSample[];
      originPos: { x: number; y: number; z: number };
      originQuat: { x: number; y: number; z: number; w: number };
      wasConcealed: boolean;
    }
  | {
      mode: "felt-gesture";
      pointerId: number;
      startX: number;
      startY: number;
    };

interface ReturningDieState {
  die: ActiveDie;
  targetPos: THREE.Vector3;
  targetQuat: THREE.Quaternion;
  elapsed: number;
}

interface HybridDieTrack {
  die: ActiveDie;
  // Packed Float32Array: 7 floats per keyframe (px, py, pz, qx, qy, qz, qw)
  frames: Float32Array;
  targetValue: number;
}

interface HybridImpactCue {
  simTime: number;
  impact: number;
  surface: "felt" | "wood" | "die";
  pan: number;
}

interface HybridPlayback {
  tracks: HybridDieTrack[];
  frameCount: number;
  frameDt: number;
  duration: number;
  elapsed: number;
  cues: HybridImpactCue[];
  nextCueIdx: number;
}

interface InitialBodyKinematics {
  pos: { x: number; y: number; z: number };
  quat: { x: number; y: number; z: number; w: number };
  vel: { x: number; y: number; z: number };
  angVel: { x: number; y: number; z: number };
}

const TRAY_HALF_W = 5.6;
const TRAY_HALF_D = 3.5;
const RAIL_THICKNESS = 0.56;
// Milled 52° beveled inner cove + chamfered corners: geometrically prevents dice from leaning or wedging on walls
const BEVEL_RUN = 0.62;
const BEVEL_ANGLE_RAD = (52 * Math.PI) / 180;
const BEVEL_RISE = BEVEL_RUN * Math.tan(BEVEL_ANGLE_RAD);
const CORNER_CHAMFER = 0.42;
const DRAG_HOVER_Y = 2.0;
const MAX_SIM_SECONDS = 5.5;
const FIXED_TIME_STEP = 1 / 120;
const HYBRID_SIM_STEP = 1 / 90;
const HYBRID_FRAME_DT = HYBRID_SIM_STEP;
const PREWARM_DIE_ORDER: DieKind[] = [
  "d20",
  "d6",
  "d8",
  "d4",
  "d10",
  "d12",
  "d10_tens",
];

// Pre-allocated scratch helpers (zero GC inside animation loop)
const _quat = new THREE.Quaternion();
const _quatA = new THREE.Quaternion();
const _quatB = new THREE.Quaternion();
const _quatDelta = new THREE.Quaternion();
const _alignQuat = new THREE.Quaternion();
const _bottomNormal = new THREE.Vector3();
const _downVec = new THREE.Vector3(0, -1, 0);
const _torqueAxis = new THREE.Vector3();
const _raycaster = new THREE.Raycaster();
const _pointerNdc = new THREE.Vector2();
const _dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -DRAG_HOVER_Y);
const _planeHit = new THREE.Vector3();
const _tiltQuat = new THREE.Quaternion();
const _tiltEuler = new THREE.Euler();
const _tmpQuatRand = new THREE.Quaternion();

function detectSoftwareWebGL(): boolean {
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2");
    if (!gl) return true;
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) || "");
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

function createFeltTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = "#1E302C";
  ctx.fillRect(0, 0, size, size);

  // Subtle woven archival felt grain
  const img = ctx.getImageData(0, 0, size, size);
  const data = img.data;
  for (let i = 0; i < data.length; i += 4) {
    const n = (Math.random() - 0.5) * 14;
    data[i] = Math.min(255, Math.max(0, data[i] + n));
    data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + n));
    data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + n));
  }
  ctx.putImageData(img, 0, 0);

  // Subtle diagonal twill weave
  ctx.strokeStyle = "rgba(255,255,255,0.025)";
  ctx.lineWidth = 1;
  for (let x = -size; x < size * 2; x += 6) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + size, size);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 2);
  tex.anisotropy = maxAnisotropy;
  tex.needsUpdate = true;
  return tex;
}

function createWalnutTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = "#3E2A1E";
  ctx.fillRect(0, 0, size, size);

  // Organic wood grain bands
  for (let y = 0; y < size; y += 2) {
    const wave =
      Math.sin(y * 0.045) * 10 +
      Math.sin(y * 0.13) * 4 +
      (Math.random() - 0.5) * 6;
    const tone = Math.round(wave);
    ctx.fillStyle = `rgb(${Math.max(25, Math.min(95, 62 + tone))}, ${Math.max(
      18,
      Math.min(70, 42 + Math.round(tone * 0.7))
    )}, ${Math.max(12, Math.min(52, 30 + Math.round(tone * 0.5)))})`;
    ctx.fillRect(0, y, size, 2);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 1);
  tex.anisotropy = maxAnisotropy;
  tex.needsUpdate = true;
  return tex;
}

interface SimWorldBundle {
  world: CANNON.World;
  dieMaterial: CANNON.Material;
  feltMaterial: CANNON.Material;
  bevelMaterial: CANNON.Material;
  woodMaterial: CANNON.Material;
}

function createTrayPhysicsWorld(solverIterations = 12): SimWorldBundle {
  const solver = new CANNON.GSSolver();
  solver.iterations = solverIterations;
  const world = new CANNON.World({
    gravity: new CANNON.Vec3(0, -32, 0),
    solver,
  });
  world.allowSleep = true;
  world.broadphase = new CANNON.SAPBroadphase(world);

  const dieMaterial = new CANNON.Material("die");
  const feltMaterial = new CANNON.Material("felt");
  const bevelMaterial = new CANNON.Material("bevel");
  const woodMaterial = new CANNON.Material("wood");

  // Tactile wool felt & resin-on-resin friction for weighty rolling bite;
  // oiled walnut bevels & rails stay slick (0.0) so dice deflect cleanly off the 52° chutes.
  world.addContactMaterial(
    new CANNON.ContactMaterial(dieMaterial, feltMaterial, {
      friction: 0.54,
      restitution: 0.28,
      contactEquationStiffness: 1e7,
      contactEquationRelaxation: 3,
    })
  );
  world.addContactMaterial(
    new CANNON.ContactMaterial(dieMaterial, bevelMaterial, {
      friction: 0.0,
      restitution: 0.52,
      contactEquationStiffness: 1e7,
      contactEquationRelaxation: 3,
    })
  );
  world.addContactMaterial(
    new CANNON.ContactMaterial(dieMaterial, woodMaterial, {
      friction: 0.0,
      restitution: 0.58,
      contactEquationStiffness: 1e7,
      contactEquationRelaxation: 3,
    })
  );
  world.addContactMaterial(
    new CANNON.ContactMaterial(dieMaterial, dieMaterial, {
      friction: 0.14,
      restitution: 0.44,
      contactEquationStiffness: 1e7,
      contactEquationRelaxation: 3,
    })
  );

  // Seamless infinite physics floor plane at y = 0
  const floorBody = new CANNON.Body({
    type: CANNON.Body.STATIC,
    material: feltMaterial,
    shape: new CANNON.Plane(),
  });
  floorBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
  world.addBody(floorBody);

  // 4 outer containment walls aligned with the outer walnut rail inner faces
  const wallThick = 4.0;
  const wallFullH = 16.0;
  const wallCenterY = 6.0;
  const wallSpecs: Array<[number, number, number, number, number, number]> = [
    [
      TRAY_HALF_W * 2 + wallThick * 2,
      wallFullH,
      wallThick,
      0,
      wallCenterY,
      -(TRAY_HALF_D + wallThick / 2),
    ],
    [
      TRAY_HALF_W * 2 + wallThick * 2,
      wallFullH,
      wallThick,
      0,
      wallCenterY,
      TRAY_HALF_D + wallThick / 2,
    ],
    [
      wallThick,
      wallFullH,
      TRAY_HALF_D * 2 + wallThick * 2,
      -(TRAY_HALF_W + wallThick / 2),
      wallCenterY,
      0,
    ],
    [
      wallThick,
      wallFullH,
      TRAY_HALF_D * 2 + wallThick * 2,
      TRAY_HALF_W + wallThick / 2,
      wallCenterY,
      0,
    ],
  ];
  for (const [w, h, d, x, y, z] of wallSpecs) {
    const wall = new CANNON.Body({
      type: CANNON.Body.STATIC,
      material: woodMaterial,
      shape: new CANNON.Box(new CANNON.Vec3(w / 2, h / 2, d / 2)),
    });
    wall.position.set(x, y, z);
    world.addBody(wall);
  }

  // 4 angled 52° milled inner bevels + 4 chamfered 45° corner chutes (matched 1:1 with visuals)
  const cosT = Math.cos(BEVEL_ANGLE_RAD);
  const sinT = Math.sin(BEVEL_ANGLE_RAD);
  const rampLen = Math.hypot(BEVEL_RUN, BEVEL_RISE);
  const slabThick = 1.6;

  const addSideBevel = (length: number, axis: "x" | "z", sign: 1 | -1) => {
    const span = length + 2.0;
    const halfExtents =
      axis === "z"
        ? new CANNON.Vec3(span / 2, slabThick / 2, (rampLen + 1.2) / 2)
        : new CANNON.Vec3((rampLen + 1.2) / 2, slabThick / 2, span / 2);
    const bevel = new CANNON.Body({
      type: CANNON.Body.STATIC,
      material: bevelMaterial,
      shape: new CANNON.Box(halfExtents),
    });
    const edge = axis === "z" ? TRAY_HALF_D : TRAY_HALF_W;
    const midDist = edge - BEVEL_RUN / 2;
    const midY = BEVEL_RISE / 2;
    const cx = axis === "x" ? sign * midDist + sign * sinT * (slabThick / 2) : 0;
    const cz = axis === "z" ? sign * midDist + sign * sinT * (slabThick / 2) : 0;
    const cy = midY - cosT * (slabThick / 2);
    bevel.position.set(cx, cy, cz);
    if (axis === "z") {
      bevel.quaternion.setFromEuler(-sign * BEVEL_ANGLE_RAD, 0, 0);
    } else {
      bevel.quaternion.setFromEuler(0, 0, sign * BEVEL_ANGLE_RAD);
    }
    world.addBody(bevel);
  };

  addSideBevel(TRAY_HALF_W * 2, "z", 1);
  addSideBevel(TRAY_HALF_W * 2, "z", -1);
  addSideBevel(TRAY_HALF_D * 2, "x", 1);
  addSideBevel(TRAY_HALF_D * 2, "x", -1);

  const wIn = TRAY_HALF_W - BEVEL_RUN;
  const dIn = TRAY_HALF_D - BEVEL_RUN;
  for (const sx of [-1, 1] as const) {
    for (const sz of [-1, 1] as const) {
      const yaw = Math.atan2(sx, sz);
      const cornerBevel = new CANNON.Body({
        type: CANNON.Body.STATIC,
        material: bevelMaterial,
        shape: new CANNON.Box(
          new CANNON.Vec3(1.8, slabThick / 2, (rampLen + 1.4) / 2)
        ),
      });
      const nx = -sx * Math.SQRT1_2 * sinT;
      const ny = cosT;
      const nz = -sz * Math.SQRT1_2 * sinT;
      const midX =
        sx * (wIn - CORNER_CHAMFER / 2 + (BEVEL_RUN * Math.SQRT1_2) / 2);
      const midZ =
        sz * (dIn - CORNER_CHAMFER / 2 + (BEVEL_RUN * Math.SQRT1_2) / 2);
      const midY = BEVEL_RISE / 2;
      cornerBevel.position.set(
        midX - nx * (slabThick / 2),
        midY - ny * (slabThick / 2),
        midZ - nz * (slabThick / 2)
      );
      const qYaw = new CANNON.Quaternion();
      qYaw.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), yaw);
      const qPitch = new CANNON.Quaternion();
      qPitch.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -BEVEL_ANGLE_RAD);
      cornerBevel.quaternion = qYaw.mult(qPitch);
      world.addBody(cornerBevel);
    }
  }

  // Invisible containment lid high enough for natural toss arcs, well below wall top
  const ceiling = new CANNON.Body({
    type: CANNON.Body.STATIC,
    material: woodMaterial,
    shape: new CANNON.Plane(),
  });
  ceiling.quaternion.setFromEuler(Math.PI / 2, 0, 0);
  ceiling.position.set(0, 6.2, 0);
  world.addBody(ceiling);

  return { world, dieMaterial, feltMaterial, bevelMaterial, woodMaterial };
}

/**
 * Gentle gravity tip-over assist when a die nearly stalls while cocked on a bevel seam or edge.
 * Never activates on flat felt, preserving full tactile wool-felt grip while preventing frozen stalls.
 */
function applyTiltedSettleAssist(
  body: CANNON.Body,
  bp: BuiltDieBlueprint,
  linSpeedSq: number,
  angSpeedSq: number,
  bottomNormal: THREE.Vector3,
  dt: number
): void {
  if (
    linSpeedSq >= 0.16 ||
    angSpeedSq >= 0.3 ||
    Math.abs(body.velocity.y) >= 0.25
  ) {
    return;
  }

  if (body.sleepState === CANNON.Body.SLEEPING) {
    body.wakeUp();
  }

  _torqueAxis.crossVectors(bottomNormal, _downVec);
  const torqueScale = 16 * dt;
  body.angularVelocity.x += _torqueAxis.x * torqueScale;
  body.angularVelocity.y += _torqueAxis.y * torqueScale;
  body.angularVelocity.z += _torqueAxis.z * torqueScale;

  const bevelZoneX = TRAY_HALF_W - BEVEL_RUN - bp.radius * 0.9;
  const bevelZoneZ = TRAY_HALF_D - BEVEL_RUN - bp.radius * 0.9;
  if (Math.abs(body.position.x) > bevelZoneX) {
    body.velocity.x -= Math.sign(body.position.x) * 22 * dt;
  }
  if (Math.abs(body.position.z) > bevelZoneZ) {
    body.velocity.z -= Math.sign(body.position.z) * 22 * dt;
  }
}

function applyEmergencyBounds(body: CANNON.Body, restHeight: number): void {
  const emergencyMargin = restHeight * 0.72;
  const emergencyMaxX = TRAY_HALF_W - emergencyMargin;
  const emergencyMaxZ = TRAY_HALF_D - emergencyMargin;
  if (body.position.x > emergencyMaxX) {
    body.position.x = emergencyMaxX;
    body.velocity.x = -Math.abs(body.velocity.x) * 0.45;
  } else if (body.position.x < -emergencyMaxX) {
    body.position.x = -emergencyMaxX;
    body.velocity.x = Math.abs(body.velocity.x) * 0.45;
  }
  if (body.position.z > emergencyMaxZ) {
    body.position.z = emergencyMaxZ;
    body.velocity.z = -Math.abs(body.velocity.z) * 0.45;
  } else if (body.position.z < -emergencyMaxZ) {
    body.position.z = -emergencyMaxZ;
    body.velocity.z = Math.abs(body.velocity.z) * 0.45;
  }
  if (body.position.y > 5.8) {
    body.position.y = 5.8;
    body.velocity.y = -Math.abs(body.velocity.y) * 0.35;
  } else if (body.position.y < restHeight * 0.5) {
    body.position.y = restHeight * 0.5;
    body.velocity.y = Math.max(0, body.velocity.y);
  }
}

export class DiceTrayScene {
  private container: HTMLElement;
  private isSoftwareGl: boolean;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private envTex: THREE.Texture;
  private world: CANNON.World;
  private dieMaterial: CANNON.Material;
  private feltMaterial: CANNON.Material;
  private bevelMaterial: CANNON.Material;
  private woodMaterial: CANNON.Material;

  private activeDice: ActiveDie[] = [];
  private blueprintCache = new Map<string, BuiltDieBlueprint>();
  private prewarmTimerId: number | null = null;
  private disposableResources: Array<{ dispose: () => void }> = [];
  private finishId: DiceFinishId = "lapis";
  private settings: DiceTraySettings = { ...DEFAULT_DICE_SETTINGS };
  private maxAnisotropy = 4;

  private frameId = 0;
  private isRunningLoop = false;
  private simElapsed = 0;
  private lastTickMs = 0;
  private rollActive = false;
  private disposed = false;

  private renderBusy = false;
  private renderDirty = false;

  // Interactive hover, drag-and-toss, put-back return & Hybrid playback state
  private pointerSession: PointerSession | null = null;
  private hoveredDie: ActiveDie | null = null;
  private externalHoverGroupId: string | null = null;
  private lastHoverRaycastMs = 0;
  private returningDie: ReturningDieState | null = null;
  private hybridPlayback: HybridPlayback | null = null;

  private onSettledCallback: ((results: LandedDieResult[]) => void) | null =
    null;
  private onInteractionCallback:
    | ((ev: TrayInteractionEvent) => void)
    | null = null;

  private resizeObserver: ResizeObserver | null = null;
  private boundContextLost: (e: Event) => void;
  private boundContextRestored: () => void;
  private boundPointerDown: (e: PointerEvent) => void;
  private boundPointerMove: (e: PointerEvent) => void;
  private boundPointerUp: (e: PointerEvent) => void;
  private boundPointerLeave: () => void;

  constructor(
    container: HTMLElement,
    initialFinish: DiceFinishId,
    onSettled: (results: LandedDieResult[]) => void,
    onInteraction?: (ev: TrayInteractionEvent) => void,
    initialSettings?: DiceTraySettings
  ) {
    this.container = container;
    this.finishId = initialFinish;
    this.settings = initialSettings
      ? { ...initialSettings }
      : { ...DEFAULT_DICE_SETTINGS };
    this.onSettledCallback = onSettled;
    this.onInteractionCallback = onInteraction ?? null;
    this.isSoftwareGl = detectSoftwareWebGL();

    const width = Math.max(300, container.clientWidth);
    const height = Math.max(260, container.clientHeight);

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: "high-performance",
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.setPixelRatio(
      this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2)
    );
    this.renderer.setSize(width, height);
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.maxAnisotropy = Math.min(
      8,
      this.renderer.capabilities.getMaxAnisotropy() || 1
    );

    container.innerHTML = "";
    const canvas = this.renderer.domElement;
    canvas.style.display = "block";
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.touchAction = "none";
    canvas.style.cursor = "grab";
    container.appendChild(canvas);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color("#181614");

    // Studio RoomEnvironment for natural resin sheen & brass corner highlights
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environment = this.envTex;
    pmrem.dispose();

    // Crisp overhead tabletop camera showing the full walnut frame cleanly
    this.camera = new THREE.PerspectiveCamera(35, width / height, 0.5, 60);
    this.camera.position.set(0, 14.4, 3.2);
    this.camera.lookAt(0, 0, 0.05);

    // 3-point warm/cool studio rig positioned off-axis to eliminate specular glare washout
    const hemi = new THREE.HemisphereLight(0xdbeafe, 0x2c221b, 0.92);
    this.scene.add(hemi);

    const keyLight = new THREE.DirectionalLight(0xfff5e4, 1.45);
    keyLight.position.set(6.8, 11.2, 2.2);
    keyLight.castShadow = !this.isSoftwareGl;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.left = -7.5;
    keyLight.shadow.camera.right = 7.5;
    keyLight.shadow.camera.top = 5.5;
    keyLight.shadow.camera.bottom = -5.5;
    keyLight.shadow.camera.near = 2;
    keyLight.shadow.camera.far = 26;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.025;
    this.scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x93c5fd, 0.45);
    rimLight.position.set(-6.5, 7.2, -5.0);
    this.scene.add(rimLight);

    const physics = createTrayPhysicsWorld();
    this.world = physics.world;
    this.dieMaterial = physics.dieMaterial;
    this.feltMaterial = physics.feltMaterial;
    this.bevelMaterial = physics.bevelMaterial;
    this.woodMaterial = physics.woodMaterial;

    this.buildDiceTrayVisuals();

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    // Bind WebGL context & interactive pointer events
    this.boundContextLost = (e: Event) => {
      e.preventDefault();
      this.stopLoop();
    };
    this.boundContextRestored = () => {
      this.requestRender();
    };
    this.boundPointerDown = (e: PointerEvent) => this.handlePointerDown(e);
    this.boundPointerMove = (e: PointerEvent) => this.handlePointerMove(e);
    this.boundPointerUp = (e: PointerEvent) => this.handlePointerUp(e);
    this.boundPointerLeave = () => this.handlePointerLeave();

    canvas.addEventListener("webglcontextlost", this.boundContextLost);
    canvas.addEventListener("webglcontextrestored", this.boundContextRestored);
    canvas.addEventListener("pointerdown", this.boundPointerDown);
    canvas.addEventListener("pointermove", this.boundPointerMove);
    canvas.addEventListener("pointerup", this.boundPointerUp);
    canvas.addEventListener("pointercancel", this.boundPointerUp);
    canvas.addEventListener("pointerleave", this.boundPointerLeave);

    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(container);

    this.requestRender();
    this.schedulePrewarm(this.finishId);
  }

  public setSettings(next: DiceTraySettings) {
    this.settings = { ...next };
  }

  private buildDiceTrayVisuals() {
    const trayGroup = new THREE.Group();

    const feltTex = createFeltTexture(this.maxAnisotropy);
    const walnutTex = createWalnutTexture(this.maxAnisotropy);
    this.disposableResources.push(feltTex, walnutTex);

    // 1. Recessed woven felt mat
    const floorGeo = new THREE.PlaneGeometry(TRAY_HALF_W * 2, TRAY_HALF_D * 2);
    const floorMat = new THREE.MeshStandardMaterial({
      map: feltTex,
      roughness: 0.92,
      metalness: 0.0,
    });
    const floorMesh = new THREE.Mesh(floorGeo, floorMat);
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.receiveShadow = true;
    trayGroup.add(floorMesh);
    this.disposableResources.push(floorGeo, floorMat);

    // 2. Subtle inlaid brass octagonal border trim following the inner beveled arena
    const trimMat = new THREE.MeshStandardMaterial({
      color: 0xd4a44a,
      roughness: 0.34,
      metalness: 0.82,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    this.disposableResources.push(trimMat);

    const wIn = TRAY_HALF_W - BEVEL_RUN;
    const dIn = TRAY_HALF_D - BEVEL_RUN;
    const trimInset = 0.16;
    const tw = wIn - trimInset;
    const td = dIn - trimInset;
    const tc = CORNER_CHAMFER + trimInset * (2 - Math.SQRT2) * 0.5;
    const trimLoop: Array<[number, number]> = [
      [tw, -(td - tc)],
      [tw, td - tc],
      [tw - tc, td],
      [-(tw - tc), td],
      [-tw, td - tc],
      [-tw, -(td - tc)],
      [-(tw - tc), -td],
      [tw - tc, -td],
    ];
    for (let i = 0; i < trimLoop.length; i++) {
      const [x0, z0] = trimLoop[i]!;
      const [x1, z1] = trimLoop[(i + 1) % trimLoop.length]!;
      const len = Math.hypot(x1 - x0, z1 - z0) + 0.025;
      const angle = Math.atan2(z1 - z0, x1 - x0);
      const g = new THREE.PlaneGeometry(len, 0.04);
      const m = new THREE.Mesh(g, trimMat);
      m.rotation.order = "YXZ";
      m.rotation.y = -angle;
      m.rotation.x = -Math.PI / 2;
      m.position.set((x0 + x1) / 2, 0.006, (z0 + z1) / 2);
      trayGroup.add(m);
      this.disposableResources.push(g);
    }

    // 3. Crafted walnut wooden frame rails + 1:1 milled 52° inner bevels & chamfered corners
    const woodMat = new THREE.MeshStandardMaterial({
      map: walnutTex,
      roughness: 0.48,
      metalness: 0.04,
    });
    const bevelWoodMat = new THREE.MeshStandardMaterial({
      map: walnutTex,
      color: 0xd6c3b0,
      roughness: 0.42,
      metalness: 0.06,
    });
    this.disposableResources.push(woodMat, bevelWoodMat);

    // Build exact 8-faceted inner milled bevel + 4 corner top caps matching physics 1:1
    const cTop = CORNER_CHAMFER + BEVEL_RUN * (2 - Math.SQRT2);
    const botRing: Array<[number, number, number]> = [
      [wIn, 0, -(dIn - CORNER_CHAMFER)],
      [wIn, 0, dIn - CORNER_CHAMFER],
      [wIn - CORNER_CHAMFER, 0, dIn],
      [-(wIn - CORNER_CHAMFER), 0, dIn],
      [-wIn, 0, dIn - CORNER_CHAMFER],
      [-wIn, 0, -(dIn - CORNER_CHAMFER)],
      [-(wIn - CORNER_CHAMFER), 0, -dIn],
      [wIn - CORNER_CHAMFER, 0, -dIn],
    ];
    const topRing: Array<[number, number, number]> = [
      [TRAY_HALF_W, BEVEL_RISE, -(TRAY_HALF_D - cTop)],
      [TRAY_HALF_W, BEVEL_RISE, TRAY_HALF_D - cTop],
      [TRAY_HALF_W - cTop, BEVEL_RISE, TRAY_HALF_D],
      [-(TRAY_HALF_W - cTop), BEVEL_RISE, TRAY_HALF_D],
      [-TRAY_HALF_W, BEVEL_RISE, TRAY_HALF_D - cTop],
      [-TRAY_HALF_W, BEVEL_RISE, -(TRAY_HALF_D - cTop)],
      [-(TRAY_HALF_W - cTop), BEVEL_RISE, -TRAY_HALF_D],
      [TRAY_HALF_W - cTop, BEVEL_RISE, -TRAY_HALF_D],
    ];

    const bevelPos: number[] = [];
    const bevelUvs: number[] = [];
    const pushTri = (
      a: [number, number, number],
      b: [number, number, number],
      c: [number, number, number],
      ua: [number, number],
      ub: [number, number],
      uc: [number, number]
    ) => {
      // Ensure triangle faces upward (+Y normal) so FrontSide always renders cleanly
      const e1x = b[0] - a[0];
      const e1y = b[1] - a[1];
      const e1z = b[2] - a[2];
      const e2x = c[0] - a[0];
      const e2y = c[1] - a[1];
      const e2z = c[2] - a[2];
      const ny = e1z * e2x - e1x * e2z;
      if (ny >= 0) {
        bevelPos.push(...a, ...b, ...c);
        bevelUvs.push(...ua, ...ub, ...uc);
      } else {
        bevelPos.push(...a, ...c, ...b);
        bevelUvs.push(...ua, ...uc, ...ub);
      }
      void e1y;
      void e2y;
    };

    for (let i = 0; i < 8; i++) {
      const next = (i + 1) % 8;
      const b0 = botRing[i]!;
      const b1 = botRing[next]!;
      const t1 = topRing[next]!;
      const t0 = topRing[i]!;
      const segLen = Math.hypot(b1[0] - b0[0], b1[2] - b0[2]);
      const uLen = Math.max(0.4, segLen * 0.25);
      pushTri(b0, b1, t1, [0, 0], [uLen, 0], [uLen, 0.45]);
      pushTri(b0, t1, t0, [0, 0], [uLen, 0.45], [0, 0.45]);
    }

    // Fill the 4 horizontal corner ledges at y = BEVEL_RISE behind the diagonal chamfers
    for (const sx of [-1, 1] as const) {
      for (const sz of [-1, 1] as const) {
        const pA: [number, number, number] = [
          sx * TRAY_HALF_W,
          BEVEL_RISE,
          sz * (TRAY_HALF_D - cTop),
        ];
        const pB: [number, number, number] = [
          sx * (TRAY_HALF_W - cTop),
          BEVEL_RISE,
          sz * TRAY_HALF_D,
        ];
        const pC: [number, number, number] = [
          sx * TRAY_HALF_W,
          BEVEL_RISE,
          sz * TRAY_HALF_D,
        ];
        pushTri(pA, pB, pC, [0, 0], [0.4, 0], [0.4, 0.4]);
      }
    }

    const bevelGeo = new THREE.BufferGeometry();
    bevelGeo.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(bevelPos, 3)
    );
    bevelGeo.setAttribute("uv", new THREE.Float32BufferAttribute(bevelUvs, 2));
    bevelGeo.computeVertexNormals();
    const bevelMesh = new THREE.Mesh(bevelGeo, bevelWoodMat);
    bevelMesh.receiveShadow = true;
    bevelMesh.castShadow = true;
    trayGroup.add(bevelMesh);
    this.disposableResources.push(bevelGeo);

    const railH = 1.02;
    const horizLen = TRAY_HALF_W * 2 + RAIL_THICKNESS * 2;
    const vertLen = TRAY_HALF_D * 2;

    const railSpecs: Array<[number, number, number, number, number, number]> = [
      [
        horizLen,
        railH,
        RAIL_THICKNESS,
        0,
        railH / 2 - 0.08,
        -(TRAY_HALF_D + RAIL_THICKNESS / 2),
      ],
      [
        horizLen,
        railH,
        RAIL_THICKNESS,
        0,
        railH / 2 - 0.08,
        TRAY_HALF_D + RAIL_THICKNESS / 2,
      ],
      [
        RAIL_THICKNESS,
        railH,
        vertLen,
        -(TRAY_HALF_W + RAIL_THICKNESS / 2),
        railH / 2 - 0.08,
        0,
      ],
      [
        RAIL_THICKNESS,
        railH,
        vertLen,
        TRAY_HALF_W + RAIL_THICKNESS / 2,
        railH / 2 - 0.08,
        0,
      ],
    ];

    for (const [w, h, d, x, y, z] of railSpecs) {
      const geo = new THREE.BoxGeometry(w, h, d);
      const mesh = new THREE.Mesh(geo, woodMat);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      trayGroup.add(mesh);
      this.disposableResources.push(geo);
    }

    // 4. Brushed brass corner brackets
    const brassMat = new THREE.MeshStandardMaterial({
      color: 0xc99a44,
      roughness: 0.28,
      metalness: 0.84,
    });
    this.disposableResources.push(brassMat);

    const cornerGeo = new THREE.BoxGeometry(
      RAIL_THICKNESS + 0.06,
      railH + 0.05,
      RAIL_THICKNESS + 0.06
    );
    this.disposableResources.push(cornerGeo);

    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const cap = new THREE.Mesh(cornerGeo, brassMat);
        cap.position.set(
          sx * (TRAY_HALF_W + RAIL_THICKNESS / 2),
          railH / 2 - 0.07,
          sz * (TRAY_HALF_D + RAIL_THICKNESS / 2)
        );
        cap.castShadow = true;
        cap.receiveShadow = true;
        trayGroup.add(cap);
      }
    }

    // 5. Outer dark tabletop surround
    const deskGeo = new THREE.PlaneGeometry(40, 30);
    const deskMat = new THREE.MeshStandardMaterial({
      color: 0x171513,
      roughness: 0.88,
      metalness: 0.04,
    });
    const deskMesh = new THREE.Mesh(deskGeo, deskMat);
    deskMesh.rotation.x = -Math.PI / 2;
    deskMesh.position.y = -0.06;
    deskMesh.receiveShadow = true;
    trayGroup.add(deskMesh);
    this.disposableResources.push(deskGeo, deskMat);

    this.scene.add(trayGroup);
  }

  // ---------- Blueprint Caching & Idle Pre-Warm ----------

  private getEffectiveFinishForDie(
    kind: DieKind,
    baseFinish: DiceFinishId,
    accentFinish?: DiceFinishId
  ): DiceFinishId {
    if (accentFinish) return accentFinish;
    if (kind === "d10_tens") {
      return baseFinish === "sienna" ? "obsidian" : "sienna";
    }
    return baseFinish;
  }

  private getBlueprint(
    kind: DieKind,
    finishId: DiceFinishId
  ): BuiltDieBlueprint {
    const key = `${kind}:${finishId}`;
    const cached = this.blueprintCache.get(key);
    if (cached) return cached;

    const bp = buildDieBlueprint(
      kind,
      DICE_FINISHES[finishId],
      this.maxAnisotropy
    );
    // Warm symmetry table alongside geometry so Hybrid rolls have zero first-roll overhead
    getPolyhedronSymmetryGroup(bp);

    // Eagerly upload face textures on hardware WebGL to prevent first-draw stall
    if (!this.isSoftwareGl) {
      for (const tex of bp.textures) {
        this.renderer.initTexture(tex);
      }
      this.renderer.initTexture(bp.concealedTexture);
    }

    this.blueprintCache.set(key, bp);
    return bp;
  }

  private cancelPrewarm() {
    if (this.prewarmTimerId !== null) {
      window.clearTimeout(this.prewarmTimerId);
      this.prewarmTimerId = null;
    }
  }

  private schedulePrewarm(finishId: DiceFinishId) {
    this.cancelPrewarm();
    if (this.disposed) return;

    let idx = 0;
    const step = () => {
      this.prewarmTimerId = null;
      if (this.disposed) return;

      // Defer if user is actively rolling or dragging so interaction stays 100% responsive
      if (this.rollActive || this.pointerSession) {
        this.prewarmTimerId = window.setTimeout(step, 180);
        return;
      }

      while (idx < PREWARM_DIE_ORDER.length) {
        const kind = PREWARM_DIE_ORDER[idx++]!;
        const effectiveFinish = this.getEffectiveFinishForDie(kind, finishId);
        const key = `${kind}:${effectiveFinish}`;
        if (!this.blueprintCache.has(key)) {
          this.getBlueprint(kind, effectiveFinish);
          break;
        }
      }

      if (idx < PREWARM_DIE_ORDER.length) {
        this.prewarmTimerId = window.setTimeout(step, 45);
      }
    };

    this.prewarmTimerId = window.setTimeout(step, 60);
  }

  // ---------- Zero-Mutation Visual Material State Helpers ----------

  private syncDieVisualMaterial(die: ActiveDie) {
    if (die.concealed) {
      die.mesh.material = die.blueprint.concealedMaterials;
    } else if (
      this.pointerSession?.mode === "dragging-die" &&
      this.pointerSession.die === die
    ) {
      die.mesh.material = die.blueprint.heldMaterials;
    } else if (
      this.hoveredDie === die ||
      (this.externalHoverGroupId !== null &&
        die.groupId === this.externalHoverGroupId)
    ) {
      die.mesh.material = die.blueprint.hoverMaterials;
    } else if (die.dropped) {
      die.mesh.material = die.blueprint.droppedMaterials;
    } else {
      die.mesh.material = die.blueprint.materials;
    }
  }

  public setHighlightedGroup(groupId: string | null) {
    if (this.externalHoverGroupId === groupId) return;
    const prev = this.externalHoverGroupId;
    this.externalHoverGroupId = groupId;
    let changed = false;
    for (const die of this.activeDice) {
      if (die.groupId === prev || die.groupId === groupId) {
        this.syncDieVisualMaterial(die);
        changed = true;
      }
    }
    if (changed) {
      this.requestRender();
    }
  }

  public setDroppedGroups(droppedGroupIds: string[]) {
    const droppedSet = new Set(droppedGroupIds);
    let changed = false;
    for (const die of this.activeDice) {
      const nextDropped = droppedSet.has(die.groupId);
      if (die.dropped !== nextDropped) {
        die.dropped = nextDropped;
        this.syncDieVisualMaterial(die);
        changed = true;
      }
    }
    if (changed) {
      this.requestRender();
    }
  }

  private setDieConcealed(die: ActiveDie, concealed: boolean) {
    if (die.concealed === concealed) return;
    die.concealed = concealed;
    this.syncDieVisualMaterial(die);
  }

  private finishReturningDieImmediately() {
    if (!this.returningDie) return;
    const { die, targetPos, targetQuat } = this.returningDie;
    this.returningDie = null;

    die.body.type = CANNON.Body.DYNAMIC;
    die.body.mass = 1.2;
    die.body.updateMassProperties();
    die.body.collisionResponse = true;
    die.body.position.set(targetPos.x, targetPos.y, targetPos.z);
    die.body.quaternion.set(
      targetQuat.x,
      targetQuat.y,
      targetQuat.z,
      targetQuat.w
    );
    die.body.velocity.setZero();
    die.body.angularVelocity.setZero();
    die.settled = true;
    die.settledFrames = 0;
    die.cockedFrames = 0;
    die.nudgeCount = 0;

    die.mesh.position.set(targetPos.x, targetPos.y, targetPos.z);
    die.mesh.quaternion.set(
      targetQuat.x,
      targetQuat.y,
      targetQuat.z,
      targetQuat.w
    );
  }

  /**
   * If a user interacts mid-roll while Hybrid playback is running, hand off all
   * remaining dice seamlessly into live physics with their instantaneous velocities.
   */
  private handoffHybridPlaybackToLive(excludeDie?: ActiveDie) {
    const pb = this.hybridPlayback;
    if (!pb) return;
    this.hybridPlayback = null;

    const fIdx = Math.min(
      pb.frameCount - 1,
      Math.max(0, pb.elapsed / pb.frameDt)
    );
    const i0 = Math.floor(fIdx);
    const i1 = Math.min(pb.frameCount - 1, i0 + 1);
    const alpha = fIdx - i0;

    for (const track of pb.tracks) {
      const die = track.die;
      const o0 = i0 * 7;
      const o1 = i1 * 7;
      const f = track.frames;

      const px = f[o0]! + (f[o1]! - f[o0]!) * alpha;
      const py = f[o0 + 1]! + (f[o1 + 1]! - f[o0 + 1]!) * alpha;
      const pz = f[o0 + 2]! + (f[o1 + 2]! - f[o0 + 2]!) * alpha;

      _quatA.set(f[o0 + 3]!, f[o0 + 4]!, f[o0 + 5]!, f[o0 + 6]!);
      _quatB.set(f[o1 + 3]!, f[o1 + 4]!, f[o1 + 5]!, f[o1 + 6]!);
      _quat.copy(_quatA).slerp(_quatB, alpha).normalize();

      die.body.position.set(px, py, pz);
      die.body.quaternion.set(_quat.x, _quat.y, _quat.z, _quat.w);
      die.mesh.position.set(px, py, pz);
      die.mesh.quaternion.set(_quat.x, _quat.y, _quat.z, _quat.w);

      if (die === excludeDie) continue;

      die.body.type = CANNON.Body.DYNAMIC;
      die.body.mass = 1.2;
      die.body.updateMassProperties();
      die.body.collisionResponse = true;
      die.body.wakeUp();
      die.settled = false;
      die.settledFrames = 0;
      die.cockedFrames = 0;
      die.nudgeCount = 0;

      if (i1 > i0) {
        const invDt = 1 / pb.frameDt;
        die.body.velocity.set(
          (f[o1]! - f[o0]!) * invDt,
          (f[o1 + 1]! - f[o0 + 1]!) * invDt,
          (f[o1 + 2]! - f[o0 + 2]!) * invDt
        );
        // Approximate angular velocity from q1 * inv(q0)
        _quatDelta.copy(_quatA).invert().premultiply(_quatB).normalize();
        if (_quatDelta.w < 0) {
          _quatDelta.set(
            -_quatDelta.x,
            -_quatDelta.y,
            -_quatDelta.z,
            -_quatDelta.w
          );
        }
        const sinHalf = Math.hypot(_quatDelta.x, _quatDelta.y, _quatDelta.z);
        if (sinHalf > 1e-4) {
          const angle = 2 * Math.atan2(sinHalf, _quatDelta.w);
          const scale = (angle * invDt) / sinHalf;
          die.body.angularVelocity.set(
            _quatDelta.x * scale,
            _quatDelta.y * scale,
            _quatDelta.z * scale
          );
        } else {
          die.body.angularVelocity.setZero();
        }
      } else {
        die.body.velocity.setZero();
        die.body.angularVelocity.setZero();
      }
    }
  }

  // ---------- Interactive Raycasting & Drag-and-Toss ----------

  private updatePointerNdc(e: PointerEvent) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    _pointerNdc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    _pointerNdc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  }

  private raycastDie(e: PointerEvent): ActiveDie | null {
    if (this.activeDice.length === 0) return null;
    this.updatePointerNdc(e);
    _raycaster.setFromCamera(_pointerNdc, this.camera);

    // Pass 1: Exact mesh hit so adjacent dice never steal direct clicks from each other
    const meshes = this.activeDice.map((d) => d.mesh);
    const hits = _raycaster.intersectObjects(meshes, false);
    if (hits.length > 0) {
      const hitMesh = hits[0]!.object;
      const exact = this.activeDice.find((d) => d.mesh === hitMesh);
      if (exact) return exact;
    }

    // Pass 2: Generous forgiving bounding-sphere hitbox (especially helpful on d4, d6, d8 & d10)
    let bestDie: ActiveDie | null = null;
    let bestDistSq = Infinity;
    for (const die of this.activeDice) {
      const hitRadius = Math.max(die.blueprint.radius * 1.48, 1.24);
      const distSq = _raycaster.ray.distanceSqToPoint(die.mesh.position);
      if (distSq <= hitRadius * hitRadius && distSq < bestDistSq) {
        bestDistSq = distSq;
        bestDie = die;
      }
    }
    return bestDie;
  }

  private raycastDragPlane(
    e: PointerEvent,
    die: ActiveDie
  ): { x: number; z: number } | null {
    this.updatePointerNdc(e);
    _raycaster.setFromCamera(_pointerNdc, this.camera);
    const hit = _raycaster.ray.intersectPlane(_dragPlane, _planeHit);
    if (!hit) return null;
    const margin = BEVEL_RUN + Math.max(0.45, die.blueprint.restHeight);
    return {
      x: THREE.MathUtils.clamp(
        _planeHit.x,
        -(TRAY_HALF_W - margin),
        TRAY_HALF_W - margin
      ),
      z: THREE.MathUtils.clamp(
        _planeHit.z,
        -(TRAY_HALF_D - margin),
        TRAY_HALF_D - margin
      ),
    };
  }

  private setHoveredDie(next: ActiveDie | null) {
    if (this.hoveredDie === next) return;
    const prev = this.hoveredDie;
    this.hoveredDie = next;
    if (prev) {
      this.syncDieVisualMaterial(prev);
    }
    if (this.hoveredDie) {
      this.syncDieVisualMaterial(this.hoveredDie);
    }
    this.onInteractionCallback?.({
      kind: "hover-die",
      groupId: this.hoveredDie?.groupId ?? null,
    });
    this.updateCursor();
    this.requestRender();
  }

  private updateCursor() {
    const canvas = this.renderer.domElement;
    if (this.pointerSession?.mode === "dragging-die") {
      canvas.style.cursor = "grabbing";
    } else if (this.hoveredDie) {
      canvas.style.cursor = "grab";
    } else if (this.activeDice.length === 0) {
      canvas.style.cursor = "grab";
    } else {
      canvas.style.cursor = "default";
    }
  }

  private promoteToDraggingDie(
    die: ActiveDie,
    pointerId: number,
    initialX: number,
    initialZ: number
  ) {
    this.finishReturningDieImmediately();
    if (this.hybridPlayback) {
      this.handoffHybridPlaybackToLive(die);
    }

    diceAudio.unlock();
    const pan = THREE.MathUtils.clamp(
      die.body.position.x / TRAY_HALF_W,
      -0.7,
      0.7
    );
    diceAudio.playPickup(pan);

    // Record resting pose before lift so Put Back mode can restore it cleanly
    const originPos = {
      x: die.body.position.x,
      y: Math.max(die.body.position.y, die.blueprint.restHeight),
      z: die.body.position.z,
    };
    const originQuat = {
      x: die.body.quaternion.x,
      y: die.body.quaternion.y,
      z: die.body.quaternion.z,
      w: die.body.quaternion.w,
    };

    // Hide face numerals in-hand whenever Concealed Drop OR Hybrid Crypto engine is active
    const shouldConceal =
      this.settings.gentleDropMode === "concealed-drop" ||
      this.settings.randomnessEngine === "hybrid";
    this.setDieConcealed(die, shouldConceal);
    die.dropped = false;

    // Switch dragged die to kinematic while held so it glides cleanly above other dice
    die.settled = false;
    die.settledFrames = 0;
    die.cockedFrames = 0;
    die.nudgeCount = 0;
    die.body.wakeUp();
    die.body.type = CANNON.Body.KINEMATIC;
    die.body.mass = 0;
    die.body.updateMassProperties();
    die.body.velocity.setZero();
    die.body.angularVelocity.setZero();
    die.body.collisionResponse = false;

    this.pointerSession = {
      mode: "dragging-die",
      pointerId,
      die,
      targetX: initialX,
      targetZ: initialZ,
      samples: [{ x: initialX, z: initialZ, t: performance.now() }],
      originPos,
      originQuat,
      wasConcealed: shouldConceal,
    };

    this.syncDieVisualMaterial(die);
    this.updateCursor();
    this.onInteractionCallback?.({
      kind: "grab-die",
      groupId: die.groupId,
      concealed: shouldConceal,
    });
    this.startLoop();
  }

  private handlePointerDown(e: PointerEvent) {
    if (this.disposed || e.button !== 0) return;

    const hitDie = this.raycastDie(e);
    try {
      this.renderer.domElement.setPointerCapture(e.pointerId);
    } catch {
      // ignore if capture unavailable
    }

    if (hitDie) {
      this.setHoveredDie(hitDie);
      const planePos = this.raycastDragPlane(e, hitDie) ?? {
        x: hitDie.body.position.x,
        z: hitDie.body.position.z,
      };
      // 300ms hold threshold ensures relaxed clicks ALWAYS reroll cleanly, while moving >= 8px grabs instantly
      const holdTimer = window.setTimeout(() => {
        if (
          this.pointerSession &&
          this.pointerSession.mode === "pending-die" &&
          this.pointerSession.die === hitDie
        ) {
          this.promoteToDraggingDie(
            hitDie,
            e.pointerId,
            planePos.x,
            planePos.z
          );
        }
      }, 300);

      this.pointerSession = {
        mode: "pending-die",
        pointerId: e.pointerId,
        die: hitDie,
        startX: e.clientX,
        startY: e.clientY,
        holdTimer,
      };
    } else {
      this.pointerSession = {
        mode: "felt-gesture",
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
      };
    }
  }

  private handlePointerMove(e: PointerEvent) {
    if (this.disposed) return;

    const session = this.pointerSession;
    if (!session) {
      const now = performance.now();
      if (now - this.lastHoverRaycastMs < 30) return;
      this.lastHoverRaycastMs = now;
      const hit = this.raycastDie(e);
      this.setHoveredDie(hit);
      return;
    }

    if (session.pointerId !== e.pointerId) return;

    if (session.mode === "pending-die") {
      const moved = Math.hypot(
        e.clientX - session.startX,
        e.clientY - session.startY
      );
      if (moved >= 8) {
        window.clearTimeout(session.holdTimer);
        const pos = this.raycastDragPlane(e, session.die) ?? {
          x: session.die.body.position.x,
          z: session.die.body.position.z,
        };
        this.promoteToDraggingDie(session.die, session.pointerId, pos.x, pos.z);
      }
      return;
    }

    if (session.mode === "dragging-die") {
      const pos = this.raycastDragPlane(e, session.die);
      if (!pos) return;
      session.targetX = pos.x;
      session.targetZ = pos.z;

      const now = performance.now();
      session.samples.push({ x: pos.x, z: pos.z, t: now });
      while (session.samples.length > 2 && now - session.samples[0].t > 95) {
        session.samples.shift();
      }
      return;
    }

    if (session.mode === "felt-gesture") {
      const moved = Math.hypot(
        e.clientX - session.startX,
        e.clientY - session.startY
      );
      if (moved > 12) {
        this.renderer.domElement.style.cursor = "grabbing";
      }
    }
  }

  private handlePointerUp(e: PointerEvent) {
    if (this.disposed) return;
    const session = this.pointerSession;
    if (!session || session.pointerId !== e.pointerId) return;

    try {
      this.renderer.domElement.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }

    this.pointerSession = null;

    if (session.mode === "pending-die") {
      window.clearTimeout(session.holdTimer);
      const started = this.rerollDieByGroup(session.die.groupId);
      if (started) {
        this.onInteractionCallback?.({
          kind: "reroll-die",
          groupId: session.die.groupId,
        });
      }
      this.updateCursor();
      return;
    }

    if (session.mode === "dragging-die") {
      const die = session.die;
      this.syncDieVisualMaterial(die);

      let vx = 0;
      let vz = 0;
      const samples = session.samples;
      if (samples.length >= 2) {
        const first = samples[0];
        const last = samples[samples.length - 1];
        const dt = Math.max(0.016, (last.t - first.t) / 1000);
        const staleMs = performance.now() - last.t;
        if (staleMs < 90) {
          vx = (last.x - first.x) / dt;
          vz = (last.z - first.z) / dt;
        }
      }

      const speed = Math.hypot(vx, vz);
      const maxThrow = 16.5;
      if (speed > maxThrow) {
        const scale = maxThrow / speed;
        vx *= scale;
        vz *= scale;
      }

      const isFlick = speed >= 2.0;

      // Gentle Drop + Put Back mode: smoothly return die to its resting spot & face (no roll logged)
      if (!isFlick && this.settings.gentleDropMode === "put-back") {
        this.setDieConcealed(die, false);
        this.returningDie = {
          die,
          targetPos: new THREE.Vector3(
            session.originPos.x,
            session.originPos.y,
            session.originPos.z
          ),
          targetQuat: new THREE.Quaternion(
            session.originQuat.x,
            session.originQuat.y,
            session.originQuat.z,
            session.originQuat.w
          ),
          elapsed: 0,
        };
        this.onInteractionCallback?.({
          kind: "cancel-grab",
          groupId: die.groupId,
        });
        this.updateCursor();
        this.startLoop();
        return;
      }

      const pan = THREE.MathUtils.clamp(
        die.body.position.x / TRAY_HALF_W,
        -0.7,
        0.7
      );

      // Compute release kinematics
      let releaseQuat = {
        x: die.body.quaternion.x,
        y: die.body.quaternion.y,
        z: die.body.quaternion.z,
        w: die.body.quaternion.w,
      };
      let releaseVel: { x: number; y: number; z: number };
      let releaseAngVel: { x: number; y: number; z: number };

      if (isFlick) {
        diceAudio.playThrow(1, pan);
        // If held concealed, start from a fresh uniform random orientation so held pose cannot bias toss
        if (session.wasConcealed) {
          cryptoUniformQuaternion(_tmpQuatRand);
          releaseQuat = {
            x: _tmpQuatRand.x,
            y: _tmpQuatRand.y,
            z: _tmpQuatRand.z,
            w: _tmpQuatRand.w,
          };
        }
        releaseVel = {
          x: vx,
          y: Math.min(2.6, 0.35 + speed * 0.14),
          z: vz,
        };
        const spinScale = Math.min(24, 11 + speed * 1.15);
        releaseAngVel = {
          x: (vz / Math.max(1, speed)) * spinScale + cryptoRandomRange(-5, 5),
          y: cryptoRandomRange(-8, 8),
          z: (-vx / Math.max(1, speed)) * spinScale + cryptoRandomRange(-5, 5),
        };
      } else {
        // Concealed Drop mode: pick a completely unbiased uniform random starting side while still hidden,
        // then let realistic gentle-drop physics play out naturally!
        cryptoUniformQuaternion(_tmpQuatRand);
        releaseQuat = {
          x: _tmpQuatRand.x,
          y: _tmpQuatRand.y,
          z: _tmpQuatRand.z,
          w: _tmpQuatRand.w,
        };
        releaseVel = {
          x: vx * 0.4,
          y: -1.2,
          z: vz * 0.4,
        };
        releaseAngVel = {
          x: cryptoRandomRange(-3.2, 3.2),
          y: cryptoRandomRange(-3.2, 3.2),
          z: cryptoRandomRange(-3.2, 3.2),
        };
      }

      const initState: InitialBodyKinematics = {
        pos: {
          x: die.body.position.x,
          y: die.body.position.y,
          z: die.body.position.z,
        },
        quat: releaseQuat,
        vel: releaseVel,
        angVel: releaseAngVel,
      };

      // Hybrid Crypto-Guaranteed mode: pre-simulate this die's exact drop/flick, align via exact symmetry, then reveal & play
      if (this.settings.randomnessEngine === "hybrid") {
        const obstacles = this.activeDice.filter((d) => d !== die);
        this.restoreDynamicBodyState(die, initState);
        const playback = this.runHybridPreSim([die], [initState], obstacles);
        this.setDieConcealed(die, false);
        this.startHybridPlayback(playback);
        this.onInteractionCallback?.({
          kind: "toss-die",
          groupId: die.groupId,
        });
        this.updateCursor();
        return;
      }

      // Pure Physics mode: reveal numbers right as the die leaves your hand and run live physics
      this.setDieConcealed(die, false);
      this.restoreDynamicBodyState(die, initState);

      this.simElapsed = 0;
      this.rollActive = true;
      this.onInteractionCallback?.({
        kind: "toss-die",
        groupId: die.groupId,
      });
      this.updateCursor();
      this.startLoop();
      return;
    }

    if (session.mode === "felt-gesture") {
      const dx = e.clientX - session.startX;
      const dy = e.clientY - session.startY;
      const dist = Math.hypot(dx, dy);

      const shouldTossAll = this.activeDice.length === 0 || dist >= 28;
      if (shouldTossAll) {
        const throwDir =
          dist > 18
            ? {
                x: Math.max(-1, Math.min(1, dx / 130)),
                z: Math.max(-1, Math.min(1, dy / 130)),
              }
            : undefined;
        this.onInteractionCallback?.({ kind: "toss-all", throwDir });
      }
      this.updateCursor();
    }
  }

  private restoreDynamicBodyState(
    die: ActiveDie,
    init: InitialBodyKinematics
  ) {
    die.body.type = CANNON.Body.DYNAMIC;
    die.body.mass = 1.2;
    die.body.updateMassProperties();
    die.body.collisionResponse = true;
    die.body.position.set(init.pos.x, init.pos.y, init.pos.z);
    die.body.quaternion.set(
      init.quat.x,
      init.quat.y,
      init.quat.z,
      init.quat.w
    );
    die.body.velocity.set(init.vel.x, init.vel.y, init.vel.z);
    die.body.angularVelocity.set(init.angVel.x, init.angVel.y, init.angVel.z);
    die.body.wakeUp();
    die.settled = false;
    die.settledFrames = 0;
    die.cockedFrames = 0;
    die.nudgeCount = 0;

    die.mesh.position.set(init.pos.x, init.pos.y, init.pos.z);
    die.mesh.quaternion.set(
      init.quat.x,
      init.quat.y,
      init.quat.z,
      init.quat.w
    );
  }

  private handlePointerLeave() {
    if (!this.pointerSession) {
      this.setHoveredDie(null);
    }
  }

  // ---------- Finish, Clearing & Rolling ----------

  public setFinish(finishId: DiceFinishId) {
    if (this.finishId === finishId) return;
    this.finishId = finishId;

    for (const die of this.activeDice) {
      const effectiveFinishId = this.getEffectiveFinishForDie(
        die.kind,
        finishId
      );
      die.finishId = effectiveFinishId;
      const newBp = this.getBlueprint(die.kind, effectiveFinishId);

      die.mesh.geometry = newBp.geometry;
      die.blueprint = newBp;
      this.syncDieVisualMaterial(die);
    }
    this.requestRender();
    this.schedulePrewarm(finishId);
  }

  public clearTray() {
    this.cancelPointerSession();
    this.returningDie = null;
    this.hybridPlayback = null;
    this.rollActive = false;
    this.stopLoop();
    this.removeAllDice();
    this.updateCursor();
    this.requestRender();
  }

  private cancelPointerSession() {
    const prevSession = this.pointerSession;
    const prevHover = this.hoveredDie;
    if (prevSession?.mode === "pending-die") {
      window.clearTimeout(prevSession.holdTimer);
    }
    this.pointerSession = null;
    this.hoveredDie = null;
    if (prevSession?.mode === "dragging-die") {
      prevSession.die.concealed = false;
      this.syncDieVisualMaterial(prevSession.die);
    }
    if (prevHover) {
      this.syncDieVisualMaterial(prevHover);
    }
  }

  private removeAllDice() {
    for (const die of this.activeDice) {
      this.scene.remove(die.mesh);
      this.world.removeBody(die.body);
    }
    this.activeDice = [];
    this.externalHoverGroupId = null;
  }

  public rollDice(
    requests: RollDieRequest[],
    throwDir?: { x: number; z: number }
  ) {
    if (this.disposed || requests.length === 0) return;

    this.cancelPointerSession();
    this.returningDie = null;
    this.hybridPlayback = null;
    diceAudio.unlock();
    this.removeAllDice();

    // Slight natural throw-angle variation when rolled from a button so entries don't follow one groove
    const dirX = throwDir
      ? THREE.MathUtils.clamp(throwDir.x, -1, 1)
      : cryptoRandomFloat() < 0.5
      ? 1
      : -1;
    const dirZ = throwDir
      ? THREE.MathUtils.clamp(throwDir.z, -1, 1)
      : cryptoRandomRange(-0.45, 0.45);

    diceAudio.playThrow(requests.length, -dirX * 0.35);

    const count = requests.length;
    const cols = Math.min(4, Math.ceil(Math.sqrt(count)));
    const rows = Math.ceil(count / cols);

    const initialStates: InitialBodyKinematics[] = [];

    requests.forEach((req, idx) => {
      const finishKey = this.getEffectiveFinishForDie(
        req.kind,
        this.finishId,
        req.accentFinish
      );

      const bp = this.getBlueprint(req.kind, finishKey);

      const mesh = new THREE.Mesh(bp.geometry, bp.materials);
      mesh.castShadow = !this.isSoftwareGl;
      mesh.receiveShadow = true;
      this.scene.add(mesh);

      const body = new CANNON.Body({
        mass: 1.2,
        material: this.dieMaterial,
        shape: bp.shape,
        linearDamping: 0.06,
        angularDamping: 0.08,
        sleepSpeedLimit: 0.14,
        sleepTimeLimit: 0.38,
      });

      // Wide staggered spawn with gentle fan-out so big handfuls scatter cleanly across the felt
      const col = idx % cols;
      const row = Math.floor(idx / cols);
      const spacingX = count > 8 ? 1.15 : 1.35;
      const spacingZ = count > 8 ? 1.15 : 1.32;
      const startX =
        -dirX * cryptoRandomRange(2.2, 2.8) +
        (row - (rows - 1) / 2) * spacingX +
        cryptoRandomRange(-0.18, 0.18);
      const startZ =
        (col - (cols - 1) / 2) * spacingZ + cryptoRandomRange(-0.24, 0.24);
      const startY = Math.min(
        4.3,
        2.05 + (idx % 3) * 0.45 + cryptoRandomRange(0, 0.38)
      );

      const spawnMargin = BEVEL_RUN + Math.max(0.55, bp.radius * 0.78);
      const px = THREE.MathUtils.clamp(
        startX,
        -(TRAY_HALF_W - spawnMargin),
        TRAY_HALF_W - spawnMargin
      );
      const pz = THREE.MathUtils.clamp(
        startZ,
        -(TRAY_HALF_D - spawnMargin),
        TRAY_HALF_D - spawnMargin
      );

      // Exact Haar-uniform 3D orientation (Shoemake) — eliminates Euler gimbal-lock skew
      cryptoUniformQuaternion(_tmpQuatRand);

      const fanZ = (col - (cols - 1) / 2) * 1.1;
      const throwSpeed = cryptoRandomRange(6.4, 11.0);
      const vx = dirX * throwSpeed + cryptoRandomRange(-1.4, 1.4);
      const vy = cryptoRandomRange(-1.1, 0.6);
      const vz = dirZ * 3.8 + fanZ + cryptoRandomRange(-1.5, 1.5);

      // Guaranteed lively tumble on a uniform random 3D axis (minimum spin floor)
      const spin = cryptoMinimumSpinVector(12, 24);

      const initState: InitialBodyKinematics = {
        pos: { x: px, y: startY, z: pz },
        quat: {
          x: _tmpQuatRand.x,
          y: _tmpQuatRand.y,
          z: _tmpQuatRand.z,
          w: _tmpQuatRand.w,
        },
        vel: { x: vx, y: vy, z: vz },
        angVel: spin,
      };
      initialStates.push(initState);

      body.position.set(px, startY, pz);
      body.quaternion.set(
        _tmpQuatRand.x,
        _tmpQuatRand.y,
        _tmpQuatRand.z,
        _tmpQuatRand.w
      );
      body.velocity.set(vx, vy, vz);
      body.angularVelocity.set(spin.x, spin.y, spin.z);

      body.addEventListener(
        "collide",
        (ev: { body: CANNON.Body; contact: CANNON.ContactEquation }) => {
          if (this.hybridPlayback) return;
          const impact = Math.abs(ev.contact.getImpactVelocityAlongNormal());
          const surface =
            ev.body.material === this.dieMaterial
              ? "die"
              : ev.body.material === this.woodMaterial ||
                ev.body.material === this.bevelMaterial
              ? "wood"
              : "felt";
          const pan = THREE.MathUtils.clamp(
            body.position.x / TRAY_HALF_W,
            -0.7,
            0.7
          );
          diceAudio.playImpact(impact, surface, pan);
        }
      );

      this.world.addBody(body);

      mesh.position.set(px, startY, pz);
      mesh.quaternion.set(
        _tmpQuatRand.x,
        _tmpQuatRand.y,
        _tmpQuatRand.z,
        _tmpQuatRand.w
      );

      this.activeDice.push({
        id: req.id,
        kind: req.kind,
        groupId: req.groupId,
        finishId: finishKey,
        blueprint: bp,
        mesh,
        body,
        settledFrames: 0,
        cockedFrames: 0,
        nudgeCount: 0,
        settled: false,
        concealed: false,
        dropped: false,
      });
    });

    if (this.settings.randomnessEngine === "hybrid") {
      const playback = this.runHybridPreSim(this.activeDice, initialStates, []);
      this.startHybridPlayback(playback);
      this.updateCursor();
      return;
    }

    this.simElapsed = 0;
    this.rollActive = true;
    this.updateCursor();
    this.startLoop(true);
  }

  /**
   * Unbiased tabletop in-place flip for a single die (or d100 pair).
   * Uses broad crypto-randomized spin/launch in Pure Physics, or exact symmetry alignment in Hybrid mode.
   */
  public rerollDieByGroup(groupId: string): boolean {
    const targets = this.activeDice.filter((d) => d.groupId === groupId);
    if (targets.length === 0) return false;

    this.finishReturningDieImmediately();
    if (this.hybridPlayback) {
      this.handoffHybridPlaybackToLive();
    }

    diceAudio.unlock();

    const targetInitialStates: InitialBodyKinematics[] = [];

    // Clear dropped-die dimming across the group before rerolling so Adv/Dis recalculates cleanly
    for (const d of this.activeDice) {
      if (d.dropped) {
        d.dropped = false;
        this.syncDieVisualMaterial(d);
      }
    }

    for (const die of targets) {
      this.setDieConcealed(die, false);
      die.dropped = false;
      die.settled = false;
      die.settledFrames = 0;
      die.cockedFrames = 0;
      die.nudgeCount = 0;
      die.body.wakeUp();

      const pan = THREE.MathUtils.clamp(
        die.body.position.x / TRAY_HALF_W,
        -0.7,
        0.7
      );
      diceAudio.playThrow(1, pan);

      // Gentle lateral drift away from immediate neighbors & tray edges
      let driftX = -die.body.position.x * 0.28;
      let driftZ = -die.body.position.z * 0.28;

      for (const other of this.activeDice) {
        if (other === die) continue;
        const dx = die.body.position.x - other.body.position.x;
        const dz = die.body.position.z - other.body.position.z;
        const dSq = dx * dx + dz * dz;
        if (dSq > 0.001 && dSq < 2.8) {
          const dist = Math.sqrt(dSq);
          const push = (1.7 - Math.min(1.65, dist)) * 1.1;
          driftX += (dx / dist) * push;
          driftZ += (dz / dist) * push;
        }
      }

      const driftLen = Math.hypot(driftX, driftZ);
      if (driftLen > 2.6) {
        driftX = (driftX / driftLen) * 2.6;
        driftZ = (driftZ / driftLen) * 2.6;
      }

      // Lift cleanly past corner radius so initial spin never clips the felt back onto the old face,
      // paired with strong horizontal tumble + broad upward impulse to eliminate prior-face correlation
      const py = Math.max(die.body.position.y, die.blueprint.radius + 0.12);
      const vx = driftX + cryptoRandomRange(-2.2, 2.2);
      const vy = cryptoRandomRange(8.0, 13.6);
      const vz = driftZ + cryptoRandomRange(-2.2, 2.2);
      const az = cryptoRandomRange(0, Math.PI * 2);
      const tumble = cryptoRandomRange(18, 36);
      const spin = {
        x: Math.cos(az) * tumble,
        y: cryptoRandomRange(-16, 16),
        z: Math.sin(az) * tumble,
      };

      const initState: InitialBodyKinematics = {
        pos: { x: die.body.position.x, y: py, z: die.body.position.z },
        quat: {
          x: die.body.quaternion.x,
          y: die.body.quaternion.y,
          z: die.body.quaternion.z,
          w: die.body.quaternion.w,
        },
        vel: { x: vx, y: vy, z: vz },
        angVel: spin,
      };
      targetInitialStates.push(initState);

      die.body.position.set(initState.pos.x, initState.pos.y, initState.pos.z);
      die.body.velocity.set(vx, vy, vz);
      die.body.angularVelocity.set(spin.x, spin.y, spin.z);
    }

    if (this.settings.randomnessEngine === "hybrid") {
      const targetSet = new Set(targets);
      const obstacles = this.activeDice.filter((d) => !targetSet.has(d));
      const playback = this.runHybridPreSim(
        targets,
        targetInitialStates,
        obstacles
      );
      this.startHybridPlayback(playback);
      return true;
    }

    this.simElapsed = 0;
    this.rollActive = true;
    this.startLoop();
    return true;
  }

  // ---------- Hybrid Crypto-Guaranteed Pre-Simulation & Exact Symmetry Alignment ----------

  private runHybridPreSim(
    dynamicDice: ActiveDie[],
    initialStates: InitialBodyKinematics[],
    staticObstacles: ActiveDie[]
  ): HybridPlayback {
    const sim = createTrayPhysicsWorld(8);

    // Add settled neighboring dice as static obstacles so single-die tosses/rerolls bounce realistically
    for (const obs of staticObstacles) {
      const obsBody = new CANNON.Body({
        type: CANNON.Body.STATIC,
        material: sim.dieMaterial,
        shape: obs.blueprint.shape,
      });
      obsBody.position.set(
        obs.body.position.x,
        obs.body.position.y,
        obs.body.position.z
      );
      obsBody.quaternion.set(
        obs.body.quaternion.x,
        obs.body.quaternion.y,
        obs.body.quaternion.z,
        obs.body.quaternion.w
      );
      sim.world.addBody(obsBody);
    }

    const cues: HybridImpactCue[] = [];
    let currentSimTime = 0;

    interface SimEntry {
      die: ActiveDie;
      body: CANNON.Body;
      settledFrames: number;
      cockedFrames: number;
      nudgeCount: number;
      settled: boolean;
      samples: number[];
    }

    const entries: SimEntry[] = dynamicDice.map((die, i) => {
      const init = initialStates[i]!;
      const body = new CANNON.Body({
        mass: 1.2,
        material: sim.dieMaterial,
        shape: die.blueprint.shape,
        linearDamping: 0.06,
        angularDamping: 0.08,
        sleepSpeedLimit: 0.14,
        sleepTimeLimit: 0.38,
      });
      body.position.set(init.pos.x, init.pos.y, init.pos.z);
      body.quaternion.set(init.quat.x, init.quat.y, init.quat.z, init.quat.w);
      body.velocity.set(init.vel.x, init.vel.y, init.vel.z);
      body.angularVelocity.set(init.angVel.x, init.angVel.y, init.angVel.z);

      body.addEventListener(
        "collide",
        (ev: { body: CANNON.Body; contact: CANNON.ContactEquation }) => {
          const impact = Math.abs(ev.contact.getImpactVelocityAlongNormal());
          if (impact < 0.7 || cues.length >= 240) return;
          const surface =
            ev.body.material === sim.dieMaterial
              ? "die"
              : ev.body.material === sim.woodMaterial ||
                ev.body.material === sim.bevelMaterial
              ? "wood"
              : "felt";
          const pan = THREE.MathUtils.clamp(
            body.position.x / TRAY_HALF_W,
            -0.7,
            0.7
          );
          cues.push({ simTime: currentSimTime, impact, surface, pan });
        }
      );

      sim.world.addBody(body);

      return {
        die,
        body,
        settledFrames: 0,
        cockedFrames: 0,
        nudgeCount: 0,
        settled: false,
        samples: [
          body.position.x,
          body.position.y,
          body.position.z,
          body.quaternion.x,
          body.quaternion.y,
          body.quaternion.z,
          body.quaternion.w,
        ],
      };
    });

    const maxSteps = Math.round(MAX_SIM_SECONDS / HYBRID_SIM_STEP);
    let recordedFrames = 1;
    let allSettled = false;

    for (let step = 1; step <= maxSteps; step++) {
      sim.world.step(HYBRID_SIM_STEP);
      currentSimTime = step * HYBRID_SIM_STEP;

      allSettled = true;
      for (const entry of entries) {
        applyEmergencyBounds(entry.body, entry.die.blueprint.restHeight);

        const linSpeedSq = entry.body.velocity.lengthSquared();
        const angSpeedSq = entry.body.angularVelocity.lengthSquared();

        if (entry.settled && (linSpeedSq > 0.06 || angSpeedSq > 0.06)) {
          entry.settled = false;
          entry.settledFrames = 0;
          entry.cockedFrames = 0;
        }

        if (!entry.settled) {
          _quat.set(
            entry.body.quaternion.x,
            entry.body.quaternion.y,
            entry.body.quaternion.z,
            entry.body.quaternion.w
          );
          const flatness = getDieFlatness(
            entry.die.blueprint,
            _quat,
            _bottomNormal
          );
          const heightExcess =
            entry.body.position.y - entry.die.blueprint.restHeight;
          const isGroundedAndFlat = heightExcess <= 0.16 && flatness >= 0.965;
          if (!isGroundedAndFlat) {
            if (entry.body.sleepState === CANNON.Body.SLEEPING) {
              entry.body.wakeUp();
            }
            applyTiltedSettleAssist(
              entry.body,
              entry.die.blueprint,
              linSpeedSq,
              angSpeedSq,
              _bottomNormal,
              HYBRID_SIM_STEP
            );
          }
          const isVerySlow =
            entry.body.sleepState === CANNON.Body.SLEEPING ||
            (linSpeedSq < 0.045 && angSpeedSq < 0.05);

          if (isVerySlow && isGroundedAndFlat) {
            entry.cockedFrames = 0;
            entry.settledFrames += 1;
            if (entry.settledFrames >= 6) {
              entry.settled = true;
              entry.body.velocity.setZero();
              entry.body.angularVelocity.setZero();
            } else {
              allSettled = false;
            }
          } else {
            entry.settledFrames = 0;
            allSettled = false;

            const isStuckStill =
              (entry.body.sleepState === CANNON.Body.SLEEPING ||
                (linSpeedSq < 0.025 &&
                  angSpeedSq < 0.06 &&
                  Math.abs(entry.body.velocity.y) < 0.12)) &&
              !isGroundedAndFlat;

            if (isStuckStill && entry.nudgeCount < 3) {
              entry.cockedFrames += 1;
              if (entry.cockedFrames >= 14) {
                this.nudgeBodyCockedOrStacked(
                  entry.body,
                  entry.die.blueprint,
                  entries.map((e) => e.body),
                  heightExcess > 0.28
                );
                entry.cockedFrames = 0;
                entry.settledFrames = 0;
                entry.nudgeCount += 1;
              }
            } else {
              entry.cockedFrames = 0;
            }
          }
        }
      }

      for (const entry of entries) {
        entry.samples.push(
          entry.body.position.x,
          entry.body.position.y,
          entry.body.position.z,
          entry.body.quaternion.x,
          entry.body.quaternion.y,
          entry.body.quaternion.z,
          entry.body.quaternion.w
        );
      }
      recordedFrames += 1;

      if (allSettled) break;
    }

    // Safety pass if max simulation duration elapsed during a dense pileup
    if (!allSettled) {
      this.flattenAndSeparateBodies(
        entries.map((e) => ({ body: e.body, blueprint: e.die.blueprint }))
      );
      for (const entry of entries) {
        entry.samples.push(
          entry.body.position.x,
          entry.body.position.y,
          entry.body.position.z,
          entry.body.quaternion.x,
          entry.body.quaternion.y,
          entry.body.quaternion.z,
          entry.body.quaternion.w
        );
      }
      recordedFrames += 1;
    }

    // Apply exact rotational symmetry R_sym per die so the physical hull is unchanged
    // at every frame while landing naturally on the cryptographically drawn target value!
    const tracks: HybridDieTrack[] = entries.map((entry) => {
      const frames = new Float32Array(entry.samples);
      const lastOff = (recordedFrames - 1) * 7;
      _quat.set(
        frames[lastOff + 3]!,
        frames[lastOff + 4]!,
        frames[lastOff + 5]!,
        frames[lastOff + 6]!
      );

      const simLandedValue = readLandedDieValue(entry.die.blueprint, _quat);
      const targetValue = drawCryptoFaceValue(entry.die.blueprint);
      const symQuat = findSymmetryRotation(
        entry.die.blueprint,
        targetValue,
        simLandedValue
      );

      for (let f = 0; f < recordedFrames; f++) {
        const off = f * 7;
        _quat
          .set(
            frames[off + 3]!,
            frames[off + 4]!,
            frames[off + 5]!,
            frames[off + 6]!
          )
          .multiply(symQuat)
          .normalize();
        frames[off + 3] = _quat.x;
        frames[off + 4] = _quat.y;
        frames[off + 5] = _quat.z;
        frames[off + 6] = _quat.w;
      }

      return { die: entry.die, frames, targetValue };
    });

    const duration = Math.max(
      HYBRID_FRAME_DT,
      (recordedFrames - 1) * HYBRID_FRAME_DT
    );

    return {
      tracks,
      frameCount: recordedFrames,
      frameDt: HYBRID_FRAME_DT,
      duration,
      elapsed: 0,
      cues,
      nextCueIdx: 0,
    };
  }

  private startHybridPlayback(playback: HybridPlayback) {
    // Sync frame 0 immediately onto meshes & bodies so the first rendered frame matches R_sym
    for (const track of playback.tracks) {
      const f = track.frames;
      track.die.body.position.set(f[0]!, f[1]!, f[2]!);
      track.die.body.quaternion.set(f[3]!, f[4]!, f[5]!, f[6]!);
      track.die.body.velocity.setZero();
      track.die.body.angularVelocity.setZero();
      track.die.mesh.position.set(f[0]!, f[1]!, f[2]!);
      track.die.mesh.quaternion.set(f[3]!, f[4]!, f[5]!, f[6]!);
      track.die.settled = false;
    }

    this.hybridPlayback = playback;
    this.simElapsed = 0;
    this.rollActive = true;
    this.startLoop(true);
  }

  // ---------- Calm, Natural Anti-Stacking & Anti-Cocked Settlement ----------

  private nudgeBodyCockedOrStacked(
    body: CANNON.Body,
    blueprint: BuiltDieBlueprint,
    allBodies: CANNON.Body[],
    isStacked: boolean
  ) {
    body.wakeUp();

    let pushX = -body.position.x * 0.35;
    let pushZ = -body.position.z * 0.35;

    let nearestDistSq = Infinity;
    let nearDx = 0;
    let nearDz = 0;
    for (const other of allBodies) {
      if (other === body) continue;
      const dx = body.position.x - other.position.x;
      const dz = body.position.z - other.position.z;
      const dSq = dx * dx + dz * dz;
      if (dSq < nearestDistSq) {
        nearestDistSq = dSq;
        nearDx = dx;
        nearDz = dz;
      }
    }

    const pushSpeed = isStacked ? 2.1 : 0.95;
    if (nearestDistSq < 2.4) {
      const len = Math.sqrt(nearestDistSq);
      if (len > 0.02) {
        pushX = (nearDx / len) * pushSpeed;
        pushZ = (nearDz / len) * pushSpeed;
      } else {
        const ang = cryptoRandomRange(0, Math.PI * 2);
        pushX = Math.cos(ang) * pushSpeed;
        pushZ = Math.sin(ang) * pushSpeed;
      }
    } else {
      const len = Math.hypot(pushX, pushZ) || 1;
      pushX = (pushX / len) * pushSpeed;
      pushZ = (pushZ / len) * pushSpeed;
    }

    body.velocity.set(pushX, isStacked ? 0.35 : 0.05, pushZ);

    _quat.set(
      body.quaternion.x,
      body.quaternion.y,
      body.quaternion.z,
      body.quaternion.w
    );
    getDieFlatness(blueprint, _quat, _bottomNormal);
    _torqueAxis.crossVectors(_bottomNormal, _downVec);
    if (_torqueAxis.lengthSq() > 0.0004) {
      _torqueAxis.normalize();
      body.angularVelocity.set(_torqueAxis.x * 3.2, 0, _torqueAxis.z * 3.2);
    }
  }

  private nudgeCockedOrStackedDie(die: ActiveDie, isStacked: boolean) {
    die.cockedFrames = 0;
    die.settledFrames = 0;
    die.nudgeCount += 1;
    this.nudgeBodyCockedOrStacked(
      die.body,
      die.blueprint,
      this.activeDice.map((d) => d.body),
      isStacked
    );
  }

  private flattenAndSeparateBodies(
    items: Array<{ body: CANNON.Body; blueprint: BuiltDieBlueprint }>
  ) {
    for (const item of items) {
      _quat.set(
        item.body.quaternion.x,
        item.body.quaternion.y,
        item.body.quaternion.z,
        item.body.quaternion.w
      );
      const flatness = getDieFlatness(item.blueprint, _quat, _bottomNormal);
      const heightExcess = item.body.position.y - item.blueprint.restHeight;

      if (flatness < 0.975 || heightExcess > 0.18) {
        if (_bottomNormal.lengthSq() > 0.001) {
          _alignQuat.setFromUnitVectors(_bottomNormal.normalize(), _downVec);
          _quat.premultiply(_alignQuat).normalize();
          item.body.quaternion.set(_quat.x, _quat.y, _quat.z, _quat.w);
        }
        item.body.position.y = item.blueprint.restHeight;
      }

      item.body.velocity.setZero();
      item.body.angularVelocity.setZero();
    }

    for (let pass = 0; pass < 4; pass++) {
      for (let i = 0; i < items.length; i++) {
        const a = items[i]!;
        const marginA = BEVEL_RUN + Math.max(0.45, a.blueprint.restHeight);
        for (let j = i + 1; j < items.length; j++) {
          const b = items[j]!;
          const minDist = (a.blueprint.restHeight + b.blueprint.restHeight) * 2.15;
          const dx = b.body.position.x - a.body.position.x;
          const dz = b.body.position.z - a.body.position.z;
          const dist = Math.hypot(dx, dz);
          if (dist < minDist) {
            const nx = dist > 0.001 ? dx / dist : 1;
            const nz = dist > 0.001 ? dz / dist : 0;
            const shift = (minDist - dist) * 0.52;
            a.body.position.x -= nx * shift;
            a.body.position.z -= nz * shift;
            b.body.position.x += nx * shift;
            b.body.position.z += nz * shift;
          }
        }
        a.body.position.x = THREE.MathUtils.clamp(
          a.body.position.x,
          -(TRAY_HALF_W - marginA),
          TRAY_HALF_W - marginA
        );
        a.body.position.z = THREE.MathUtils.clamp(
          a.body.position.z,
          -(TRAY_HALF_D - marginA),
          TRAY_HALF_D - marginA
        );
      }
    }
  }

  private ensureAllDiceFlatAndSeparated() {
    this.flattenAndSeparateBodies(
      this.activeDice.map((die) => ({
        body: die.body,
        blueprint: die.blueprint,
      }))
    );
    for (const die of this.activeDice) {
      die.settled = true;
      die.mesh.position.set(
        die.body.position.x,
        die.body.position.y,
        die.body.position.z
      );
      die.mesh.quaternion.set(
        die.body.quaternion.x,
        die.body.quaternion.y,
        die.body.quaternion.z,
        die.body.quaternion.w
      );
    }
    this.renderer.render(this.scene, this.camera);
  }

  // ---------- Loop & Simulation ----------

  private startLoop(renderFrameZero = false) {
    if (this.disposed) return;
    if (this.isRunningLoop) {
      if (renderFrameZero) {
        this.lastTickMs = performance.now();
        this.renderer.render(this.scene, this.camera);
      }
      return;
    }
    if (this.frameId) {
      cancelAnimationFrame(this.frameId);
      window.clearTimeout(this.frameId);
      this.frameId = 0;
    }
    this.renderBusy = false;
    this.renderDirty = false;
    this.isRunningLoop = true;
    this.lastTickMs = performance.now();
    if (renderFrameZero) {
      this.renderer.render(this.scene, this.camera);
    }
    this.scheduleNextTick();
  }

  private stopLoop() {
    this.isRunningLoop = false;
    if (this.frameId) {
      cancelAnimationFrame(this.frameId);
      window.clearTimeout(this.frameId);
      this.frameId = 0;
    }
  }

  private afterDraw(cb: () => void) {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    if (typeof gl.fenceSync !== "function") {
      this.frameId = window.setTimeout(cb, 80);
      return;
    }
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      if (this.disposed) {
        if (sync) gl.deleteSync(sync);
        return;
      }
      const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
      if (state === gl.UNSIGNALED) {
        this.frameId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        this.frameId = window.setTimeout(cb, 80);
      }
    };
    this.frameId = window.setTimeout(poll, 5);
  }

  private scheduleNextTick() {
    if (!this.isRunningLoop || this.disposed) return;
    if (this.isSoftwareGl) {
      this.afterDraw(() => this.tick());
    } else {
      this.frameId = requestAnimationFrame(() => this.tick());
    }
  }

  private tick() {
    if (!this.isRunningLoop || this.disposed) return;

    const now = performance.now();
    const rawDt = Math.min(
      0.1,
      Math.max(0.004, (now - this.lastTickMs) / 1000)
    );
    this.lastTickMs = now;

    // 1. Hybrid Crypto-Guaranteed Recorded Trajectory Playback
    if (this.hybridPlayback) {
      const pb = this.hybridPlayback;
      pb.elapsed = Math.min(pb.duration, pb.elapsed + rawDt);

      while (
        pb.nextCueIdx < pb.cues.length &&
        pb.cues[pb.nextCueIdx]!.simTime <= pb.elapsed
      ) {
        const cue = pb.cues[pb.nextCueIdx]!;
        diceAudio.playImpact(cue.impact, cue.surface, cue.pan);
        pb.nextCueIdx += 1;
      }

      const fIdx = pb.elapsed / pb.frameDt;
      const i0 = Math.min(pb.frameCount - 1, Math.floor(fIdx));
      const i1 = Math.min(pb.frameCount - 1, i0 + 1);
      const alpha = fIdx - i0;

      for (const track of pb.tracks) {
        const f = track.frames;
        const o0 = i0 * 7;
        const o1 = i1 * 7;

        const px = f[o0]! + (f[o1]! - f[o0]!) * alpha;
        const py = f[o0 + 1]! + (f[o1 + 1]! - f[o0 + 1]!) * alpha;
        const pz = f[o0 + 2]! + (f[o1 + 2]! - f[o0 + 2]!) * alpha;

        _quatA.set(f[o0 + 3]!, f[o0 + 4]!, f[o0 + 5]!, f[o0 + 6]!);
        _quatB.set(f[o1 + 3]!, f[o1 + 4]!, f[o1 + 5]!, f[o1 + 6]!);
        _quat.copy(_quatA).slerp(_quatB, alpha).normalize();

        track.die.body.position.set(px, py, pz);
        track.die.body.quaternion.set(_quat.x, _quat.y, _quat.z, _quat.w);
        track.die.mesh.position.set(px, py, pz);
        track.die.mesh.quaternion.set(_quat.x, _quat.y, _quat.z, _quat.w);
      }

      this.renderer.render(this.scene, this.camera);

      if (pb.elapsed >= pb.duration) {
        const lastOff = (pb.frameCount - 1) * 7;
        for (const track of pb.tracks) {
          const f = track.frames;
          track.die.body.position.set(
            f[lastOff]!,
            f[lastOff + 1]!,
            f[lastOff + 2]!
          );
          track.die.body.quaternion.set(
            f[lastOff + 3]!,
            f[lastOff + 4]!,
            f[lastOff + 5]!,
            f[lastOff + 6]!
          );
          track.die.body.velocity.setZero();
          track.die.body.angularVelocity.setZero();
          track.die.mesh.position.set(
            f[lastOff]!,
            f[lastOff + 1]!,
            f[lastOff + 2]!
          );
          track.die.mesh.quaternion.set(
            f[lastOff + 3]!,
            f[lastOff + 4]!,
            f[lastOff + 5]!,
            f[lastOff + 6]!
          );
          track.die.settled = true;
        }
        this.hybridPlayback = null;
        this.rollActive = false;
        this.stopLoop();
        this.renderer.render(this.scene, this.camera);
        this.emitSettledResults();
        return;
      }

      this.scheduleNextTick();
      return;
    }

    // 2. Smooth Put-Back Return Glide (Cancel Grab)
    if (this.returningDie) {
      const ret = this.returningDie;
      ret.elapsed += rawDt;
      const body = ret.die.body;
      const nextX = THREE.MathUtils.damp(body.position.x, ret.targetPos.x, 20, rawDt);
      const nextY = THREE.MathUtils.damp(body.position.y, ret.targetPos.y, 20, rawDt);
      const nextZ = THREE.MathUtils.damp(body.position.z, ret.targetPos.z, 20, rawDt);
      body.position.set(nextX, nextY, nextZ);

      _quat.set(
        body.quaternion.x,
        body.quaternion.y,
        body.quaternion.z,
        body.quaternion.w
      );
      const slerpAlpha = 1 - Math.exp(-20 * rawDt);
      _quat.slerp(ret.targetQuat, slerpAlpha).normalize();
      body.quaternion.set(_quat.x, _quat.y, _quat.z, _quat.w);

      ret.die.mesh.position.set(nextX, nextY, nextZ);
      ret.die.mesh.quaternion.set(_quat.x, _quat.y, _quat.z, _quat.w);

      const posDist = Math.hypot(
        nextX - ret.targetPos.x,
        nextY - ret.targetPos.y,
        nextZ - ret.targetPos.z
      );
      const quatAlign = Math.abs(_quat.dot(ret.targetQuat));
      if ((posDist < 0.015 && quatAlign > 0.999) || ret.elapsed > 0.35) {
        this.finishReturningDieImmediately();
      }
    }

    const draggedDie =
      this.pointerSession?.mode === "dragging-die"
        ? this.pointerSession.die
        : null;
    const returningDieRef = this.returningDie?.die ?? null;

    // 3. Smoothly track pointer for any held die before stepping physics
    if (this.pointerSession?.mode === "dragging-die") {
      const s = this.pointerSession;
      const body = s.die.body;
      const prevX = body.position.x;
      const prevZ = body.position.z;
      const nextX = THREE.MathUtils.damp(prevX, s.targetX, 24, rawDt);
      const nextY = THREE.MathUtils.damp(
        body.position.y,
        DRAG_HOVER_Y,
        20,
        rawDt
      );
      const nextZ = THREE.MathUtils.damp(prevZ, s.targetZ, 24, rawDt);
      body.position.set(nextX, nextY, nextZ);

      // Frame-rate independent gentle tumble proportional to drag velocity
      const vx = THREE.MathUtils.clamp((nextX - prevX) / rawDt, -14, 14);
      const vz = THREE.MathUtils.clamp((nextZ - prevZ) / rawDt, -14, 14);
      _tiltEuler.set(vz * rawDt * 1.4, 0, -vx * rawDt * 1.4);
      _tiltQuat.setFromEuler(_tiltEuler);
      _quat.set(
        body.quaternion.x,
        body.quaternion.y,
        body.quaternion.z,
        body.quaternion.w
      );
      _quat.premultiply(_tiltQuat).normalize();
      body.quaternion.set(_quat.x, _quat.y, _quat.z, _quat.w);
    }

    // 4. Live 120 Hz Physics Step (Pure Physics engine or live handoff)
    const maxSubSteps = this.isSoftwareGl ? 16 : 10;
    this.world.step(FIXED_TIME_STEP, rawDt, maxSubSteps);
    if (!draggedDie && this.rollActive) {
      this.simElapsed += rawDt;
    }

    let allSettled = !draggedDie && !this.returningDie;
    for (const die of this.activeDice) {
      if (die === draggedDie || die === returningDieRef) {
        die.mesh.position.set(
          die.body.position.x,
          die.body.position.y,
          die.body.position.z
        );
        die.mesh.quaternion.set(
          die.body.quaternion.x,
          die.body.quaternion.y,
          die.body.quaternion.z,
          die.body.quaternion.w
        );
        allSettled = false;
        continue;
      }

      applyEmergencyBounds(die.body, die.blueprint.restHeight);

      die.mesh.position.set(
        die.body.position.x,
        die.body.position.y,
        die.body.position.z
      );
      die.mesh.quaternion.set(
        die.body.quaternion.x,
        die.body.quaternion.y,
        die.body.quaternion.z,
        die.body.quaternion.w
      );

      const linSpeedSq = die.body.velocity.lengthSquared();
      const angSpeedSq = die.body.angularVelocity.lengthSquared();

      if (die.settled && (linSpeedSq > 0.06 || angSpeedSq > 0.06)) {
        die.settled = false;
        die.settledFrames = 0;
        die.cockedFrames = 0;
      }

      if (!die.settled) {
        _quat.set(
          die.body.quaternion.x,
          die.body.quaternion.y,
          die.body.quaternion.z,
          die.body.quaternion.w
        );
        const flatness = getDieFlatness(
          die.blueprint,
          _quat,
          _bottomNormal
        );
        const heightExcess = die.body.position.y - die.blueprint.restHeight;
        const isGroundedAndFlat = heightExcess <= 0.16 && flatness >= 0.965;
        if (!isGroundedAndFlat) {
          if (die.body.sleepState === CANNON.Body.SLEEPING) {
            die.body.wakeUp();
          }
          applyTiltedSettleAssist(
            die.body,
            die.blueprint,
            linSpeedSq,
            angSpeedSq,
            _bottomNormal,
            rawDt
          );
        }

        const isVerySlow =
          die.body.sleepState === CANNON.Body.SLEEPING ||
          (linSpeedSq < 0.045 && angSpeedSq < 0.05);

        if (isVerySlow && isGroundedAndFlat) {
          die.cockedFrames = 0;
          die.settledFrames += 1;
          if (die.settledFrames >= (this.isSoftwareGl ? 3 : 5)) {
            die.settled = true;
            die.body.velocity.setZero();
            die.body.angularVelocity.setZero();
          } else {
            allSettled = false;
          }
        } else {
          die.settledFrames = 0;
          allSettled = false;

          const isStuckStill =
            (die.body.sleepState === CANNON.Body.SLEEPING ||
              (linSpeedSq < 0.025 &&
                angSpeedSq < 0.06 &&
                Math.abs(die.body.velocity.y) < 0.12)) &&
            !isGroundedAndFlat;

          if (isStuckStill && die.nudgeCount < 3) {
            die.cockedFrames += 1;
            if (die.cockedFrames >= (this.isSoftwareGl ? 4 : 12)) {
              this.nudgeCockedOrStackedDie(die, heightExcess > 0.28);
            }
          } else {
            die.cockedFrames = 0;
          }
        }
      }
    }

    this.renderer.render(this.scene, this.camera);

    if (
      !draggedDie &&
      !this.returningDie &&
      this.rollActive &&
      (allSettled || this.simElapsed >= MAX_SIM_SECONDS)
    ) {
      if (this.simElapsed >= MAX_SIM_SECONDS) {
        this.ensureAllDiceFlatAndSeparated();
      }
      this.rollActive = false;
      this.stopLoop();
      this.emitSettledResults();
      return;
    }

    if (!draggedDie && !this.returningDie && !this.rollActive && allSettled) {
      this.stopLoop();
      return;
    }

    this.scheduleNextTick();
  }

  private emitSettledResults() {
    const results: LandedDieResult[] = this.activeDice.map((die) => {
      _quat.set(
        die.body.quaternion.x,
        die.body.quaternion.y,
        die.body.quaternion.z,
        die.body.quaternion.w
      );
      return {
        id: die.id,
        kind: die.kind,
        groupId: die.groupId,
        value: readLandedDieValue(die.blueprint, _quat),
      };
    });
    this.onSettledCallback?.(results);
  }

  public requestRender() {
    if (this.disposed || this.isRunningLoop) return;
    if (this.renderBusy) {
      this.renderDirty = true;
      return;
    }
    this.renderBusy = true;
    this.frameId = requestAnimationFrame(() => {
      if (this.disposed) return;
      this.renderDirty = false;
      this.renderer.render(this.scene, this.camera);
      const done = () => {
        this.renderBusy = false;
        if (this.renderDirty && !this.disposed && !this.isRunningLoop) {
          this.requestRender();
        }
      };
      if (this.isSoftwareGl) this.afterDraw(done);
      else done();
    });
  }

  private handleResize() {
    if (this.disposed) return;
    const width = Math.max(260, this.container.clientWidth);
    const height = Math.max(240, this.container.clientHeight);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
    this.requestRender();
  }

  public dispose() {
    this.disposed = true;
    this.cancelPrewarm();
    this.cancelPointerSession();
    this.returningDie = null;
    this.hybridPlayback = null;
    this.stopLoop();
    this.resizeObserver?.disconnect();
    const canvas = this.renderer.domElement;
    canvas.removeEventListener("webglcontextlost", this.boundContextLost);
    canvas.removeEventListener(
      "webglcontextrestored",
      this.boundContextRestored
    );
    canvas.removeEventListener("pointerdown", this.boundPointerDown);
    canvas.removeEventListener("pointermove", this.boundPointerMove);
    canvas.removeEventListener("pointerup", this.boundPointerUp);
    canvas.removeEventListener("pointercancel", this.boundPointerUp);
    canvas.removeEventListener("pointerleave", this.boundPointerLeave);
    this.removeAllDice();
    for (const bp of this.blueprintCache.values()) {
      disposeDieBlueprint(bp);
    }
    this.blueprintCache.clear();
    this.disposableResources.forEach((res) => res.dispose());
    this.envTex.dispose();
    this.renderer.dispose();
    this.container.innerHTML = "";
  }
}
