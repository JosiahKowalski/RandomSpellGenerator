import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import * as CANNON from "cannon-es";
import {
  buildDieBlueprint,
  BuiltDieBlueprint,
  DICE_FINISHES,
  DiceFinishId,
  DieKind,
  getDieFlatness,
  readLandedDieValue,
} from "./diceGeometry";
import { diceAudio } from "./diceAudio";

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
  kind: "reroll-die" | "grab-die" | "toss-die" | "toss-all";
  groupId?: string;
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
    }
  | {
      mode: "felt-gesture";
      pointerId: number;
      startX: number;
      startY: number;
    };

const TRAY_HALF_W = 5.6;
const TRAY_HALF_D = 3.5;
const RAIL_THICKNESS = 0.56;
const DRAG_HOVER_Y = 2.0;
const MAX_SIM_SECONDS = 5.5;
const FIXED_TIME_STEP = 1 / 120;

// Pre-allocated scratch helpers (zero GC inside animation loop)
const _quat = new THREE.Quaternion();
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
  private woodMaterial: CANNON.Material;

  private activeDice: ActiveDie[] = [];
  private disposableResources: Array<{ dispose: () => void }> = [];
  private finishId: DiceFinishId = "lapis";
  private maxAnisotropy = 4;

  private frameId = 0;
  private isRunningLoop = false;
  private simElapsed = 0;
  private lastTickMs = 0;
  private rollActive = false;
  private disposed = false;

  private renderBusy = false;
  private renderDirty = false;

  // Interactive hover & drag-and-toss state
  private pointerSession: PointerSession | null = null;
  private hoveredDie: ActiveDie | null = null;
  private lastHoverRaycastMs = 0;

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
    onInteraction?: (ev: TrayInteractionEvent) => void
  ) {
    this.container = container;
    this.finishId = initialFinish;
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

    // Crisp high-precision physics world
    const solver = new CANNON.GSSolver();
    solver.iterations = 12;
    this.world = new CANNON.World({
      gravity: new CANNON.Vec3(0, -32, 0),
      solver,
    });
    this.world.allowSleep = true;
    this.world.broadphase = new CANNON.SAPBroadphase(this.world);

    this.dieMaterial = new CANNON.Material("die");
    this.feltMaterial = new CANNON.Material("felt");
    this.woodMaterial = new CANNON.Material("wood");

    this.world.addContactMaterial(
      new CANNON.ContactMaterial(this.dieMaterial, this.feltMaterial, {
        friction: 0.52,
        restitution: 0.28,
        contactEquationStiffness: 1e7,
        contactEquationRelaxation: 3,
      })
    );
    this.world.addContactMaterial(
      new CANNON.ContactMaterial(this.dieMaterial, this.woodMaterial, {
        friction: 0.2,
        restitution: 0.58,
        contactEquationStiffness: 1e7,
        contactEquationRelaxation: 3,
      })
    );
    this.world.addContactMaterial(
      new CANNON.ContactMaterial(this.dieMaterial, this.dieMaterial, {
        friction: 0.12, // low die-on-die friction prevents dice from balancing atop each other
        restitution: 0.44,
        contactEquationStiffness: 1e7,
        contactEquationRelaxation: 3,
      })
    );

    this.buildDiceTray();

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
  }

  private buildDiceTray() {
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

    // 2. Subtle inlaid brass border trim on felt
    const insetW = TRAY_HALF_W * 2 - 0.55;
    const insetD = TRAY_HALF_D * 2 - 0.55;
    const trimMat = new THREE.MeshStandardMaterial({
      color: 0xd4a44a,
      roughness: 0.34,
      metalness: 0.82,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    this.disposableResources.push(trimMat);

    const trimBars: Array<[number, number, number, number]> = [
      [insetW, 0.04, 0, -insetD / 2],
      [insetW, 0.04, 0, insetD / 2],
      [0.04, insetD, -insetW / 2, 0],
      [0.04, insetD, insetW / 2, 0],
    ];
    for (const [w, d, x, z] of trimBars) {
      const g = new THREE.PlaneGeometry(w, d);
      const m = new THREE.Mesh(g, trimMat);
      m.rotation.x = -Math.PI / 2;
      m.position.set(x, 0.006, z);
      trayGroup.add(m);
      this.disposableResources.push(g);
    }

    // 3. Crafted walnut wooden frame rails (tall enough to cradle dice visibly)
    const woodMat = new THREE.MeshStandardMaterial({
      map: walnutTex,
      roughness: 0.48,
      metalness: 0.04,
    });
    this.disposableResources.push(woodMat);

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

    // Physics floor plane
    const floorBody = new CANNON.Body({
      type: CANNON.Body.STATIC,
      material: this.feltMaterial,
      shape: new CANNON.Plane(),
    });
    floorBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    this.world.addBody(floorBody);

    // 4 thick seamless containment walls aligned 1:1 with the visual walnut rail inner faces
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
        material: this.woodMaterial,
        shape: new CANNON.Box(new CANNON.Vec3(w / 2, h / 2, d / 2)),
      });
      wall.position.set(x, y, z);
      this.world.addBody(wall);
    }

    // Invisible containment lid high enough for natural toss arcs, well below wall top
    const ceiling = new CANNON.Body({
      type: CANNON.Body.STATIC,
      material: this.woodMaterial,
      shape: new CANNON.Plane(),
    });
    ceiling.quaternion.setFromEuler(Math.PI / 2, 0, 0);
    ceiling.position.set(0, 6.2, 0);
    this.world.addBody(ceiling);
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
    const meshes = this.activeDice.map((d) => d.mesh);
    const hits = _raycaster.intersectObjects(meshes, false);
    if (hits.length === 0) return null;
    const hitMesh = hits[0].object;
    return this.activeDice.find((d) => d.mesh === hitMesh) ?? null;
  }

  private raycastDragPlane(
    e: PointerEvent,
    die: ActiveDie
  ): { x: number; z: number } | null {
    this.updatePointerNdc(e);
    _raycaster.setFromCamera(_pointerNdc, this.camera);
    const hit = _raycaster.ray.intersectPlane(_dragPlane, _planeHit);
    if (!hit) return null;
    const margin = Math.max(0.65, die.blueprint.restHeight + 0.16);
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

  private setDieEmissive(die: ActiveDie, hex: number) {
    for (const mat of die.blueprint.materials) {
      mat.emissive.setHex(hex);
    }
  }

  private setHoveredDie(next: ActiveDie | null) {
    if (this.hoveredDie === next) return;
    if (this.hoveredDie) {
      this.setDieEmissive(this.hoveredDie, 0x000000);
    }
    this.hoveredDie = next;
    if (this.hoveredDie) {
      this.setDieEmissive(this.hoveredDie, 0x1b2638);
    }
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
    diceAudio.unlock();
    const pan = THREE.MathUtils.clamp(
      die.body.position.x / TRAY_HALF_W,
      -0.7,
      0.7
    );
    diceAudio.playPickup(pan);

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

    this.setDieEmissive(die, 0x293b56);

    this.pointerSession = {
      mode: "dragging-die",
      pointerId,
      die,
      targetX: initialX,
      targetZ: initialZ,
      samples: [{ x: initialX, z: initialZ, t: performance.now() }],
    };

    this.updateCursor();
    this.onInteractionCallback?.({ kind: "grab-die", groupId: die.groupId });
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
      this.setDieEmissive(die, this.hoveredDie === die ? 0x1b2638 : 0x000000);

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

      die.body.type = CANNON.Body.DYNAMIC;
      die.body.mass = 1.2;
      die.body.updateMassProperties();
      die.body.collisionResponse = true;
      die.body.wakeUp();
      die.settled = false;
      die.settledFrames = 0;
      die.cockedFrames = 0;
      die.nudgeCount = 0;

      const isFlick = speed >= 2.0;
      const pan = THREE.MathUtils.clamp(
        die.body.position.x / TRAY_HALF_W,
        -0.7,
        0.7
      );
      if (isFlick) {
        diceAudio.playThrow(1, pan);
        die.body.velocity.set(vx, Math.min(2.6, 0.35 + speed * 0.14), vz);
        const spinScale = Math.min(24, 10 + speed * 1.15);
        die.body.angularVelocity.set(
          (vz / Math.max(1, speed)) * spinScale + (Math.random() - 0.5) * 8,
          (Math.random() - 0.5) * 14,
          (-vx / Math.max(1, speed)) * spinScale + (Math.random() - 0.5) * 8
        );
      } else {
        // Gentle drop with slight natural tumble
        die.body.velocity.set(vx * 0.4, -1.2, vz * 0.4);
        die.body.angularVelocity.set(
          (Math.random() - 0.5) * 5,
          (Math.random() - 0.5) * 5,
          (Math.random() - 0.5) * 5
        );
      }

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
      const effectiveFinishId =
        die.kind === "d10_tens"
          ? finishId === "sienna"
            ? "obsidian"
            : "sienna"
          : finishId;
      die.finishId = effectiveFinishId;
      const newBp = buildDieBlueprint(
        die.kind,
        DICE_FINISHES[effectiveFinishId],
        this.maxAnisotropy
      );
      die.blueprint.materials.forEach((m) => m.dispose());
      die.blueprint.textures.forEach((t) => t.dispose());
      die.blueprint.geometry.dispose();

      die.mesh.geometry = newBp.geometry;
      die.mesh.material = newBp.materials;
      die.blueprint = newBp;
    }
    this.requestRender();
  }

  public clearTray() {
    this.cancelPointerSession();
    this.rollActive = false;
    this.stopLoop();
    this.removeAllDice();
    this.updateCursor();
    this.requestRender();
  }

  private cancelPointerSession() {
    if (this.pointerSession?.mode === "pending-die") {
      window.clearTimeout(this.pointerSession.holdTimer);
    }
    this.pointerSession = null;
    this.hoveredDie = null;
  }

  private removeAllDice() {
    for (const die of this.activeDice) {
      this.scene.remove(die.mesh);
      this.world.removeBody(die.body);
      die.blueprint.geometry.dispose();
      die.blueprint.materials.forEach((m) => m.dispose());
      die.blueprint.textures.forEach((t) => t.dispose());
    }
    this.activeDice = [];
  }

  public rollDice(
    requests: RollDieRequest[],
    throwDir?: { x: number; z: number }
  ) {
    if (this.disposed || requests.length === 0) return;

    this.cancelPointerSession();
    diceAudio.unlock();
    this.removeAllDice();

    const dirX = throwDir ? THREE.MathUtils.clamp(throwDir.x, -1, 1) : 1;
    const dirZ = throwDir
      ? THREE.MathUtils.clamp(throwDir.z, -1, 1)
      : (Math.random() - 0.5) * 0.35;

    diceAudio.playThrow(requests.length, -dirX * 0.35);

    const count = requests.length;
    const cols = Math.min(4, Math.ceil(Math.sqrt(count)));
    const rows = Math.ceil(count / cols);

    requests.forEach((req, idx) => {
      const finishKey =
        req.accentFinish ||
        (req.kind === "d10_tens"
          ? this.finishId === "sienna"
            ? "obsidian"
            : "sienna"
          : this.finishId);

      const bp = buildDieBlueprint(
        req.kind,
        DICE_FINISHES[finishKey],
        this.maxAnisotropy
      );

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
        sleepSpeedLimit: 0.12,
        sleepTimeLimit: 0.65,
      });

      // Wide staggered spawn with gentle fan-out so big handfuls scatter cleanly across the felt
      const col = idx % cols;
      const row = Math.floor(idx / cols);
      const spacingX = count > 8 ? 1.15 : 1.35;
      const spacingZ = count > 8 ? 1.15 : 1.32;
      const startX = -dirX * 2.6 + (row - (rows - 1) / 2) * spacingX;
      const startZ =
        (col - (cols - 1) / 2) * spacingZ + (Math.random() - 0.5) * 0.28;
      const startY = Math.min(4.2, 2.0 + (idx % 3) * 0.45 + Math.random() * 0.25);

      const spawnMargin = Math.max(0.85, bp.radius * 0.9);
      body.position.set(
        THREE.MathUtils.clamp(
          startX,
          -(TRAY_HALF_W - spawnMargin),
          TRAY_HALF_W - spawnMargin
        ),
        startY,
        THREE.MathUtils.clamp(
          startZ,
          -(TRAY_HALF_D - spawnMargin),
          TRAY_HALF_D - spawnMargin
        )
      );

      body.quaternion.setFromEuler(
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 2
      );

      const fanZ = (col - (cols - 1) / 2) * 1.1;
      const throwSpeed = 6.2 + Math.random() * 4.4;
      body.velocity.set(
        dirX * throwSpeed + (Math.random() - 0.5) * 2.4,
        -1.2 + Math.random() * 1.3,
        dirZ * 3.8 + fanZ + (Math.random() - 0.5) * 2.6
      );
      body.angularVelocity.set(
        (Math.random() - 0.5) * 20,
        (Math.random() - 0.5) * 18,
        (Math.random() - 0.5) * 20
      );

      body.addEventListener(
        "collide",
        (ev: { body: CANNON.Body; contact: CANNON.ContactEquation }) => {
          const impact = Math.abs(ev.contact.getImpactVelocityAlongNormal());
          const surface =
            ev.body.material === this.dieMaterial
              ? "die"
              : ev.body.material === this.woodMaterial
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

      mesh.position.set(body.position.x, body.position.y, body.position.z);
      mesh.quaternion.set(
        body.quaternion.x,
        body.quaternion.y,
        body.quaternion.z,
        body.quaternion.w
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
      });
    });

    this.simElapsed = 0;
    this.rollActive = true;
    this.updateCursor();
    this.startLoop();
  }

  /**
   * Crisp tabletop in-place flip for a single die (or d100 pair) without teleporting
   * or slamming sideways into neighboring dice.
   */
  public rerollDieByGroup(groupId: string): boolean {
    const targets = this.activeDice.filter((d) => d.groupId === groupId);
    if (targets.length === 0) return false;

    diceAudio.unlock();

    for (const die of targets) {
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

      // Compute a gentle lateral drift away from immediate neighbors & tray edges
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

      // Clamp lateral velocity so a clicked die stays neatly near its area instead of wrecking other dice
      const driftLen = Math.hypot(driftX, driftZ);
      if (driftLen > 2.6) {
        driftX = (driftX / driftLen) * 2.6;
        driftZ = (driftZ / driftLen) * 2.6;
      }

      // Smooth upward tabletop flip from its resting position (no jarring teleport, peaks cleanly ~1.9u high)
      die.body.position.y = Math.max(die.body.position.y, die.blueprint.restHeight) + 0.06;
      die.body.velocity.set(
        driftX + (Math.random() - 0.5) * 1.4,
        8.6 + Math.random() * 1.4,
        driftZ + (Math.random() - 0.5) * 1.4
      );

      // Lively guaranteed multi-axis spin so it flips cleanly onto a fresh random face
      const sx = Math.random() < 0.5 ? -1 : 1;
      const sz = Math.random() < 0.5 ? -1 : 1;
      die.body.angularVelocity.set(
        sx * (15 + Math.random() * 9),
        (Math.random() - 0.5) * 18,
        sz * (15 + Math.random() * 9)
      );
    }

    this.simElapsed = 0;
    this.rollActive = true;
    this.startLoop();
    return true;
  }

  // ---------- Calm, Natural Anti-Stacking & Anti-Cocked Settlement ----------

  private nudgeCockedOrStackedDie(die: ActiveDie, isStacked: boolean) {
    die.body.wakeUp();
    die.cockedFrames = 0;
    die.settledFrames = 0;
    die.nudgeCount += 1;

    // Gentle lateral push away from the closest neighbor (or away from a rail)
    let pushX = -die.body.position.x * 0.35;
    let pushZ = -die.body.position.z * 0.35;

    let nearestDistSq = Infinity;
    let nearDx = 0;
    let nearDz = 0;
    for (const other of this.activeDice) {
      if (other === die) continue;
      const dx = die.body.position.x - other.body.position.x;
      const dz = die.body.position.z - other.body.position.z;
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
        const ang = Math.random() * Math.PI * 2;
        pushX = Math.cos(ang) * pushSpeed;
        pushZ = Math.sin(ang) * pushSpeed;
      }
    } else {
      const len = Math.hypot(pushX, pushZ) || 1;
      pushX = (pushX / len) * pushSpeed;
      pushZ = (pushZ / len) * pushSpeed;
    }

    die.body.velocity.set(pushX, isStacked ? 0.35 : 0.05, pushZ);

    // Gentle righting torque so the die tips smoothly onto its nearest flat face (no popcorn jumping)
    _quat.set(
      die.body.quaternion.x,
      die.body.quaternion.y,
      die.body.quaternion.z,
      die.body.quaternion.w
    );
    getDieFlatness(die.blueprint, _quat, _bottomNormal);
    _torqueAxis.crossVectors(_bottomNormal, _downVec);
    if (_torqueAxis.lengthSq() > 0.0004) {
      _torqueAxis.normalize();
      die.body.angularVelocity.set(
        _torqueAxis.x * 3.2,
        0,
        _torqueAxis.z * 3.2
      );
    }
  }

  /**
   * Final safety pass if MAX_SIM_SECONDS elapses during an extreme dense pileup:
   * guarantees zero cocked or stacked dice at rest.
   */
  private ensureAllDiceFlatAndSeparated() {
    for (const die of this.activeDice) {
      _quat.set(
        die.body.quaternion.x,
        die.body.quaternion.y,
        die.body.quaternion.z,
        die.body.quaternion.w
      );
      const flatness = getDieFlatness(die.blueprint, _quat, _bottomNormal);
      const heightExcess = die.body.position.y - die.blueprint.restHeight;

      if (flatness < 0.975 || heightExcess > 0.18) {
        if (_bottomNormal.lengthSq() > 0.001) {
          _alignQuat.setFromUnitVectors(_bottomNormal.normalize(), _downVec);
          _quat.premultiply(_alignQuat).normalize();
          die.body.quaternion.set(_quat.x, _quat.y, _quat.z, _quat.w);
        }
        die.body.position.y = die.blueprint.restHeight;
      }

      die.body.velocity.setZero();
      die.body.angularVelocity.setZero();
      die.settled = true;
    }

    // Gentle iterative XZ separation only if dice overlap after unstacking
    for (let pass = 0; pass < 4; pass++) {
      for (let i = 0; i < this.activeDice.length; i++) {
        const a = this.activeDice[i];
        const marginA = Math.max(0.62, a.blueprint.restHeight + 0.12);
        for (let j = i + 1; j < this.activeDice.length; j++) {
          const b = this.activeDice[j];
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
        a.mesh.position.set(
          a.body.position.x,
          a.body.position.y,
          a.body.position.z
        );
        a.mesh.quaternion.set(
          a.body.quaternion.x,
          a.body.quaternion.y,
          a.body.quaternion.z,
          a.body.quaternion.w
        );
      }
    }

    this.renderer.render(this.scene, this.camera);
  }

  // ---------- Loop & Simulation ----------

  private startLoop() {
    if (this.isRunningLoop || this.disposed) return;
    this.isRunningLoop = true;
    this.lastTickMs = performance.now();
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

    const draggedDie =
      this.pointerSession?.mode === "dragging-die"
        ? this.pointerSession.die
        : null;

    // Smoothly track pointer for any held die before stepping physics
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

    // High-precision physics step (120 Hz fixed step eliminates corner jitter & tunneling)
    const maxSubSteps = this.isSoftwareGl ? 16 : 10;
    this.world.step(FIXED_TIME_STEP, rawDt, maxSubSteps);
    if (!draggedDie && this.rollActive) {
      this.simElapsed += rawDt;
    }

    let allSettled = !draggedDie;
    for (const die of this.activeDice) {
      if (die === draggedDie) {
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

      // Emergency out-of-bounds failsafe ONLY if a die penetrates deep past the real CANNON walnut walls
      // Never interferes with normal rail bounces (which happen naturally at TRAY_HALF_W / TRAY_HALF_D)
      const emergencyMargin = die.blueprint.restHeight * 0.72;
      const emergencyMaxX = TRAY_HALF_W - emergencyMargin;
      const emergencyMaxZ = TRAY_HALF_D - emergencyMargin;
      if (die.body.position.x > emergencyMaxX) {
        die.body.position.x = emergencyMaxX;
        die.body.velocity.x = -Math.abs(die.body.velocity.x) * 0.45;
      } else if (die.body.position.x < -emergencyMaxX) {
        die.body.position.x = -emergencyMaxX;
        die.body.velocity.x = Math.abs(die.body.velocity.x) * 0.45;
      }
      if (die.body.position.z > emergencyMaxZ) {
        die.body.position.z = emergencyMaxZ;
        die.body.velocity.z = -Math.abs(die.body.velocity.z) * 0.45;
      } else if (die.body.position.z < -emergencyMaxZ) {
        die.body.position.z = -emergencyMaxZ;
        die.body.velocity.z = Math.abs(die.body.velocity.z) * 0.45;
      }
      if (die.body.position.y > 5.8) {
        die.body.position.y = 5.8;
        die.body.velocity.y = -Math.abs(die.body.velocity.y) * 0.35;
      } else if (die.body.position.y < die.blueprint.restHeight * 0.5) {
        die.body.position.y = die.blueprint.restHeight * 0.5;
        die.body.velocity.y = Math.max(0, die.body.velocity.y);
      }

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

      // If a settled die gets bumped by another die, let it re-settle cleanly
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
        const flatness = getDieFlatness(die.blueprint, _quat);
        const heightExcess = die.body.position.y - die.blueprint.restHeight;
        const isGroundedAndFlat = heightExcess <= 0.16 && flatness >= 0.965;

        const isVerySlow =
          die.body.sleepState === CANNON.Body.SLEEPING ||
          (linSpeedSq < 0.035 && angSpeedSq < 0.04);

        if (isVerySlow && isGroundedAndFlat) {
          die.cockedFrames = 0;
          die.settledFrames += 1;
          if (die.settledFrames >= (this.isSoftwareGl ? 3 : 8)) {
            die.settled = true;
            die.body.velocity.setZero();
            die.body.angularVelocity.setZero();
          } else {
            allSettled = false;
          }
        } else {
          die.settledFrames = 0;
          allSettled = false;

          // Only nudge if genuinely stuck still (never while falling/arcing in mid-air or naturally tipping)
          const isStuckStill =
            (die.body.sleepState === CANNON.Body.SLEEPING ||
              (linSpeedSq < 0.025 &&
                angSpeedSq < 0.06 &&
                Math.abs(die.body.velocity.y) < 0.12)) &&
            !isGroundedAndFlat;

          if (isStuckStill && die.nudgeCount < 3) {
            die.cockedFrames += 1;
            if (die.cockedFrames >= (this.isSoftwareGl ? 5 : 24)) {
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

    if (!draggedDie && !this.rollActive && allSettled) {
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
    this.cancelPointerSession();
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
    this.disposableResources.forEach((res) => res.dispose());
    this.envTex.dispose();
    this.renderer.dispose();
    this.container.innerHTML = "";
  }
}
