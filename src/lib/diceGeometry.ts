import * as THREE from "three";
import * as CANNON from "cannon-es";

export type DieKind = "d4" | "d6" | "d8" | "d10" | "d10_tens" | "d12" | "d20";
export type DiceFinishId = "lapis" | "ivory" | "obsidian" | "sienna";

export interface DiceFinishTheme {
  id: DiceFinishId;
  label: string;
  bodyHex: string;
  edgeHex: string;
  inkHex: string;
  critHex: string;
  swatchHex: string;
  roughness: number;
  metalness: number;
  clearcoat: number;
}

export const DICE_FINISHES: Record<DiceFinishId, DiceFinishTheme> = {
  lapis: {
    id: "lapis",
    label: "Lapis & Gold",
    bodyHex: "#1E3A8A",
    edgeHex: "#3B82F6",
    inkHex: "#F5E6C8",
    critHex: "#F59E0B",
    swatchHex: "#1D4ED8",
    roughness: 0.36,
    metalness: 0.06,
    clearcoat: 0.32,
  },
  ivory: {
    id: "ivory",
    label: "Ivory & Ink",
    bodyHex: "#EFE9DC",
    edgeHex: "#C7BCA7",
    inkHex: "#1C1917",
    critHex: "#9A3412",
    swatchHex: "#E8E0CF",
    roughness: 0.42,
    metalness: 0.02,
    clearcoat: 0.24,
  },
  obsidian: {
    id: "obsidian",
    label: "Obsidian & Brass",
    bodyHex: "#1E1C1A",
    edgeHex: "#44403C",
    inkHex: "#F59E0B",
    critHex: "#FDE68A",
    swatchHex: "#24211E",
    roughness: 0.34,
    metalness: 0.12,
    clearcoat: 0.36,
  },
  sienna: {
    id: "sienna",
    label: "Sienna & Cream",
    bodyHex: "#7C2D12",
    edgeHex: "#C2410C",
    inkHex: "#FBF9F5",
    critHex: "#FCD34D",
    swatchHex: "#9A3412",
    roughness: 0.38,
    metalness: 0.08,
    clearcoat: 0.3,
  },
};

export interface FaceDescriptor {
  value: number;
  normal: THREE.Vector3;
}

export interface VertexDescriptor {
  value: number;
  position: THREE.Vector3;
}

export interface BuiltDieBlueprint {
  kind: DieKind;
  geometry: THREE.BufferGeometry;
  materials: THREE.MeshPhysicalMaterial[];
  hoverMaterials: THREE.MeshPhysicalMaterial[];
  heldMaterials: THREE.MeshPhysicalMaterial[];
  droppedMaterials: THREE.MeshPhysicalMaterial[];
  textures: THREE.CanvasTexture[];
  concealedMaterial: THREE.MeshPhysicalMaterial;
  concealedMaterials: THREE.MeshPhysicalMaterial[];
  concealedTexture: THREE.CanvasTexture;
  shape: CANNON.Shape;
  faces: FaceDescriptor[];
  localVertices: THREE.Vector3[];
  faceVertexIndices: number[][];
  d4Vertices?: VertexDescriptor[];
  radius: number;
  restHeight: number;
}

export function disposeDieBlueprint(bp: BuiltDieBlueprint): void {
  bp.geometry.dispose();
  bp.materials.forEach((m) => m.dispose());
  bp.hoverMaterials.forEach((m) => m.dispose());
  bp.heldMaterials.forEach((m) => m.dispose());
  bp.droppedMaterials.forEach((m) => m.dispose());
  bp.textures.forEach((t) => t.dispose());
  bp.concealedMaterial.dispose();
  bp.concealedTexture.dispose();
}

function createFaceTexture(
  label: string,
  finish: DiceFinishTheme,
  shapeType: "square" | "triangle" | "pentagon" | "kite",
  maxAnisotropy: number,
  options?: {
    highlight?: boolean;
    underline?: boolean;
    fontScale?: number;
  }
): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;

  // Base resin fill
  ctx.fillStyle = finish.bodyHex;
  ctx.fillRect(0, 0, size, size);

  // Subtle radial shading inside the facet for depth
  const grad = ctx.createRadialGradient(
    size * 0.45,
    size * 0.4,
    size * 0.05,
    size * 0.5,
    size * 0.5,
    size * 0.65
  );
  grad.addColorStop(0, "rgba(255,255,255,0.09)");
  grad.addColorStop(1, "rgba(0,0,0,0.16)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  // Crisp subtle facet bevel line
  ctx.strokeStyle = finish.edgeHex;
  ctx.lineWidth = 6;
  ctx.globalAlpha = 0.42;

  let centerX = size * 0.5;
  let centerY = size * 0.5;

  if (shapeType === "square") {
    ctx.strokeRect(14, 14, size - 28, size - 28);
  } else if (shapeType === "triangle") {
    const a: [number, number] = [size * 0.5, size * 0.08];
    const b: [number, number] = [size * 0.09, size * 0.79];
    const c: [number, number] = [size * 0.91, size * 0.79];
    centerX = (a[0] + b[0] + c[0]) / 3;
    centerY = (a[1] + b[1] + c[1]) / 3;
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(b[0], b[1]);
    ctx.lineTo(c[0], c[1]);
    ctx.closePath();
    ctx.stroke();
  } else if (shapeType === "pentagon") {
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const ang = -Math.PI / 2 + (i * Math.PI * 2) / 5;
      const x = size * 0.5 + size * 0.43 * Math.cos(ang);
      const y = size * 0.5 + size * 0.43 * Math.sin(ang);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();
  } else if (shapeType === "kite") {
    const top: [number, number] = [size * 0.5, size * 0.06];
    const left: [number, number] = [size * 0.14, size * 0.56];
    const bottom: [number, number] = [size * 0.5, size * 0.86];
    const right: [number, number] = [size * 0.86, size * 0.56];
    centerX = size * 0.5;
    centerY = size * 0.52;
    ctx.beginPath();
    ctx.moveTo(top[0], top[1]);
    ctx.lineTo(left[0], left[1]);
    ctx.lineTo(bottom[0], bottom[1]);
    ctx.lineTo(right[0], right[1]);
    ctx.closePath();
    ctx.stroke();
  }

  ctx.globalAlpha = 1;

  // Engraved numeral
  const fontSize = Math.round(
    (label.length >= 2 ? 78 : 96) * (options?.fontScale ?? 1)
  );
  ctx.font = `700 ${fontSize}px "Fraunces", Georgia, serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  // Subtle recessed engraving shadow
  ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
  ctx.fillText(label, centerX + 2, centerY + 3);

  ctx.fillStyle = options?.highlight ? finish.critHex : finish.inkHex;
  ctx.fillText(label, centerX, centerY);

  // Underline 6 and 9 (standard tabletop polyhedral convention)
  if (options?.underline) {
    const barW = label.length >= 2 ? 44 : 34;
    const barY = centerY + fontSize * 0.46;
    ctx.fillStyle = options?.highlight ? finish.critHex : finish.inkHex;
    ctx.fillRect(centerX - barW / 2, barY, barW, 6);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Apex-read D4 face texture: prints each corner's vertex value upright toward that corner,
 * so whichever vertex points straight up displays the rolled number on all 3 visible faces.
 */
function createD4FaceTexture(
  cornerValues: [number, number, number],
  finish: DiceFinishTheme,
  maxAnisotropy: number
): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = finish.bodyHex;
  ctx.fillRect(0, 0, size, size);

  const grad = ctx.createRadialGradient(
    size * 0.5,
    size * 0.5,
    size * 0.05,
    size * 0.5,
    size * 0.5,
    size * 0.65
  );
  grad.addColorStop(0, "rgba(255,255,255,0.08)");
  grad.addColorStop(1, "rgba(0,0,0,0.16)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  // UV triangle corners mapped to canvas (y = size * (1 - v))
  const pts: Array<[number, number]> = [
    [size * 0.5, size * 0.08], // A (top)
    [size * 0.09, size * 0.79], // B (bottom-left)
    [size * 0.91, size * 0.79], // C (bottom-right)
  ];
  const cx = (pts[0][0] + pts[1][0] + pts[2][0]) / 3;
  const cy = (pts[0][1] + pts[1][1] + pts[2][1]) / 3;

  // Facet outline
  ctx.strokeStyle = finish.edgeHex;
  ctx.lineWidth = 6;
  ctx.globalAlpha = 0.42;
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  ctx.lineTo(pts[1][0], pts[1][1]);
  ctx.lineTo(pts[2][0], pts[2][1]);
  ctx.closePath();
  ctx.stroke();
  ctx.globalAlpha = 1;

  ctx.font = `700 44px "Fraunces", Georgia, serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  for (let i = 0; i < 3; i++) {
    const [vx, vy] = pts[i];
    // Position number 58% of the way from centroid toward vertex
    const px = cx + (vx - cx) * 0.58;
    const py = cy + (vy - cy) * 0.58;
    // Rotate so the top of the numeral points toward the vertex (vx, vy)
    const angle = Math.atan2(vy - cy, vx - cx) + Math.PI / 2;

    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(angle);
    ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
    ctx.fillText(String(cornerValues[i]), 1.5, 2);
    ctx.fillStyle =
      cornerValues[i] === 4 ? finish.critHex : finish.inkHex;
    ctx.fillText(String(cornerValues[i]), 0, 0);
    ctx.restore();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  tex.needsUpdate = true;
  return tex;
}

function createConcealedFaceTexture(
  finish: DiceFinishTheme,
  shapeType: "square" | "triangle" | "pentagon" | "kite",
  maxAnisotropy: number
): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;

  // Base resin fill
  ctx.fillStyle = finish.bodyHex;
  ctx.fillRect(0, 0, size, size);

  // Soft frosted/cupped-hand veil so numerals are concealed cleanly
  const grad = ctx.createRadialGradient(
    size * 0.5,
    size * 0.45,
    size * 0.08,
    size * 0.5,
    size * 0.5,
    size * 0.68
  );
  grad.addColorStop(0, "rgba(255,255,255,0.13)");
  grad.addColorStop(1, "rgba(0,0,0,0.28)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  // Subtle satin diagonal shimmer indicating held/concealed state
  ctx.strokeStyle = "rgba(255,255,255,0.045)";
  ctx.lineWidth = 2;
  for (let i = -size; i < size * 2; i += 14) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + size, size);
    ctx.stroke();
  }

  // Facet bevel outline (matching numbered faces without any engraved digit)
  ctx.strokeStyle = finish.edgeHex;
  ctx.lineWidth = 6;
  ctx.globalAlpha = 0.48;

  if (shapeType === "square") {
    ctx.strokeRect(14, 14, size - 28, size - 28);
  } else if (shapeType === "triangle") {
    ctx.beginPath();
    ctx.moveTo(size * 0.5, size * 0.08);
    ctx.lineTo(size * 0.09, size * 0.79);
    ctx.lineTo(size * 0.91, size * 0.79);
    ctx.closePath();
    ctx.stroke();
  } else if (shapeType === "pentagon") {
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const ang = -Math.PI / 2 + (i * Math.PI * 2) / 5;
      const x = size * 0.5 + size * 0.43 * Math.cos(ang);
      const y = size * 0.5 + size * 0.43 * Math.sin(ang);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();
  } else if (shapeType === "kite") {
    ctx.beginPath();
    ctx.moveTo(size * 0.5, size * 0.06);
    ctx.lineTo(size * 0.14, size * 0.56);
    ctx.lineTo(size * 0.5, size * 0.86);
    ctx.lineTo(size * 0.86, size * 0.56);
    ctx.closePath();
    ctx.stroke();
  }

  ctx.globalAlpha = 1;

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  tex.needsUpdate = true;
  return tex;
}

function makeDieMaterial(
  tex: THREE.CanvasTexture,
  finish: DiceFinishTheme
): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    map: tex,
    roughness: finish.roughness,
    metalness: finish.metalness,
    clearcoat: finish.clearcoat,
    clearcoatRoughness: 0.36,
    envMapIntensity: 0.55,
  });
}

function makeConcealedBundle(
  finish: DiceFinishTheme,
  shapeType: "square" | "triangle" | "pentagon" | "kite",
  materials: THREE.MeshPhysicalMaterial[],
  maxAnisotropy: number
): {
  hoverMaterials: THREE.MeshPhysicalMaterial[];
  heldMaterials: THREE.MeshPhysicalMaterial[];
  droppedMaterials: THREE.MeshPhysicalMaterial[];
  concealedTexture: THREE.CanvasTexture;
  concealedMaterial: THREE.MeshPhysicalMaterial;
  concealedMaterials: THREE.MeshPhysicalMaterial[];
} {
  // Lightweight emissive/tint variants sharing the exact same GPU CanvasTextures (zero extra canvas draws or uploads)
  const hoverMaterials = materials.map((m) => {
    const c = m.clone();
    c.emissive.setHex(0x1f2f47);
    return c;
  });
  const heldMaterials = materials.map((m) => {
    const c = m.clone();
    c.emissive.setHex(0x293b56);
    return c;
  });
  const droppedMaterials = materials.map((m) => {
    const c = m.clone();
    c.color.setHex(0x706c68);
    c.roughness = Math.min(0.76, finish.roughness + 0.24);
    c.clearcoat = Math.max(0.04, finish.clearcoat * 0.25);
    c.envMapIntensity = 0.28;
    return c;
  });

  const concealedTexture = createConcealedFaceTexture(
    finish,
    shapeType,
    maxAnisotropy
  );
  const concealedMaterial = new THREE.MeshPhysicalMaterial({
    map: concealedTexture,
    roughness: Math.min(0.66, finish.roughness + 0.16),
    metalness: finish.metalness,
    clearcoat: Math.max(0.1, finish.clearcoat * 0.55),
    clearcoatRoughness: 0.5,
    envMapIntensity: 0.5,
    emissive: new THREE.Color(0x293b56),
  });
  const concealedMaterials = Array.from(
    { length: materials.length },
    () => concealedMaterial
  );
  return {
    hoverMaterials,
    heldMaterials,
    droppedMaterials,
    concealedTexture,
    concealedMaterial,
    concealedMaterials,
  };
}

function ensureOutwardWinding(
  vertices: THREE.Vector3[],
  faceIndices: number[]
): number[] {
  const centroid = new THREE.Vector3();
  for (const idx of faceIndices) centroid.add(vertices[idx]);
  centroid.divideScalar(faceIndices.length);

  const v0 = vertices[faceIndices[0]];
  const v1 = vertices[faceIndices[1]];
  const v2 = vertices[faceIndices[2]];
  const e1 = new THREE.Vector3().subVectors(v1, v0);
  const e2 = new THREE.Vector3().subVectors(v2, v0);
  const normal = new THREE.Vector3().crossVectors(e1, e2);

  if (normal.dot(centroid) < 0) {
    return [...faceIndices].reverse();
  }
  return [...faceIndices];
}

function computeFaceNormal(
  vertices: THREE.Vector3[],
  faceIndices: number[]
): THREE.Vector3 {
  const v0 = vertices[faceIndices[0]];
  const v1 = vertices[faceIndices[1]];
  const v2 = vertices[faceIndices[2]];
  return new THREE.Vector3()
    .subVectors(v1, v0)
    .cross(new THREE.Vector3().subVectors(v2, v0))
    .normalize();
}

function buildCannonPolyhedron(
  vertices: THREE.Vector3[],
  faces: number[][]
): CANNON.ConvexPolyhedron {
  const cannonVerts = vertices.map((v) => new CANNON.Vec3(v.x, v.y, v.z));
  return new CANNON.ConvexPolyhedron({
    vertices: cannonVerts,
    faces,
  });
}

function buildD6(
  finish: DiceFinishTheme,
  maxAnisotropy: number
): BuiltDieBlueprint {
  const size = 1.08;
  const geometry = new THREE.BoxGeometry(size, size, size);
  // BoxGeometry face order: +X, -X, +Y, -Y, +Z, -Z (opposite faces sum to 7)
  const faceSpec: Array<{ val: number; normal: THREE.Vector3 }> = [
    { val: 3, normal: new THREE.Vector3(1, 0, 0) },
    { val: 4, normal: new THREE.Vector3(-1, 0, 0) },
    { val: 6, normal: new THREE.Vector3(0, 1, 0) },
    { val: 1, normal: new THREE.Vector3(0, -1, 0) },
    { val: 2, normal: new THREE.Vector3(0, 0, 1) },
    { val: 5, normal: new THREE.Vector3(0, 0, -1) },
  ];

  const textures: THREE.CanvasTexture[] = [];
  const materials: THREE.MeshPhysicalMaterial[] = [];
  for (const spec of faceSpec) {
    const tex = createFaceTexture(
      String(spec.val),
      finish,
      "square",
      maxAnisotropy,
      {
        highlight: spec.val === 6,
        underline: spec.val === 6,
        fontScale: 1.15,
      }
    );
    textures.push(tex);
    materials.push(makeDieMaterial(tex, finish));
  }

  const half = size / 2;
  const localVertices = [
    new THREE.Vector3(half, half, half), // 0
    new THREE.Vector3(half, half, -half), // 1
    new THREE.Vector3(half, -half, half), // 2
    new THREE.Vector3(half, -half, -half), // 3
    new THREE.Vector3(-half, half, half), // 4
    new THREE.Vector3(-half, half, -half), // 5
    new THREE.Vector3(-half, -half, half), // 6
    new THREE.Vector3(-half, -half, -half), // 7
  ];
  const faceVertexIndices = [
    [0, 2, 3, 1], // +X
    [4, 5, 7, 6], // -X
    [0, 1, 5, 4], // +Y
    [2, 6, 7, 3], // -Y
    [0, 4, 6, 2], // +Z
    [1, 3, 7, 5], // -Z
  ];
  const concealed = makeConcealedBundle(
    finish,
    "square",
    materials,
    maxAnisotropy
  );

  return {
    kind: "d6",
    geometry,
    materials,
    textures,
    ...concealed,
    shape: new CANNON.Box(new CANNON.Vec3(half, half, half)),
    faces: faceSpec.map((f) => ({ value: f.val, normal: f.normal })),
    localVertices,
    faceVertexIndices,
    radius: size * 0.866, // exact half-diagonal so corners stay strictly inside tray rails
    restHeight: half,
  };
}

function buildD4(
  finish: DiceFinishTheme,
  maxAnisotropy: number
): BuiltDieBlueprint {
  const radius = 0.86;
  const rawVerts = [
    new THREE.Vector3(1, 1, 1),
    new THREE.Vector3(-1, -1, 1),
    new THREE.Vector3(-1, 1, -1),
    new THREE.Vector3(1, -1, -1),
  ].map((v) => v.normalize().multiplyScalar(radius));

  const vertexValues = [1, 2, 3, 4];
  const rawFaces = [
    [0, 1, 2],
    [0, 2, 3],
    [0, 3, 1],
    [1, 3, 2],
  ].map((f) => ensureOutwardWinding(rawVerts, f));

  const positions: number[] = [];
  const uvs: number[] = [];
  const geometry = new THREE.BufferGeometry();
  const textures: THREE.CanvasTexture[] = [];
  const materials: THREE.MeshPhysicalMaterial[] = [];
  const faces: FaceDescriptor[] = [];

  const triUV: Array<[number, number]> = [
    [0.5, 0.92],
    [0.09, 0.21],
    [0.91, 0.21],
  ];

  rawFaces.forEach((face, idx) => {
    const start = positions.length / 3;
    for (let i = 0; i < 3; i++) {
      const v = rawVerts[face[i]];
      positions.push(v.x, v.y, v.z);
      uvs.push(triUV[i][0], triUV[i][1]);
    }
    geometry.addGroup(start, 3, idx);

    const cornerVals: [number, number, number] = [
      vertexValues[face[0]],
      vertexValues[face[1]],
      vertexValues[face[2]],
    ];
    const tex = createD4FaceTexture(cornerVals, finish, maxAnisotropy);
    textures.push(tex);
    materials.push(makeDieMaterial(tex, finish));

    // Opposite vertex value corresponds to this face being on the bottom
    const oppositeIdx = [0, 1, 2, 3].find((k) => !face.includes(k)) ?? 0;
    faces.push({
      value: vertexValues[oppositeIdx],
      normal: computeFaceNormal(rawVerts, face),
    });
  });

  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3)
  );
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();

  const restHeight = Math.abs(rawVerts[rawFaces[0][0]].dot(faces[0].normal));
  const concealed = makeConcealedBundle(
    finish,
    "triangle",
    materials,
    maxAnisotropy
  );

  return {
    kind: "d4",
    geometry,
    materials,
    textures,
    ...concealed,
    shape: buildCannonPolyhedron(rawVerts, rawFaces),
    faces,
    localVertices: rawVerts,
    faceVertexIndices: rawFaces,
    d4Vertices: rawVerts.map((pos, i) => ({
      value: vertexValues[i],
      position: pos.clone(),
    })),
    radius,
    restHeight,
  };
}

function buildD8(
  finish: DiceFinishTheme,
  maxAnisotropy: number
): BuiltDieBlueprint {
  const radius = 0.84;
  const rawVerts = [
    new THREE.Vector3(0, 1, 0), // 0 top
    new THREE.Vector3(0, -1, 0), // 1 bottom
    new THREE.Vector3(1, 0, 0), // 2 +x
    new THREE.Vector3(0, 0, 1), // 3 +z
    new THREE.Vector3(-1, 0, 0), // 4 -x
    new THREE.Vector3(0, 0, -1), // 5 -z
  ].map((v) => v.multiplyScalar(radius));

  const rawFaceDefs: Array<{ indices: number[]; value: number }> = [
    { indices: [0, 3, 2], value: 1 },
    { indices: [0, 4, 3], value: 2 },
    { indices: [0, 5, 4], value: 3 },
    { indices: [0, 2, 5], value: 4 },
    { indices: [1, 2, 3], value: 8 },
    { indices: [1, 3, 4], value: 7 },
    { indices: [1, 4, 5], value: 6 },
    { indices: [1, 5, 2], value: 5 },
  ];

  const cannonFaces: number[][] = [];
  const positions: number[] = [];
  const uvs: number[] = [];
  const geometry = new THREE.BufferGeometry();
  const textures: THREE.CanvasTexture[] = [];
  const materials: THREE.MeshPhysicalMaterial[] = [];
  const faces: FaceDescriptor[] = [];

  const triUV: Array<[number, number]> = [
    [0.5, 0.92],
    [0.09, 0.21],
    [0.91, 0.21],
  ];

  rawFaceDefs.forEach((def, idx) => {
    const face = ensureOutwardWinding(rawVerts, def.indices);
    cannonFaces.push(face);
    const start = positions.length / 3;
    for (let i = 0; i < 3; i++) {
      const v = rawVerts[face[i]];
      positions.push(v.x, v.y, v.z);
      uvs.push(triUV[i][0], triUV[i][1]);
    }
    geometry.addGroup(start, 3, idx);

    const tex = createFaceTexture(
      String(def.value),
      finish,
      "triangle",
      maxAnisotropy,
      {
        highlight: def.value === 8,
        underline: def.value === 6,
        fontScale: 0.92,
      }
    );
    textures.push(tex);
    materials.push(makeDieMaterial(tex, finish));
    faces.push({
      value: def.value,
      normal: computeFaceNormal(rawVerts, face),
    });
  });

  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3)
  );
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();

  const restHeight = Math.abs(rawVerts[cannonFaces[0][0]].dot(faces[0].normal));
  const concealed = makeConcealedBundle(
    finish,
    "triangle",
    materials,
    maxAnisotropy
  );

  return {
    kind: "d8",
    geometry,
    materials,
    textures,
    ...concealed,
    shape: buildCannonPolyhedron(rawVerts, cannonFaces),
    faces,
    localVertices: rawVerts,
    faceVertexIndices: cannonFaces,
    radius,
    restHeight,
  };
}

function buildD10(
  kind: "d10" | "d10_tens",
  finish: DiceFinishTheme,
  maxAnisotropy: number
): BuiltDieBlueprint {
  // Exact mathematically coplanar pentagonal trapezohedron
  const R = 0.78;
  const H = 0.84;
  const cos36 = Math.cos((36 * Math.PI) / 180);
  const h = H * ((1 - cos36) / (1 + cos36));

  const rawVerts: THREE.Vector3[] = [];
  rawVerts.push(new THREE.Vector3(0, H, 0)); // 0: top pole
  rawVerts.push(new THREE.Vector3(0, -H, 0)); // 1: bottom pole

  // 2..6: upper ring
  for (let k = 0; k < 5; k++) {
    const a = (k * 2 * Math.PI) / 5;
    rawVerts.push(new THREE.Vector3(R * Math.cos(a), h, R * Math.sin(a)));
  }
  // 7..11: lower ring staggered by 36 degrees
  for (let k = 0; k < 5; k++) {
    const a = ((k + 0.5) * 2 * Math.PI) / 5;
    rawVerts.push(new THREE.Vector3(R * Math.cos(a), -h, R * Math.sin(a)));
  }

  // Standard 10-sided kite numbering
  const upperValues =
    kind === "d10_tens" ? [0, 20, 40, 60, 80] : [10, 2, 4, 6, 8];
  const lowerValues =
    kind === "d10_tens" ? [90, 70, 50, 30, 10] : [9, 7, 5, 3, 1];

  const faceDefs: Array<{ quad: number[]; value: number }> = [];
  for (let k = 0; k < 5; k++) {
    const uCurr = 2 + k;
    const uNext = 2 + ((k + 1) % 5);
    const lCurr = 7 + k;
    // Upper kite: top pole (0), side1, bottom tip (lCurr), side2
    faceDefs.push({
      quad: [0, uNext, lCurr, uCurr],
      value: upperValues[k],
    });
  }
  for (let k = 0; k < 5; k++) {
    const lCurr = 7 + k;
    const lNext = 7 + ((k + 1) % 5);
    const uNext = 2 + ((k + 1) % 5);
    // Lower kite: bottom pole (1), side1, opposite tip (uNext), side2
    faceDefs.push({
      quad: [1, lCurr, uNext, lNext],
      value: lowerValues[k],
    });
  }

  const cannonFaces: number[][] = [];
  const positions: number[] = [];
  const uvs: number[] = [];
  const geometry = new THREE.BufferGeometry();
  const textures: THREE.CanvasTexture[] = [];
  const materials: THREE.MeshPhysicalMaterial[] = [];
  const faces: FaceDescriptor[] = [];

  const kiteUV: Array<[number, number]> = [
    [0.5, 0.94], // pole vertex
    [0.14, 0.44], // left wing
    [0.5, 0.14], // opposite tip
    [0.86, 0.44], // right wing
  ];

  faceDefs.forEach((def, idx) => {
    // Keep pole at index 0 and opposite tip at index 2; swap wings (1 & 3) if winding points inward
    const q = [...def.quad];
    const centroid = new THREE.Vector3();
    for (const vi of q) centroid.add(rawVerts[vi]);
    centroid.divideScalar(4);
    const n = new THREE.Vector3()
      .subVectors(rawVerts[q[1]], rawVerts[q[0]])
      .cross(new THREE.Vector3().subVectors(rawVerts[q[2]], rawVerts[q[0]]));
    if (n.dot(centroid) < 0) {
      const tmp = q[1];
      q[1] = q[3];
      q[3] = tmp;
    }

    cannonFaces.push(q);
    const start = positions.length / 3;
    const tris: Array<[number, number, number]> = [
      [0, 1, 2],
      [0, 2, 3],
    ];
    for (const [a, b, c] of tris) {
      const va = rawVerts[q[a]];
      const vb = rawVerts[q[b]];
      const vc = rawVerts[q[c]];
      positions.push(va.x, va.y, va.z, vb.x, vb.y, vb.z, vc.x, vc.y, vc.z);
      uvs.push(
        kiteUV[a][0],
        kiteUV[a][1],
        kiteUV[b][0],
        kiteUV[b][1],
        kiteUV[c][0],
        kiteUV[c][1]
      );
    }
    geometry.addGroup(start, 6, idx);

    const label =
      kind === "d10_tens"
        ? def.value === 0
          ? "00"
          : String(def.value)
        : String(def.value);

    const tex = createFaceTexture(label, finish, "kite", maxAnisotropy, {
      highlight: kind === "d10" ? def.value === 10 : def.value === 0,
      underline: def.value === 6 || def.value === 9,
      fontScale: label.length >= 2 ? 0.86 : 0.9,
    });
    textures.push(tex);
    materials.push(makeDieMaterial(tex, finish));
    faces.push({
      value: def.value,
      normal: computeFaceNormal(rawVerts, q),
    });
  });

  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3)
  );
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();

  const restHeight = Math.abs(rawVerts[cannonFaces[0][0]].dot(faces[0].normal));
  const concealed = makeConcealedBundle(
    finish,
    "kite",
    materials,
    maxAnisotropy
  );

  return {
    kind,
    geometry,
    materials,
    textures,
    ...concealed,
    shape: buildCannonPolyhedron(rawVerts, cannonFaces),
    faces,
    localVertices: rawVerts,
    faceVertexIndices: cannonFaces,
    radius: H,
    restHeight,
  };
}

function buildD12(
  finish: DiceFinishTheme,
  maxAnisotropy: number
): BuiltDieBlueprint {
  const radius = 0.84;
  const phi = (1 + Math.sqrt(5)) / 2;
  const invPhi = 1 / phi;

  // 20 exact vertices of a regular dodecahedron
  const rawVerts: THREE.Vector3[] = [];
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      for (const sz of [-1, 1]) {
        rawVerts.push(new THREE.Vector3(sx, sy, sz));
      }
    }
  }
  for (const s1 of [-1, 1]) {
    for (const s2 of [-1, 1]) {
      rawVerts.push(new THREE.Vector3(0, s1 * invPhi, s2 * phi));
      rawVerts.push(new THREE.Vector3(s1 * invPhi, s2 * phi, 0));
      rawVerts.push(new THREE.Vector3(s1 * phi, 0, s2 * invPhi));
    }
  }
  rawVerts.forEach((v) => v.normalize().multiplyScalar(radius));

  // Exact 12 face normals (true dual icosahedron of rawVerts above — 100% coplanar pentagons)
  const faceNormals: THREE.Vector3[] = [];
  for (const s1 of [-1, 1]) {
    for (const s2 of [-1, 1]) {
      faceNormals.push(new THREE.Vector3(0, s1 * phi, s2).normalize());
      faceNormals.push(new THREE.Vector3(s1 * phi, s2, 0).normalize());
      faceNormals.push(new THREE.Vector3(s1, 0, s2 * phi).normalize());
    }
  }

  // Standard balanced tabletop d12 numbering: opposite faces strictly sum to 13
  const faceValues = new Array<number>(12).fill(1);
  const findAntipode = (i: number): number => {
    let bestJ = 0;
    let minDot = 2;
    for (let j = 0; j < faceNormals.length; j++) {
      const d = faceNormals[i]!.dot(faceNormals[j]!);
      if (d < minDot) {
        minDot = d;
        bestJ = j;
      }
    }
    return bestJ;
  };
  const topIdx = 0;
  const bottomIdx = findAntipode(topIdx);
  faceValues[topIdx] = 12;
  faceValues[bottomIdx] = 1;

  const topNorm = faceNormals[topIdx]!;
  const refAxis =
    Math.abs(topNorm.y) < 0.9
      ? new THREE.Vector3(0, 1, 0)
      : new THREE.Vector3(1, 0, 0);
  const ringX = new THREE.Vector3().crossVectors(refAxis, topNorm).normalize();
  const ringY = new THREE.Vector3().crossVectors(topNorm, ringX).normalize();

  // The 5 faces adjacent to 12 (dot > 0) ordered around the pole; opposite faces flank 1
  const upperRing = faceNormals
    .map((n, i) => ({ i, dot: n.dot(topNorm), n }))
    .filter((entry) => entry.i !== topIdx && entry.dot > 0.1)
    .sort(
      (a, b) =>
        Math.atan2(a.n.dot(ringY), a.n.dot(ringX)) -
        Math.atan2(b.n.dot(ringY), b.n.dot(ringX))
    );
  const upperVals = [2, 10, 4, 8, 6];
  upperRing.forEach((entry, k) => {
    const val = upperVals[k]!;
    faceValues[entry.i] = val;
    faceValues[findAntipode(entry.i)] = 13 - val;
  });

  const cannonFaces: number[][] = [];
  const positions: number[] = [];
  const uvs: number[] = [];
  const geometry = new THREE.BufferGeometry();
  const textures: THREE.CanvasTexture[] = [];
  const materials: THREE.MeshPhysicalMaterial[] = [];
  const faces: FaceDescriptor[] = [];

  const pentUV: Array<[number, number]> = [];
  for (let i = 0; i < 5; i++) {
    const ang = Math.PI / 2 + (i * Math.PI * 2) / 5;
    pentUV.push([0.5 + 0.43 * Math.cos(ang), 0.5 + 0.43 * Math.sin(ang)]);
  }

  faceNormals.forEach((normal, idx) => {
    // Pick the 5 coplanar vertices with largest dot product along this face normal
    const scored = rawVerts
      .map((v, vi) => ({ vi, dot: v.dot(normal) }))
      .sort((a, b) => b.dot - a.dot)
      .slice(0, 5);

    const centroid = new THREE.Vector3();
    scored.forEach((s) => centroid.add(rawVerts[s.vi]));
    centroid.divideScalar(5);

    // Build orthonormal tangent basis on the face plane and sort vertices CCW
    const refUp =
      Math.abs(normal.y) < 0.9
        ? new THREE.Vector3(0, 1, 0)
        : new THREE.Vector3(1, 0, 0);
    const tangentX = new THREE.Vector3().crossVectors(refUp, normal).normalize();
    const tangentY = new THREE.Vector3().crossVectors(normal, tangentX).normalize();

    const ordered = scored
      .map((s) => {
        const rel = new THREE.Vector3().subVectors(rawVerts[s.vi], centroid);
        const angle = Math.atan2(rel.dot(tangentY), rel.dot(tangentX));
        return { vi: s.vi, angle };
      })
      .sort((a, b) => a.angle - b.angle)
      .map((s) => s.vi);

    const face = ensureOutwardWinding(rawVerts, ordered);
    cannonFaces.push(face);

    const start = positions.length / 3;
    const tris: Array<[number, number, number]> = [
      [0, 1, 2],
      [0, 2, 3],
      [0, 3, 4],
    ];
    for (const [a, b, c] of tris) {
      const va = rawVerts[face[a]];
      const vb = rawVerts[face[b]];
      const vc = rawVerts[face[c]];
      positions.push(va.x, va.y, va.z, vb.x, vb.y, vb.z, vc.x, vc.y, vc.z);
      uvs.push(
        pentUV[a][0],
        pentUV[a][1],
        pentUV[b][0],
        pentUV[b][1],
        pentUV[c][0],
        pentUV[c][1]
      );
    }
    geometry.addGroup(start, 9, idx);

    const value = faceValues[idx]!;
    const tex = createFaceTexture(
      String(value),
      finish,
      "pentagon",
      maxAnisotropy,
      {
        highlight: value === 12,
        underline: value === 6 || value === 9,
        fontScale: 0.96,
      }
    );
    textures.push(tex);
    materials.push(makeDieMaterial(tex, finish));
    faces.push({
      value,
      normal: computeFaceNormal(rawVerts, face),
    });
  });

  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3)
  );
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();

  const restHeight = Math.abs(rawVerts[cannonFaces[0][0]].dot(faces[0].normal));
  const concealed = makeConcealedBundle(
    finish,
    "pentagon",
    materials,
    maxAnisotropy
  );

  return {
    kind: "d12",
    geometry,
    materials,
    textures,
    ...concealed,
    shape: buildCannonPolyhedron(rawVerts, cannonFaces),
    faces,
    localVertices: rawVerts,
    faceVertexIndices: cannonFaces,
    radius,
    restHeight,
  };
}

function buildD20(
  finish: DiceFinishTheme,
  maxAnisotropy: number
): BuiltDieBlueprint {
  const radius = 0.88;
  const phi = (1 + Math.sqrt(5)) / 2;

  const rawVerts = [
    new THREE.Vector3(-1, phi, 0),
    new THREE.Vector3(1, phi, 0),
    new THREE.Vector3(-1, -phi, 0),
    new THREE.Vector3(1, -phi, 0),
    new THREE.Vector3(0, -1, phi),
    new THREE.Vector3(0, 1, phi),
    new THREE.Vector3(0, -1, -phi),
    new THREE.Vector3(0, 1, -phi),
    new THREE.Vector3(phi, 0, -1),
    new THREE.Vector3(phi, 0, 1),
    new THREE.Vector3(-phi, 0, -1),
    new THREE.Vector3(-phi, 0, 1),
  ].map((v) => v.normalize().multiplyScalar(radius));

  const rawFaceIndices: number[][] = [
    [0, 11, 5],
    [0, 5, 1],
    [0, 1, 7],
    [0, 7, 10],
    [0, 10, 11],
    [1, 5, 9],
    [5, 11, 4],
    [11, 10, 2],
    [10, 7, 6],
    [7, 1, 8],
    [3, 9, 4],
    [3, 4, 2],
    [3, 2, 6],
    [3, 6, 8],
    [3, 8, 9],
    [4, 9, 5],
    [2, 4, 11],
    [6, 2, 10],
    [8, 6, 7],
    [9, 8, 1],
  ];

  const cannonFaces = rawFaceIndices.map((rawFace) =>
    ensureOutwardWinding(rawVerts, rawFace)
  );
  const faceNormals = cannonFaces.map((face) =>
    computeFaceNormal(rawVerts, face)
  );

  // Classic balanced tabletop d20 numbering: opposite faces strictly sum to 21,
  // with 2, 8, 14 flanking 20 and alternating high/low values around the middle band
  const faceValues = new Array<number>(20).fill(1);
  const findAntipode = (i: number): number => {
    let bestJ = 0;
    let minDot = 2;
    for (let j = 0; j < faceNormals.length; j++) {
      const d = faceNormals[i]!.dot(faceNormals[j]!);
      if (d < minDot) {
        minDot = d;
        bestJ = j;
      }
    }
    return bestJ;
  };
  const topIdx = 0;
  const bottomIdx = findAntipode(topIdx);
  faceValues[topIdx] = 20;
  faceValues[bottomIdx] = 1;

  const topNorm = faceNormals[topIdx]!;
  const refAxis =
    Math.abs(topNorm.y) < 0.9
      ? new THREE.Vector3(0, 1, 0)
      : new THREE.Vector3(1, 0, 0);
  const ringX = new THREE.Vector3().crossVectors(refAxis, topNorm).normalize();
  const ringY = new THREE.Vector3().crossVectors(topNorm, ringX).normalize();
  const ringAngle = (n: THREE.Vector3) =>
    Math.atan2(n.dot(ringY), n.dot(ringX));

  // 3 faces sharing an edge with 20 (dot ~0.795) -> classic 2, 8, 14 (opposites 19, 13, 7)
  const adjTo20 = faceNormals
    .map((n, i) => ({ i, dot: n.dot(topNorm), ang: ringAngle(n) }))
    .filter((e) => e.i !== topIdx && e.dot > 0.5)
    .sort((a, b) => a.ang - b.ang);
  const adjVals = [2, 8, 14];
  adjTo20.forEach((e, k) => {
    const val = adjVals[k]!;
    faceValues[e.i] = val;
    faceValues[findAntipode(e.i)] = 21 - val;
  });

  // 6 upper-equatorial faces (0 < dot < 0.5, dot ~0.188) -> alternating high/low, opposites sum to 21
  const upperBand = faceNormals
    .map((n, i) => ({ i, dot: n.dot(topNorm), ang: ringAngle(n) }))
    .filter((e) => e.dot > 0.01 && e.dot <= 0.5)
    .sort((a, b) => a.ang - b.ang);
  const bandVals = [18, 4, 16, 6, 12, 10];
  upperBand.forEach((e, k) => {
    const val = bandVals[k]!;
    faceValues[e.i] = val;
    faceValues[findAntipode(e.i)] = 21 - val;
  });

  const positions: number[] = [];
  const uvs: number[] = [];
  const geometry = new THREE.BufferGeometry();
  const textures: THREE.CanvasTexture[] = [];
  const materials: THREE.MeshPhysicalMaterial[] = [];
  const faces: FaceDescriptor[] = [];

  const triUV: Array<[number, number]> = [
    [0.5, 0.92],
    [0.09, 0.21],
    [0.91, 0.21],
  ];

  cannonFaces.forEach((face, idx) => {
    const start = positions.length / 3;
    for (let i = 0; i < 3; i++) {
      const v = rawVerts[face[i]];
      positions.push(v.x, v.y, v.z);
      uvs.push(triUV[i][0], triUV[i][1]);
    }
    geometry.addGroup(start, 3, idx);

    const value = faceValues[idx]!;
    const tex = createFaceTexture(
      String(value),
      finish,
      "triangle",
      maxAnisotropy,
      {
        highlight: value === 20,
        underline: value === 6 || value === 9,
        fontScale: 0.78,
      }
    );
    textures.push(tex);
    materials.push(makeDieMaterial(tex, finish));
    faces.push({
      value,
      normal: faceNormals[idx]!,
    });
  });

  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3)
  );
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();

  const restHeight = Math.abs(rawVerts[cannonFaces[0][0]].dot(faces[0].normal));
  const concealed = makeConcealedBundle(
    finish,
    "triangle",
    materials,
    maxAnisotropy
  );

  return {
    kind: "d20",
    geometry,
    materials,
    textures,
    ...concealed,
    shape: buildCannonPolyhedron(rawVerts, cannonFaces),
    faces,
    localVertices: rawVerts,
    faceVertexIndices: cannonFaces,
    radius,
    restHeight,
  };
}

export function buildDieBlueprint(
  kind: DieKind,
  finish: DiceFinishTheme,
  maxAnisotropy: number
): BuiltDieBlueprint {
  switch (kind) {
    case "d4":
      return buildD4(finish, maxAnisotropy);
    case "d6":
      return buildD6(finish, maxAnisotropy);
    case "d8":
      return buildD8(finish, maxAnisotropy);
    case "d10":
      return buildD10("d10", finish, maxAnisotropy);
    case "d10_tens":
      return buildD10("d10_tens", finish, maxAnisotropy);
    case "d12":
      return buildD12(finish, maxAnisotropy);
    case "d20":
      return buildD20(finish, maxAnisotropy);
  }
}

const _tmpVec = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

/**
 * Determine the exact face value resting upright on the physical 3D die.
 */
export function readLandedDieValue(
  blueprint: BuiltDieBlueprint,
  quaternion: THREE.Quaternion
): number {
  // For an apex-read d4, the rolled value is the vertex with the highest world Y
  if (blueprint.kind === "d4" && blueprint.d4Vertices) {
    let bestY = -Infinity;
    let bestVal = 1;
    for (const v of blueprint.d4Vertices) {
      _tmpVec.copy(v.position).applyQuaternion(quaternion);
      if (_tmpVec.y > bestY) {
        bestY = _tmpVec.y;
        bestVal = v.value;
      }
    }
    return bestVal;
  }

  let bestDot = -Infinity;
  let bestVal = blueprint.faces[0]?.value ?? 1;
  for (const face of blueprint.faces) {
    _tmpVec.copy(face.normal).applyQuaternion(quaternion);
    const dot = _tmpVec.dot(_up);
    if (dot > bestDot) {
      bestDot = dot;
      bestVal = face.value;
    }
  }
  return bestVal;
}

const _down = new THREE.Vector3(0, -1, 0);

/**
 * Measure how flat the die is resting on a valid bottom face (1.0 = perfectly flat, < 0.96 = cocked).
 * Also returns the best-aligned bottom face normal in world space so physics can gently right cocked dice.
 */
export function getDieFlatness(
  blueprint: BuiltDieBlueprint,
  quaternion: THREE.Quaternion,
  outBottomNormal?: THREE.Vector3
): number {
  let bestDot = -Infinity;
  for (const face of blueprint.faces) {
    _tmpVec.copy(face.normal).applyQuaternion(quaternion);
    const dot = _tmpVec.dot(_down);
    if (dot > bestDot) {
      bestDot = dot;
      if (outBottomNormal) {
        outBottomNormal.copy(_tmpVec);
      }
    }
  }
  return bestDot;
}

