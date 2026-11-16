(() => {
  "use strict";

  const lookup = (selector) => document.querySelector(selector);
  const all = (selector) => Array.from(document.querySelectorAll(selector));
  const type = document.body.dataset.recipe;
  const settings = JSON.parse(lookup("#recipe-settings").textContent);
  const stage = lookup("[data-recipe-stage]");
  const canvas = stage.querySelector("canvas");
  const poster = lookup(".scene-poster");
  const load = lookup("[data-load]");
  const play = lookup("[data-play]");
  const status = lookup("[data-state]");
  const detail = lookup("[data-detail]");
  const follow = lookup("[data-follow]");
  const timeline = lookup(".scene-timeline");
  const checkpoints = all("[data-checkpoint]");
  const mediaReduced = matchMedia("(prefers-reduced-motion: reduce)");
  const pointerCoarse = matchMedia("(pointer: coarse)");
  const particleField = type === "particle-composition";
  const collection = type === "selectable-object-scene";
  const product = type === "product-viewer";
  const adaptive = type === "adaptive-quality-scene";
  const material = type === "lit-material-showcase";
  const details = Object.fromEntries(checkpoints.map((button) => [button.dataset.checkpoint, button.dataset.description]));

  // The same camera parameters drive drawing, named checkpoints and projected hit targets.
  // yaw and pitch are radians, zoom is distance scale, targetY is a world-space offset.
  const poses = {
    front: [-.38, .16, 1, 0], detail: [.16, .14, .66, .16], profile: [-1.53, .16, 1, 0],
    "key-light": [-.35, .16, 1, 0], "side-light": [-.35, .16, 1, 0], "rim-light": [-.35, .16, 1, 0],
    wide: [-.42, .42, 1.22, 0], edge: [-.4, .02, 1.28, 0], core: [-.38, .67, .8, 0],
    approach: [-.05, .12, 1.44, .14], passage: [.73, .27, .9, .13], overview: [1.12, .94, 1.5, 0],
    column: [-.08, .15, 1.42, 0], orb: [-.08, .15, 1.42, 0], knot: [-.08, .15, 1.42, 0],
    resting: [-.33, .29, 1.02, 0], above: [-.44, 1, 1.1, 0],
  };
  const materialNotes = {
    ceramic: "Ceramic. Pale satin with a broad highlight.",
    copper: "Copper. Warm-toned with a tighter studio highlight.",
    graphite: "Graphite. Dark matte with soft roll-off.",
  };
  const finishes = { terracotta: [.73, .32, .21], ink: [.14, .21, .23], moss: [.37, .49, .25] };
  const materials = { ceramic: [[.75, .78, .68], 18], copper: [[.78, .39, .21], 62], graphite: [[.21, .25, .32], 8] };
  const colorways = { jade: [.29, .68, .55], aubergine: [.57, .34, .55], sand: [.75, .58, .32] };
  const objects = [
    { id: "column", shape: "box", center: [-1.8, 0, 0], scale: [.55, 1.15, .56], rgb: [.56, .59, .31], rotation: [.09, -.04] },
    { id: "orb", shape: "sphere", center: [0, -.14, .25], scale: [.75, .75, .75], rgb: [.74, .34, .25], rotation: [0, 0] },
    { id: "knot", shape: "torus", center: [1.77, 0, -.04], scale: [.83, .83, .83], rgb: [.26, .66, .63], rotation: [.56, .2] },
  ];
  const startName = stage.dataset.recipeCheckpoint;
  let pose = [...poses[startName]];
  let active = false;
  let unavailable = false;
  let playing = false;
  let quality = "low";
  let renderer;
  let frame = 0;
  let previousTime = 0;
  let visible = true;
  let initialFramePending = false;
  let request = 0;
  let samples = [];
  let slowWindows = 0;
  let fastWindows = 0;
  let drag;

  function announceState(state, message) {
    stage.dataset.recipeState = state;
    stage.dataset.recipeRenderer = state === "live" ? "webgl" : state === "poster" ? "pending" : "fallback";
    status.textContent = message;
    if (play) play.disabled = !active || mediaReduced.matches;
    load.hidden = active || settings.quality === "static";
  }

  function refreshDetail(name) {
    const extra = material ? " " + materialNotes[settings.material] : product ? " Finish: " + settings.finish + "." : "";
    const message = (details[name] || "Manual view.") + extra;
    if (detail.textContent !== message) detail.textContent = message;
    stage.dataset.recipeCheckpoint = name;
    checkpoints.forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.checkpoint === name)));
  }

  function seek(name, user = false) {
    if (!checkpoints.some((button) => button.dataset.checkpoint === name)) return false;
    if (user && follow) follow.checked = false;
    if (playing) togglePlay(false);
    pose = [...poses[name]];
    if (material && user) {
      settings.light = { "key-light": 64, "side-light": 31, "rim-light": 8 }[name];
      lookup('[data-setting="light"]').value = settings.light;
    }
    refreshDetail(name);
    invalidate();
    return true;
  }
  window.taroRecipeCheckpoint = (name, options) => {
    const found = seek(name, true);
    if (found && options?.load === true && !active) start();
    return found;
  };
  checkpoints.forEach((button) => button.addEventListener("click", () => seek(button.dataset.checkpoint, true)));
  all("[data-turn]").forEach((button) => button.addEventListener("click", () => {
    pose[0] += Number(button.dataset.turn) * .42;
    refreshDetail("manual");
    invalidate();
  }));
  lookup("[data-reset]")?.addEventListener("click", () => seek("front", true));

  function togglePlay(next) {
    playing = next && !mediaReduced.matches && active;
    previousTime = 0;
    if (play) {
      play.textContent = playing ? "Pause rotation" : "Play rotation";
      play.setAttribute("aria-pressed", String(playing));
    }
    if (playing) invalidate();
  }
  play?.addEventListener("click", () => togglePlay(!playing));

  function setQuality(next) {
    quality = next;
    stage.dataset.recipeQuality = next;
    if (active && stage.dataset.recipeRenderer === "webgl") status.textContent = "3D active · " + next + " quality";
  }

  function invalidate() {
    if (!active || (!visible && !initialFramePending) || document.hidden || request) return;
    request = requestAnimationFrame(draw);
  }

  function monitor(delta) {
    if (!delta || settings.quality !== "auto") return;
    samples.push(delta);
    if (samples.length < 18) return;
    const sorted = samples.sort((left, right) => left - right);
    const median = sorted[Math.floor(sorted.length / 2)];
    samples = [];
    slowWindows = median > 25 ? slowWindows + 1 : 0;
    fastWindows = median < 19 ? fastWindows + 1 : 0;
    stage.dataset.recipeMedianMs = median.toFixed(1);
    if (quality === "high" && slowWindows >= 2) setQuality("low");
    if (quality === "low" && fastWindows >= 3 && !pointerCoarse.matches && !mediaReduced.matches) setQuality("high");
  }

  function draw(time) {
    request = 0;
    if (!active || (!visible && !initialFramePending) || document.hidden) return;
    initialFramePending = false;
    const delta = previousTime ? time - previousTime : 0;
    if (playing) {
      previousTime = time;
      pose[0] += Math.min(delta, 40) * .00044;
      monitor(delta);
    }
    try {
      renderer.draw(pose, quality, settings);
      stage.dataset.recipeFrame = String(++frame);
      stage.dataset.recipeYaw = pose[0].toFixed(3);
      if (stage.dataset.recipeRenderer !== "webgl") announceState("live", "3D active · " + quality + " quality");
      if (playing) invalidate();
    } catch (error) {
      stop(error.message || "WebGL could not render.");
    }
  }

  function syncScrollMode() {
    if (!timeline) return;
    timeline.classList.toggle("is-scrolling", active && !mediaReduced.matches);
    follow.disabled = mediaReduced.matches;
  }

  function updateScroll() {
    if (!timeline || !active || !follow.checked || mediaReduced.matches) return;
    const length = timeline.clientHeight - stage.clientHeight;
    if (length <= 0) return;
    const progress = Math.max(0, Math.min(1, -timeline.getBoundingClientRect().top / length));
    const scaled = progress * 2;
    const beat = Math.min(1, Math.floor(scaled));
    const start = poses[checkpoints[beat].dataset.checkpoint];
    const end = poses[checkpoints[beat + 1].dataset.checkpoint];
    pose = start.map((value, index) => value + (end[index] - value) * (scaled - beat));
    const name = checkpoints[Math.round(scaled)].dataset.checkpoint;
    if (stage.dataset.recipeCheckpoint !== name) refreshDetail(name);
    stage.dataset.recipeProgress = progress.toFixed(3);
    invalidate();
  }
  addEventListener("scroll", updateScroll, { passive: true });
  follow?.addEventListener("change", updateScroll);

  function start() {
    if (settings.quality === "static") return;
    try {
      renderer ??= createRenderer();
      unavailable = false;
      active = true;
      initialFramePending = true;
      status.textContent = 'Preparing the 3D view…';
      if (document.activeElement === load) lookup("[data-setting]")?.focus({ preventScroll: true });
      load.hidden = true;
      setQuality(settings.quality === "high" ? "high" : "low");
      syncScrollMode();
      updateScroll();
      invalidate();
    } catch {
      stop("WebGL unavailable. Showing the still preview.");
    }
  }

  function stop(message) {
    active = false;
    initialFramePending = false;
    unavailable = settings.quality !== "static";
    togglePlay(false);
    if (request) cancelAnimationFrame(request);
    request = 0;
    syncScrollMode();
    announceState("fallback", message);
    load.textContent = unavailable ? "Retry 3D" : "Load 3D";
  }
  load.addEventListener("click", start);
  canvas.addEventListener("webglcontextlost", (event) => {
    event.preventDefault();
    renderer = undefined;
    stop("3D context lost. Showing the still preview.");
  });
  canvas.addEventListener("webglcontextrestored", () => {
    if (!active && settings.quality !== "static") status.textContent = "3D can be retried.";
  });

  all("[data-setting]").forEach((control) => control.addEventListener("input", () => {
    const name = control.dataset.setting;
    settings[name] = control.type === "range" ? control.valueAsNumber : control.value;
    if (name === "quality") {
      samples = [];
      slowWindows = fastWindows = 0;
      if (settings.quality === "static") stop("Static view selected.");
      else if (active) setQuality(settings.quality === "high" ? "high" : "low");
      else {
        announceState(unavailable ? "fallback" : "poster", unavailable ? "Showing the still preview." : "Still preview");
        load.textContent = unavailable ? "Retry 3D" : "Load 3D";
      }
    }
    refreshDetail(stage.dataset.recipeCheckpoint);
    if (product) poster.dataset.finish = settings.finish;
    if (material) poster.dataset.material = settings.material;
    if (adaptive) poster.dataset.colorway = settings.colorway;
    invalidate();
  }));

  addEventListener("resize", () => {
    updateScroll();
    invalidate();
  }, { passive: true });
  new ResizeObserver(invalidate).observe(stage);
  function visibilityChanged() {
    if ((!visible && !initialFramePending) || document.hidden) {
      cancelAnimationFrame(request);
      request = 0;
      previousTime = 0;
      samples = [];
    } else invalidate();
  }
  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    visibilityChanged();
  }).observe(stage);
  document.addEventListener("visibilitychange", visibilityChanged);
  mediaReduced.addEventListener("change", () => {
    if (mediaReduced.matches) {
      togglePlay(false);
      if (settings.quality === "auto") setQuality("low");
    }
    if (play) play.disabled = !active || mediaReduced.matches;
    syncScrollMode();
    invalidate();
  });

  if (product) {
    canvas.addEventListener("pointerdown", (event) => {
      if (!event.isPrimary || event.button !== 0) return;
      canvas.setPointerCapture(event.pointerId);
      drag = [event.clientX, pose[0]];
    });
    canvas.addEventListener("pointermove", (event) => {
      if (!drag) return;
      pose[0] = drag[1] + (event.clientX - drag[0]) * .012;
      refreshDetail("manual");
      invalidate();
    });
    for (const event of ["pointerup", "pointercancel", "lostpointercapture"]) canvas.addEventListener(event, () => { drag = undefined; });
  }
  if (collection) {
    canvas.addEventListener("click", (event) => {
      const bounds = canvas.getBoundingClientRect();
      const x = (event.clientX - bounds.left) / bounds.width * 2 - 1;
      const y = 1 - (event.clientY - bounds.top) / bounds.height * 2;
      const hit = objects.map((object) => {
        const target = project(object.center, pose, bounds.width / bounds.height);
        return { id: object.id, distance: Math.hypot(x - target[0], (y - target[1]) / 1.6) };
      }).sort((left, right) => left.distance - right.distance)[0];
      if (hit.distance < .23) seek(hit.id);
    });
  }

  // All shaders and geometry are original and self-contained.
  const vertexSource = `
    attribute vec3 vertex;
    attribute vec3 normal;
    uniform vec3 center;
    uniform vec3 size;
    uniform vec2 rotation;
    uniform vec4 camera;
    uniform float aspect;
    uniform float pointSize;
    varying vec3 direction;
    varying vec3 location;
    vec3 turn(vec3 p, float a) { return vec3(cos(a) * p.x + sin(a) * p.z, p.y, -sin(a) * p.x + cos(a) * p.z); }
    vec3 tilt(vec3 p, float a) { return vec3(p.x, cos(a) * p.y - sin(a) * p.z, sin(a) * p.y + cos(a) * p.z); }
    void main() {
      location = tilt(turn(vertex * size, rotation.x), rotation.y) + center;
      direction = normalize(tilt(turn(normal / size, rotation.x), rotation.y));
      vec3 p = tilt(turn(location - vec3(0., camera.w, 0.), camera.x), camera.y);
      float depth = 6.6 - p.z;
      float lens = 3.8 / camera.z;
      gl_Position = vec4(p.x * lens / max(.78, aspect), p.y * lens, depth - 1., depth);
      gl_PointSize = pointSize * 6.6 / depth;
    }
  `;
  const fragmentSource = `
    precision mediump float;
    varying vec3 direction;
    varying vec3 location;
    uniform vec3 pigment;
    uniform float shine;
    uniform vec3 keyLight;
    uniform bool points;
    void main() {
      if (points) {
        float radius = length(gl_PointCoord - .5);
        if (radius > .48) discard;
        gl_FragColor = vec4(mix(pigment, vec3(.78, .92, 1.), smoothstep(.3, 1.5, length(location))), 1. - radius * 1.5);
      } else {
        vec3 n = normalize(direction);
        vec3 light = normalize(keyLight);
        float lit = max(0., dot(n, light));
        float rim = max(0., dot(n, normalize(vec3(.55, .2, -.9))));
        float highlight = pow(max(0., dot(n, normalize(light + vec3(0., .15, 1.)))), shine);
        vec3 tint = pigment * (.34 + lit * .65 + rim * .17) + vec3(.95, .91, .78) * highlight * .49;
        gl_FragColor = vec4(tint, 1.);
      }
    }
  `;

  function project(vector, camera, aspect) {
    const [yaw, pitch, zoom, targetY] = camera;
    const [x, y, z] = vector;
    const side = Math.cos(yaw) * x + Math.sin(yaw) * z;
    const rotatedZ = -Math.sin(yaw) * x + Math.cos(yaw) * z;
    const up = Math.cos(pitch) * (y - targetY) - Math.sin(pitch) * rotatedZ;
    const depth = 6.6 - Math.sin(pitch) * (y - targetY) - Math.cos(pitch) * rotatedZ;
    return [side * 3.8 / (zoom * Math.max(.78, aspect) * depth), up * 3.8 / (zoom * depth)];
  }

  function gridMesh(segments, rings, sample) {
    const vertices = [];
    for (let row = 0; row < rings; row++) {
      for (let column = 0; column < segments; column++) {
        const a = sample(column / segments, row / rings);
        const b = sample((column + 1) / segments, row / rings);
        const c = sample((column + 1) / segments, (row + 1) / rings);
        const d = sample(column / segments, (row + 1) / rings);
        vertices.push(...a, ...b, ...c, ...a, ...c, ...d);
      }
    }
    return Float32Array.from(vertices);
  }

  function roundedBox(resolution) {
    const corners = [];
    for (let axis = 0; axis < 3; axis++) {
      for (const face of [-1, 1]) {
        corners.push(gridMesh(resolution, resolution, (u, v) => {
          const p = [0, 0, 0];
          p[axis] = face;
          p[(axis + 1) % 3] = u * 2 - 1;
          p[(axis + 2) % 3] = v * 2 - 1;
          const inside = p.map((value) => Math.max(-.83, Math.min(.83, value)));
          const outside = p.map((value, index) => value - inside[index]);
          const distance = Math.hypot(...outside);
          const normal = outside.map((value) => value / distance);
          return [...inside.map((value, index) => value + normal[index] * .17), ...normal];
        }));
      }
    }
    return Float32Array.from(corners.flatMap((face) => Array.from(face)));
  }

  function sphere(segments) {
    return gridMesh(segments, segments / 2, (u, v) => {
      const phi = u * 2 * Math.PI;
      const theta = v * Math.PI;
      const position = [Math.sin(theta) * Math.cos(phi), Math.cos(theta), Math.sin(theta) * Math.sin(phi)];
      return [...position, ...position];
    });
  }

  function torus(segments) {
    return gridMesh(segments, segments / 2, (u, v) => {
      const a = u * 2 * Math.PI;
      const b = v * 2 * Math.PI;
      const radius = .73 + .24 * Math.cos(b);
      return [Math.cos(a) * radius, Math.sin(a) * radius, .24 * Math.sin(b), Math.cos(a) * Math.cos(b), Math.sin(a) * Math.cos(b), Math.sin(b)];
    });
  }

  function points() {
    let seed = 6379;
    function next() {
      seed = (1664525 * seed + 1013904223) >>> 0;
      return seed / 4294967296;
    }
    return Float32Array.from(Array.from({ length: 1800 }, (_, index) => {
      const radius = Math.sqrt(next()) * 2.64;
      const angle = index % 3 * 2.0944 + radius * 1.8 + (next() - .5) * .64;
      return [Math.cos(angle) * radius, (next() - .5) * .72 * (1 - radius / 3.1), Math.sin(angle) * radius, 0, 1, 0];
    }).flat());
  }

  function createRenderer() {
    const gl = canvas.getContext("webgl", { alpha: false, antialias: false, depth: true });
    if (!gl || gl.isContextLost()) throw Error("WebGL unavailable.");
    function shader(kind, source) {
      const compiled = gl.createShader(kind);
      gl.shaderSource(compiled, source);
      gl.compileShader(compiled);
      if (!gl.getShaderParameter(compiled, gl.COMPILE_STATUS)) {
        const error = gl.getShaderInfoLog(compiled);
        gl.deleteShader(compiled);
        throw Error(error || "Could not compile the scene shader.");
      }
      return compiled;
    }
    const program = gl.createProgram();
    const vertex = shader(gl.VERTEX_SHADER, vertexSource);
    const fragment = shader(gl.FRAGMENT_SHADER, fragmentSource);
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const error = gl.getProgramInfoLog(program);
      gl.deleteProgram(program);
      throw Error(error || "Could not link the scene shader.");
    }
    const uniforms = Object.fromEntries(["center", "size", "rotation", "camera", "aspect", "pointSize", "pigment", "shine", "keyLight", "points"].map((name) => [name, gl.getUniformLocation(program, name)]));
    const positionLocation = gl.getAttribLocation(program, "vertex");
    const normalLocation = gl.getAttribLocation(program, "normal");
    const buffers = new Map();
    gl.useProgram(program);
    gl.enableVertexAttribArray(positionLocation);
    gl.enableVertexAttribArray(normalLocation);
    gl.enable(gl.DEPTH_TEST);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    function mesh(shape, tier) {
      const key = shape === "points" ? shape : shape + ":" + tier;
      if (!buffers.has(key)) {
        const segments = tier === "high" ? 40 : 18;
        const data = shape === "box" ? roundedBox(tier === "high" ? 12 : 6)
          : shape === "sphere" ? sphere(segments) : shape === "torus" ? torus(segments) : points();
        const buffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
        buffers.set(key, { buffer, count: data.length / 6 });
      }
      return buffers.get(key);
    }

    function draw(camera, tier, parameters) {
      const scale = tier === "low" ? .82 : Math.min(1.75, devicePixelRatio);
      const width = Math.max(1, Math.floor(canvas.clientWidth * scale));
      const height = Math.max(1, Math.floor(canvas.clientHeight * scale));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      gl.viewport(0, 0, width, height);
      gl.clearColor(...(particleField ? [.046, .094, .115, 1] : [.063, .098, .083, 1]));
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.uniform4fv(uniforms.camera, camera);
      gl.uniform1f(uniforms.aspect, width / height);
      const lightX = material ? (Number(parameters.light) / 100) * 2 - 1.25 : -.67;
      gl.uniform3f(uniforms.keyLight, lightX, .85, .75);
      gl.uniform1f(uniforms.pointSize, (tier === "low" ? 2.4 : 2.9) * scale);
      gl.uniform1i(uniforms.points, Number(particleField));
      if (particleField) gl.enable(gl.BLEND);
      const sceneObjects = describeGeometry(parameters);
      for (const object of sceneObjects) {
        const bound = mesh(object.shape, tier);
        gl.bindBuffer(gl.ARRAY_BUFFER, bound.buffer);
        gl.vertexAttribPointer(positionLocation, 3, gl.FLOAT, false, 24, 0);
        gl.vertexAttribPointer(normalLocation, 3, gl.FLOAT, false, 24, 12);
        gl.uniform3fv(uniforms.center, object.center);
        gl.uniform3fv(uniforms.size, object.scale);
        gl.uniform2fv(uniforms.rotation, object.rotation);
        gl.uniform3fv(uniforms.pigment, object.rgb);
        gl.uniform1f(uniforms.shine, object.shine ?? 18);
        const count = particleField ? Math.min(bound.count, tier === "low" ? Math.ceil(parameters.density * .45) : parameters.density) : bound.count;
        gl.drawArrays(particleField ? gl.POINTS : gl.TRIANGLES, 0, count);
        if (particleField) stage.dataset.recipePoints = String(count);
      }
      if (gl.isContextLost()) throw Error("3D context lost.");
    }

    return { draw };
  }

  function describeGeometry(parameters) {
    function shape(shape, center, scale, rgb, rotation = [0, 0], shine = 18) {
      return { shape, center, scale, rgb, rotation, shine };
    }
    if (product) {
      return [
        shape("box", [0, 0, 0], [.82, 1.17, .61], finishes[parameters.finish]),
        shape("sphere", [0, -.27, .62], [.54, .54, .115], [.12, .15, .15], [0, 0], 36),
        shape("sphere", [0, -.27, .72], [.24, .24, .075], [.23, .26, .24]),
        shape("sphere", [0, .58, .62], [.2, .2, .073], [.16, .19, .19]),
        shape("sphere", [0, .58, .69], [.085, .085, .043], [.5, .48, .36]),
      ];
    }
    if (material) {
      const [rgb, shine] = materials[parameters.material];
      return [shape("sphere", [0, 0, 0], [1.27, 1.27, 1.27], rgb, [0, 0], shine)];
    }
    if (particleField) return [shape("points", [0, 0, 0], [1, 1, 1], [.27, .75, .68])];
    if (collection) {
      return objects.map((object) => object.id === stage.dataset.recipeCheckpoint
        ? { ...object, rgb: object.rgb.map((value) => Math.min(1, value * 1.24 + .08)), shine: 38 }
        : object);
    }
    if (adaptive) {
      const rgb = colorways[parameters.colorway];
      return [
        shape("torus", [0, .12, 0], [1.45, 1.45, 1.45], rgb, [.83, -.21], 46),
        shape("torus", [0, -.08, -.1], [1.24, 1.24, 1.24], rgb.map((value) => value * .74), [-.86, .48], 25),
      ];
    }
    const rgb = parameters.scene === "ember" ? [.77, .43, .27] : [.48, .68, .57];
    return [
      shape("box", [-1.62, -.13, .36], [.53, 1.18, .56], rgb, [.21, .07]),
      shape("box", [-.69, -.41, -1.0], [.36, .9, .36], [.68, .60, .38], [-.21, -.04]),
      shape("box", [.91, -.1, -.82], [.57, 1.2, .47], rgb.map((value) => value * .73), [-.35, .16]),
      shape("box", [1.63, -.44, .38], [.44, .87, .51], [.53, .35, .31], [.38, -.19]),
      shape("box", [0, -1.35, -.16], [2.65, .12, 1.75], [.22, .31, .26]),
    ];
  }

  if (product) poster.dataset.finish = settings.finish;
  if (material) poster.dataset.material = settings.material;
  if (adaptive) poster.dataset.colorway = settings.colorway;
  refreshDetail(startName);
  if (settings.quality === "static") stop("Static view selected.");
  load.disabled = false;
})();
