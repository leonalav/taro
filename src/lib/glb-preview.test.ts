import { expect, it } from "vitest";
import { decodeGlbPreview } from "./glb-preview";

function glb(document: Record<string, unknown>, bytes: Uint8Array) {
  const input = new TextEncoder().encode(JSON.stringify(document));
  const jsonSize = Math.ceil(input.length / 4) * 4;
  const binarySize = Math.ceil(bytes.length / 4) * 4;
  const output = new ArrayBuffer(28 + jsonSize + binarySize);
  const view = new DataView(output);
  const data = new Uint8Array(output);
  data.fill(0x20, 20, 20 + jsonSize);
  data.set(input, 20);
  data.set(bytes, 28 + jsonSize);
  [0x46546c67, 2, output.byteLength, jsonSize, 0x4e4f534a].forEach((value, index) => view.setUint32(index * 4, value, true));
  view.setUint32(20 + jsonSize, binarySize, true);
  view.setUint32(24 + jsonSize, 0x004e4942, true);
  return output;
}

function fixture() {
  const binary = new ArrayBuffer(54);
  const bytes = new DataView(binary);
  [[-1, -1, 0], [1, -1, 0], [0, 1, 0]].forEach((vertex, index) => {
    vertex.forEach((coordinate, axis) => bytes.setFloat32(index * 16 + axis * 4, coordinate, true));
  });
  [0, 1, 2].forEach((index, i) => bytes.setUint16(48 + i * 2, index, true));
  return {
    document: {
      asset: { version: "2.0" }, scene: 0, scenes: [{ nodes: [0] }],
      nodes: [{ translation: [10, 0, 0], children: [1] }, { mesh: 0, scale: [2, 1, 1] }],
      buffers: [{ byteLength: binary.byteLength }],
      bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 48, byteStride: 16 }, { buffer: 0, byteOffset: 48, byteLength: 6 }],
      accessors: [
        { bufferView: 0, componentType: 5126, type: "VEC3", count: 3 },
        { bufferView: 1, componentType: 5123, type: "SCALAR", count: 3 },
      ],
      meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1, material: 0 }] }],
      materials: [{ pbrMetallicRoughness: { baseColorFactor: [0.8, 0.2, 0.1, 1] } }],
    },
    bytes: new Uint8Array(binary),
  };
}

it("reads strided positions and indexed triangles, applies hierarchy transforms, and retains the base color", () => {
  const { document, bytes } = fixture();
  const preview = decodeGlbPreview(glb(document, bytes));
  expect(preview.triangles).toBe(1);
  expect(preview.scale).toBeCloseTo(1 / Math.hypot(2, 1));
  expect(preview.center).toEqual([10, 0, 0]);
  expect(Array.from(preview.vertices.slice(0, 6))).toEqual([
    Math.fround(-2 * preview.scale), Math.fround(-preview.scale), 0, Math.fround(0.8), Math.fround(0.2), Math.fround(0.1),
  ]);
});

it("supports direct triangle vertices and reports when it substitutes a flat material for textures", () => {
  const { document, bytes } = fixture();
  delete (document.meshes[0].primitives[0] as { indices?: number }).indices;
  const material = document.materials[0].pbrMetallicRoughness;
  Object.assign(material, { baseColorTexture: { index: 0 } });
  const preview = decodeGlbPreview(glb(document, bytes));
  expect(preview.triangles).toBe(1);
  expect(preview.simplifiedMaterials).toBe(true);
});

it("rejects unsupported features, external buffers, invalid indices, and truncated input", () => {
  const { document, bytes } = fixture();
  expect(() => decodeGlbPreview(glb({ ...document, extensionsRequired: ["KHR_draco_mesh_compression"] }, bytes))).toThrow(/compressed.*rendered preview image/i);
  expect(() => decodeGlbPreview(glb({ ...document, buffers: [{ byteLength: 54, uri: "somewhere.bin" }] }, bytes))).toThrow(/embedded/i);
  expect(() => decodeGlbPreview(glb({ ...document, animations: [{}] }, bytes))).toThrow(/animation/i);
  expect(() => decodeGlbPreview(glb(document, bytes).slice(0, -1))).toThrow(/invalid/i);
  new DataView(bytes.buffer).setUint16(52, 36, true);
  expect(() => decodeGlbPreview(glb(document, bytes))).toThrow(/vertex index/i);
});
