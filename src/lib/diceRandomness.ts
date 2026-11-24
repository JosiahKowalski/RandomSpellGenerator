import * as THREE from "three";
import type { BuiltDieBlueprint, DieKind } from "./diceGeometry";

export type DiceRandomnessEngine = "physics" | "hybrid";
export type DiceGentleDropMode = "concealed-drop" | "put-back";

export interface DiceTraySettings {
  randomnessEngine: DiceRandomnessEngine;
  gentleDropMode: DiceGentleDropMode;
}

export const DEFAULT_DICE_SETTINGS: DiceTraySettings = {
  randomnessEngine: "physics",
  gentleDropMode: "concealed-drop",
};

const DICE_SETTINGS_STORAGE_KEY = "spell_randomizer_dice_settings_v1";

export function loadDiceSettings(): DiceTraySettings {
  try {
    const raw = window.localStorage.getItem(DICE_SETTINGS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_DICE_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<DiceTraySettings>;
    const randomnessEngine: DiceRandomnessEngine =
      parsed.randomnessEngine === "hybrid" ? "hybrid" : "physics";
    const gentleDropMode: DiceGentleDropMode =
      parsed.gentleDropMode === "put-back" ? "put-back" : "concealed-drop";
    return { randomnessEngine, gentleDropMode };
  } catch {
    return { ...DEFAULT_DICE_SETTINGS };
  }
}

export function saveDiceSettings(settings: DiceTraySettings): void {
  try {
    window.localStorage.setItem(
      DICE_SETTINGS_STORAGE_KEY,
      JSON.stringify(settings)
    );
  } catch {
    // ignore storage quota / privacy-mode failures
  }
}

// ---------- Cryptographically Secure Uniform RNG ----------

const _u32Buf = new Uint32Array(1);

function nextUint32(): number {
  if (
    typeof globalThis.crypto !== "undefined" &&
    typeof globalThis.crypto.getRandomValues === "function"
  ) {
    globalThis.crypto.getRandomValues(_u32Buf);
    return _u32Buf[0]!;
  }
  // Fallback only in environments without Web Crypto
  return (Math.random() * 0x100000000) >>> 0;
}

/**
 * Unbiased cryptographically random float in [0, 1).
 */
export function cryptoRandomFloat(): number {
  return nextUint32() / 0x100000000;
}

/**
 * Unbiased cryptographically random float in [min, max).
 */
export function cryptoRandomRange(min: number, max: number): number {
  return min + cryptoRandomFloat() * (max - min);
}

/**
 * Rejection-sampled unbiased integer in [0, maxExclusive). Zero modulo bias.
 */
export function cryptoRandomInt(maxExclusive: number): number {
  if (maxExclusive <= 1) return 0;
  const limit = Math.floor(0x100000000 / maxExclusive) * maxExclusive;
  let value = nextUint32();
  while (value >= limit) {
    value = nextUint32();
  }
  return value % maxExclusive;
}

/**
 * Exact uniform 3D rotation on SO(3) (Haar measure) via Shoemake's algorithm.
 * Eliminates the ~29% Euler-angle gimbal-lock pole clustering skew.
 */
export function cryptoUniformQuaternion(
  target = new THREE.Quaternion()
): THREE.Quaternion {
  const u1 = cryptoRandomFloat();
  const u2 = cryptoRandomFloat();
  const u3 = cryptoRandomFloat();

  const sqrt1MinusU1 = Math.sqrt(1 - u1);
  const sqrtU1 = Math.sqrt(u1);
  const theta1 = 2 * Math.PI * u2;
  const theta2 = 2 * Math.PI * u3;

  target.set(
    sqrt1MinusU1 * Math.sin(theta1),
    sqrt1MinusU1 * Math.cos(theta1),
    sqrtU1 * Math.sin(theta2),
    sqrtU1 * Math.cos(theta2)
  );
  return target.normalize();
}

/**
 * Sample an angular velocity vector along a uniform random 3D axis (S²)
 * with guaranteed minimum magnitude so dice never drop with near-zero spin.
 */
export function cryptoMinimumSpinVector(
  minSpeed: number,
  maxSpeed: number
): { x: number; y: number; z: number } {
  const z = cryptoRandomRange(-1, 1);
  const phi = cryptoRandomRange(0, Math.PI * 2);
  const r = Math.sqrt(Math.max(0, 1 - z * z));
  const mag = cryptoRandomRange(minSpeed, maxSpeed);
  return {
    x: r * Math.cos(phi) * mag,
    y: z * mag,
    z: r * Math.sin(phi) * mag,
  };
}

// ---------- Exact Polyhedral Proper Rotational Symmetry Groups (SO(3)) ----------

const symmetryGroupCache = new Map<DieKind, THREE.Quaternion[]>();

function isVertexSetPreserved(
  rotMat: THREE.Matrix4,
  vertices: THREE.Vector3[],
  tolerance = 2e-3
): boolean {
  const transformed = new THREE.Vector3();
  const tolSq = tolerance * tolerance;
  for (const v of vertices) {
    transformed.copy(v).applyMatrix4(rotMat);
    let matched = false;
    for (const candidate of vertices) {
      if (transformed.distanceToSquared(candidate) <= tolSq) {
        matched = true;
        break;
      }
    }
    if (!matched) return false;
  }
  return true;
}

function buildOrthonormalFrame(
  normal: THREE.Vector3,
  vertex: THREE.Vector3
): THREE.Matrix4 | null {
  const n = normal.clone().normalize();
  const proj = vertex.clone().addScaledVector(n, -vertex.dot(n));
  if (proj.lengthSq() < 1e-6) return null;
  const t = proj.normalize();
  const b = new THREE.Vector3().crossVectors(n, t).normalize();
  const m = new THREE.Matrix4();
  m.makeBasis(n, t, b);
  return m;
}

/**
 * Generates and caches the complete proper rotational symmetry group (det = +1)
 * for any isohedral die polyhedron directly from its exact vertices & faces:
 *   d4: A4 (12), d6: S4 (24), d8: S4 (24), d10/d10_tens: D5 (10), d12/d20: A5 (60).
 */
export function getPolyhedronSymmetryGroup(
  blueprint: BuiltDieBlueprint
): THREE.Quaternion[] {
  const cached = symmetryGroupCache.get(blueprint.kind);
  if (cached) return cached;

  const verts = blueprint.localVertices;
  const facePolys = blueprint.faceVertexIndices;
  const faces = blueprint.faces;

  if (verts.length === 0 || facePolys.length === 0) {
    const identity = [new THREE.Quaternion()];
    symmetryGroupCache.set(blueprint.kind, identity);
    return identity;
  }

  // Reference orthonormal frame built from face 0 and its first vertex
  const refFace = facePolys[0]!;
  const refFrame = buildOrthonormalFrame(
    faces[0]!.normal,
    verts[refFace[0]!]!
  );
  if (!refFrame) {
    const identity = [new THREE.Quaternion()];
    symmetryGroupCache.set(blueprint.kind, identity);
    return identity;
  }
  const refFrameT = refFrame.clone().transpose();

  const group: THREE.Quaternion[] = [];
  const rotMat = new THREE.Matrix4();

  for (let fi = 0; fi < facePolys.length; fi++) {
    const poly = facePolys[fi]!;
    const normal = faces[fi]!.normal;
    for (let vi = 0; vi < poly.length; vi++) {
      const targetFrame = buildOrthonormalFrame(normal, verts[poly[vi]!]!);
      if (!targetFrame) continue;

      rotMat.multiplyMatrices(targetFrame, refFrameT);
      if (rotMat.determinant() < 0.5) continue;
      if (!isVertexSetPreserved(rotMat, verts)) continue;

      const q = new THREE.Quaternion().setFromRotationMatrix(rotMat).normalize();
      // Deduplicate (q and -q represent the same 3D rotation)
      const exists = group.some((g) => Math.abs(g.dot(q)) > 0.9995);
      if (!exists) {
        group.push(q);
      }
    }
  }

  if (group.length === 0) {
    group.push(new THREE.Quaternion());
  }

  symmetryGroupCache.set(blueprint.kind, group);
  return group;
}

function getValueDirectionVector(
  blueprint: BuiltDieBlueprint,
  value: number
): THREE.Vector3 | null {
  if (blueprint.kind === "d4" && blueprint.d4Vertices) {
    const vert = blueprint.d4Vertices.find((v) => v.value === value);
    return vert ? vert.position.clone().normalize() : null;
  }
  const face = blueprint.faces.find((f) => f.value === value);
  return face ? face.normal.clone().normalize() : null;
}

/**
 * Draw an unbiased cryptographic target face value valid for this die blueprint.
 * (Handles d10_tens [0,10..90], d10 [1..10], and standard 1..N polyhedra.)
 */
export function drawCryptoFaceValue(blueprint: BuiltDieBlueprint): number {
  if (blueprint.kind === "d4" && blueprint.d4Vertices) {
    const idx = cryptoRandomInt(blueprint.d4Vertices.length);
    return blueprint.d4Vertices[idx]!.value;
  }
  const idx = cryptoRandomInt(blueprint.faces.length);
  return blueprint.faces[idx]!.value;
}

/**
 * Finds an exact proper rotational symmetry R_sym of the die such that:
 *   R_sym * dir(targetValue) = dir(simLandedValue)
 *
 * Multiplying every recorded frame of the simulated die on the right by R_sym:
 *   q_render(t) = q_sim(t) * R_sym
 * preserves the exact 3D polyhedron hull at every bounce/collision while landing
 * naturally with `targetValue` pointing straight up!
 */
export function findSymmetryRotation(
  blueprint: BuiltDieBlueprint,
  targetValue: number,
  simLandedValue: number
): THREE.Quaternion {
  const targetDir = getValueDirectionVector(blueprint, targetValue);
  const simDir = getValueDirectionVector(blueprint, simLandedValue);
  if (!targetDir || !simDir) {
    return new THREE.Quaternion();
  }

  const group = getPolyhedronSymmetryGroup(blueprint);
  const rotated = new THREE.Vector3();
  const matches: THREE.Quaternion[] = [];

  for (const sym of group) {
    rotated.copy(targetDir).applyQuaternion(sym);
    if (rotated.dot(simDir) > 0.998) {
      matches.push(sym);
    }
  }

  if (matches.length === 0) {
    return new THREE.Quaternion();
  }

  // Pick uniformly among all valid in-plane rotations around the landed face
  const picked = matches[cryptoRandomInt(matches.length)]!;
  return picked.clone();
}
