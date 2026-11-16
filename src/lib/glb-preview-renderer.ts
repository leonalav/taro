import type { GlbPreviewGeometry } from "./glb-preview";

const vertexShaderSource = `#version 300 es
layout(location = 0) in vec3 position;
layout(location = 1) in vec3 color;
uniform vec2 angles;
uniform vec2 fit;
out vec3 surface;
out vec3 tint;
void main() {
  float cy = cos(angles.x);
  float sy = sin(angles.x);
  float cp = cos(angles.y);
  float sp = sin(angles.y);
  vec3 yaw = vec3(cy * position.x + sy * position.z, position.y, -sy * position.x + cy * position.z);
  surface = vec3(yaw.x, cp * yaw.y - sp * yaw.z, sp * yaw.y + cp * yaw.z);
  tint = color;
  gl_Position = vec4(surface.xy * fit, -0.85 * surface.z, 1.0);
}`;

const fragmentShaderSource = `#version 300 es
precision highp float;
in vec3 surface;
in vec3 tint;
out vec4 pixel;
void main() {
  vec3 normal = normalize(cross(dFdx(surface), dFdy(surface)));
  vec3 light = normalize(vec3(-0.45, 0.65, 0.8));
  float shade = 0.37 + 0.63 * max(0.0, dot(normal, light));
  pixel = vec4(pow(max(tint * shade, vec3(0.0)), vec3(1.0 / 2.2)), 1.0);
}`;

export function createGlbPreviewRenderer(canvas: HTMLCanvasElement, geometry: GlbPreviewGeometry) {
  const gl = canvas.getContext("webgl2", { antialias: true, alpha: false, powerPreference: "low-power" });
  if (!gl) throw Error("3D rendering is unavailable on this device.");
  const program = linkProgram(gl);
  const vertices = gl.createBuffer();
  const array = gl.createVertexArray();
  const dispose = () => {
    gl.deleteVertexArray(array);
    gl.deleteBuffer(vertices);
    gl.deleteProgram(program);
  };
  try {
    if (!vertices || !array) throw Error("Graphics memory is unavailable.");
    gl.bindVertexArray(array);
    gl.bindBuffer(gl.ARRAY_BUFFER, vertices);
    gl.bufferData(gl.ARRAY_BUFFER, geometry.vertices, gl.STATIC_DRAW);
    if (gl.getError() !== gl.NO_ERROR) throw Error("Could not allocate the model preview.");
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 12);
    gl.useProgram(program);
    gl.enable(gl.DEPTH_TEST);
    gl.clearColor(0.052, 0.063, 0.09, 1);
    const angles = gl.getUniformLocation(program, "angles");
    const fit = gl.getUniformLocation(program, "fit");
    return {
      render(yaw: number, pitch: number) {
        const width = gl.drawingBufferWidth;
        const height = gl.drawingBufferHeight;
        if (!width || !height) return;
        const size = 0.88 * Math.min(width, height);
        gl.viewport(0, 0, width, height);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.uniform2f(angles, yaw, pitch);
        gl.uniform2f(fit, size / width, size / height);
        gl.drawArrays(gl.TRIANGLES, 0, geometry.vertices.length / 6);
      },
      dispose,
    };
  } catch (error) {
    dispose();
    throw error;
  }
}

function linkProgram(gl: WebGL2RenderingContext) {
  const program = gl.createProgram();
  const vertex = gl.createShader(gl.VERTEX_SHADER);
  const fragment = gl.createShader(gl.FRAGMENT_SHADER);
  try {
    if (!program || !vertex || !fragment) throw Error("Could not start the 3D preview.");
    gl.shaderSource(vertex, vertexShaderSource);
    gl.shaderSource(fragment, fragmentShaderSource);
    gl.compileShader(vertex);
    gl.compileShader(fragment);
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw Error("The graphics device could not start the 3D preview.");
    return program;
  } catch (error) {
    gl.deleteProgram(program);
    throw error;
  } finally {
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
  }
}
