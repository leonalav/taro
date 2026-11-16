type ObjectData = Record<string, unknown>;
type Vector = [number, number, number];

export interface GlbPreviewGeometry {
  vertices: Float32Array;
  center: Vector;
  scale: number;
  triangles: number;
  simplifiedMaterials: boolean;
}

const invalid = () => Error("This GLB contains invalid model data.");
const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const maxTriangles = 100_000;
const maxCoordinate = 1e15;

/** Decode the selected scene from a self-contained GLB 2.0 with ordinary triangle geometry. */
export function decodeGlbPreview(buffer: ArrayBuffer): GlbPreviewGeometry {
  const view = new DataView(buffer);
  if (view.byteLength < 28 || view.getUint32(0, true) !== 0x46546c67 || view.getUint32(4, true) !== 2 ||
    view.getUint32(8, true) !== view.byteLength || view.getUint32(16, true) !== 0x4e4f534a) throw invalid();
  const jsonBytes = view.getUint32(12, true);
  const bin = 20 + jsonBytes;
  if (!jsonBytes || jsonBytes % 4 || jsonBytes > 4 * 1024 * 1024 || bin + 8 > buffer.byteLength) throw invalid();
  if (view.getUint32(bin + 4, true) !== 0x004e4942) throw Error("The preview needs a model with embedded geometry.");
  const binLength = view.getUint32(bin, true);
  if (binLength % 4 || bin + 8 + binLength !== buffer.byteLength) throw invalid();
  let document: ObjectData;
  try {
    document = object(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(new Uint8Array(buffer, 20, jsonBytes))));
  } catch {
    throw invalid();
  }
  if (object(document.asset).version !== "2.0") throw invalid();
  if (list(document.animations).length || list(document.skins).length) {
    throw Error("Animation and skeletal rigs require a rendered preview image.");
  }
  const required = list(document.extensionsRequired);
  if (required.some(extension => ["KHR_draco_mesh_compression", "EXT_meshopt_compression", "KHR_mesh_quantization"].includes(String(extension)))) {
    throw Error("Compressed or quantized geometry requires a rendered preview image.");
  }
  if (required.some(extension => typeof extension !== "string" ||
    !/^(KHR_materials_[a-z_]+|KHR_texture_(basisu|transform)|EXT_texture_(webp|avif))$/.test(extension))) {
    throw Error("This model uses a required extension outside the geometry preview.");
  }
  const buffers = list(document.buffers);
  const first = object(buffers[0]);
  const storedBytes = unsigned(first.byteLength);
  if (buffers.length !== 1 || first.uri !== undefined || storedBytes > binLength) {
    throw Error("The preview needs one embedded binary buffer.");
  }
  const accessors = list(document.accessors);
  const views = list(document.bufferViews);
  const meshes = list(document.meshes);
  const nodes = list(document.nodes);
  const scenes = list(document.scenes);
  const materials = list(document.materials);
  const starts = scenes.length ? list(element(scenes, document.scene ?? 0).nodes) : unparented(nodes);
  const floor: Vector = [Infinity, Infinity, Infinity];
  const ceiling: Vector = [-Infinity, -Infinity, -Infinity];
  const vertices: number[] = [];
  const stack = new Set<number>();
  let visits = 0;
  let simplifiedMaterials = required.length > 0;

  const source = (accessorKey: unknown, kind: "position" | "index") => {
    const accessor = element(accessors, accessorKey);
    const component = unsigned(accessor.componentType);
    const isPosition = kind === "position";
    if (accessor.sparse !== undefined || accessor.normalized === true) throw Error("Sparse or normalized mesh data requires a rendered preview image.");
    if (isPosition ? accessor.type !== "VEC3" || component !== 5126 : accessor.type !== "SCALAR" || ![5121, 5123, 5125].includes(component)) throw invalid();
    const contents = element(views, accessor.bufferView);
    if (contents.buffer !== 0) throw invalid();
    if (objectOrEmpty(contents.extensions).EXT_meshopt_compression !== undefined) {
      throw Error("Compressed geometry requires a rendered preview image.");
    }
    const bytes = isPosition ? 12 : component === 5121 ? 1 : component === 5123 ? 2 : 4;
    const start = unsigned(contents.byteOffset ?? 0);
    const length = unsigned(contents.byteLength);
    const offset = unsigned(accessor.byteOffset ?? 0);
    const stride = unsigned(contents.byteStride ?? bytes);
    const count = unsigned(accessor.count);
    if (!count || stride < bytes || stride > 252 || (isPosition ? stride % 4 !== 0 : stride !== bytes) ||
      start + length > storedBytes || offset + (count - 1) * stride + bytes > length) throw invalid();
    const address = bin + 8 + start + offset;
    return { count, component, address, stride };
  };

  function addPrimitive(primitive: ObjectData, matrix: number[]) {
    if (primitive.mode !== undefined && primitive.mode !== 4) {
      throw Error("This preview supports triangle-list meshes. Attach a rendered preview image for other draw modes.");
    }
    if (list(primitive.targets).length) throw Error("Morph targets require a rendered preview image.");
    if (objectOrEmpty(primitive.extensions).KHR_draco_mesh_compression !== undefined) {
      throw Error("Compressed geometry requires a rendered preview image.");
    }
    const attributes = object(primitive.attributes);
    const positions = source(attributes.POSITION, "position");
    const indices = primitive.indices === undefined ? undefined : source(primitive.indices, "index");
    const count = indices?.count ?? positions.count;
    if (count % 3) throw invalid();
    if (count / 3 + vertices.length / 18 > maxTriangles) throw Error("This model exceeds the 100,000 triangle preview limit.");
    const material = primitive.material === undefined ? {} : element(materials, primitive.material);
    const pbr = objectOrEmpty(material.pbrMetallicRoughness);
    const tint = pbr.baseColorFactor === undefined ? [0.65, 0.76, 0.85, 1] : numericList(pbr.baseColorFactor, 4);
    if (tint.some(value => value < 0 || value > 1)) throw invalid();
    simplifiedMaterials ||= attributes.COLOR_0 !== undefined || Object.keys(objectOrEmpty(material.extensions)).length > 0 ||
      Object.keys(pbr).some(key => key.endsWith("Texture")) || ["normalTexture", "emissiveTexture", "occlusionTexture"].some(key => material[key] !== undefined) ||
      tint[3] !== 1 || (material.alphaMode !== undefined && material.alphaMode !== "OPAQUE");
    for (let index = 0; index < count; index++) {
      const vertex = indices ? vertexIndex(view, indices.component, indices.address + index * indices.stride) : index;
      if (vertex >= positions.count) throw Error("This GLB contains an invalid vertex index.");
      const address = positions.address + vertex * positions.stride;
      const x = view.getFloat32(address, true);
      const y = view.getFloat32(address + 4, true);
      const z = view.getFloat32(address + 8, true);
      for (let axis = 0; axis < 3; axis++) {
        const value = matrix[axis] * x + matrix[axis + 4] * y + matrix[axis + 8] * z + matrix[axis + 12];
        if (!Number.isFinite(value) || Math.abs(value) > maxCoordinate) throw invalid();
        floor[axis] = Math.min(floor[axis], value);
        ceiling[axis] = Math.max(ceiling[axis], value);
        vertices.push(value);
      }
      vertices.push(tint[0], tint[1], tint[2]);
    }
  }

  function visit(key: unknown, parent: number[]) {
    const index = unsigned(key);
    if (stack.has(index)) throw invalid();
    if (++visits > 4096 || stack.size > 96) throw Error("This model's scene exceeds the preview limit.");
    const node = element(nodes, index);
    if (node.skin !== undefined || node.weights !== undefined || objectOrEmpty(node.extensions).EXT_mesh_gpu_instancing !== undefined) {
      throw Error("This scene uses deformation or GPU instancing. Attach a rendered preview image.");
    }
    const matrix = multiply(parent, nodeMatrix(node));
    if (node.mesh !== undefined) {
      const mesh = element(meshes, node.mesh);
      for (const entry of list(mesh.primitives)) addPrimitive(object(entry), matrix);
    }
    stack.add(index);
    for (const child of list(node.children)) visit(child, matrix);
    stack.delete(index);
  }

  for (const start of starts) visit(start, identity);
  if (!vertices.length) throw Error("This scene has no visible triangle geometry.");
  const center: Vector = [(floor[0] + ceiling[0]) / 2, (floor[1] + ceiling[1]) / 2, (floor[2] + ceiling[2]) / 2];
  const radius = Math.hypot(ceiling[0] - floor[0], ceiling[1] - floor[1], ceiling[2] - floor[2]) / 2;
  if (radius <= Number.EPSILON) throw Error("This scene has no visible triangle geometry.");
  const scale = 1 / radius;
  const normalized = Float32Array.from(vertices, (value, index) => index % 6 < 3 ? (value - center[index % 6]) * scale : value);
  return { vertices: normalized, center, scale, triangles: vertices.length / 18, simplifiedMaterials };
}

function object(value: unknown): ObjectData {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw invalid();
  return value as ObjectData;
}

function objectOrEmpty(value: unknown) {
  return value === undefined ? {} : object(value);
}

function list(value: unknown): unknown[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw invalid();
  return value;
}

function unsigned(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw invalid();
  return value;
}

function element(list: unknown[], index: unknown) {
  return object(list[unsigned(index)]);
}

function numericList(value: unknown, length: number) {
  const values = list(value);
  if (values.length !== length || !values.every(item => typeof item === "number" && Number.isFinite(item))) throw invalid();
  return values as number[];
}

function unparented(nodes: unknown[]) {
  const descendants = new Set(nodes.flatMap(node => list(object(node).children).map(unsigned)));
  return nodes.map((_, index) => index).filter(index => !descendants.has(index));
}

function vertexIndex(view: DataView, component: number, address: number) {
  if (component === 5121) return view.getUint8(address);
  if (component === 5123) return view.getUint16(address, true);
  return view.getUint32(address, true);
}

function nodeMatrix(node: ObjectData) {
  if (node.matrix !== undefined) {
    const matrix = numericList(node.matrix, 16);
    if (matrix[3] || matrix[7] || matrix[11] || matrix[15] !== 1) throw invalid();
    return matrix;
  }
  const translation = node.translation === undefined ? [0, 0, 0] : numericList(node.translation, 3);
  const [sx, sy, sz] = node.scale === undefined ? [1, 1, 1] : numericList(node.scale, 3);
  const quaternion = node.rotation === undefined ? [0, 0, 0, 1] : numericList(node.rotation, 4);
  const length = Math.hypot(...quaternion);
  if (!length) throw invalid();
  const [x, y, z, w] = quaternion.map(value => value / length);
  return [
    (1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + z * w) * sx, 2 * (x * z - y * w) * sx, 0,
    2 * (x * y - z * w) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + x * w) * sy, 0,
    2 * (x * z + y * w) * sz, 2 * (y * z - x * w) * sz, (1 - 2 * (x * x + y * y)) * sz, 0,
    ...translation, 1,
  ];
}

function multiply(parent: number[], local: number[]) {
  return identity.map((_, index) => {
    const row = index % 4;
    const column = index - row;
    return parent[row] * local[column] + parent[row + 4] * local[column + 1] +
      parent[row + 8] * local[column + 2] + parent[row + 12] * local[column + 3];
  });
}
