const VERTEX_SHADER = `
attribute vec3 aPosition;
attribute vec3 aColor;
uniform mat4 uMatrix;
varying vec3 vColor;
void main() {
  vColor = aColor;
  gl_Position = uMatrix * vec4(aPosition, 1.0);
}
`;

const FRAGMENT_SHADER = `
precision mediump float;
varying vec3 vColor;
void main() {
  gl_FragColor = vec4(vColor, 1.0);
}
`;

function createShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(shader) ?? "WebGL shader compile failed");
  }
  return shader;
}

function createProgram(gl) {
  const program = gl.createProgram();
  gl.attachShader(program, createShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER));
  gl.attachShader(program, createShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program) ?? "WebGL program link failed");
  }
  return program;
}

function normalize(vector) {
  const length = Math.hypot(vector[0], vector[1], vector[2]) || 1;
  return [vector[0] / length, vector[1] / length, vector[2] / length];
}

function subtract(a, b) {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function cross(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0]
  ];
}

function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cameraVector(value, fallback) {
  const source = Array.isArray(value) ? value : [value?.x, value?.y, value?.z];
  const vector = source.map(Number);
  return vector.length === 3 && vector.every(Number.isFinite) ? vector : [...fallback];
}

function writeCameraVector(target, value) {
  target.x = Number(value[0].toFixed(4));
  target.y = Number(value[1].toFixed(4));
  target.z = Number(value[2].toFixed(4));
}

function perspective(fovy, aspect, near, far) {
  const f = 1 / Math.tan(fovy / 2);
  const nf = 1 / (near - far);
  return new Float32Array([
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far + near) * nf, -1,
    0, 0, (2 * far * near) * nf, 0
  ]);
}

function lookAt(eye, center, up) {
  const z = normalize(subtract(eye, center));
  const x = normalize(cross(up, z));
  const y = cross(z, x);
  return new Float32Array([
    x[0], y[0], z[0], 0,
    x[1], y[1], z[1], 0,
    x[2], y[2], z[2], 0,
    -dot(x, eye), -dot(y, eye), -dot(z, eye), 1
  ]);
}

function multiply(a, b) {
  const out = new Float32Array(16);
  for (let column = 0; column < 4; column += 1) {
    for (let row = 0; row < 4; row += 1) {
      out[column * 4 + row] =
        a[0 * 4 + row] * b[column * 4 + 0] +
        a[1 * 4 + row] * b[column * 4 + 1] +
        a[2 * 4 + row] * b[column * 4 + 2] +
        a[3 * 4 + row] * b[column * 4 + 3];
    }
  }
  return out;
}

function modelMatrix(transform = {}, extraRotationY = 0) {
  const position = transform.position ?? { x: 0, y: 1, z: 0 };
  const rotation = transform.rotation ?? { x: 0, y: 0, z: 0 };
  const scale = transform.scale ?? { x: 1, y: 1, z: 1 };
  const yRotation = (rotation.y ?? 0) + extraRotationY;
  const sx = Math.max(0.01, scale.x ?? 1);
  const sy = Math.max(0.01, scale.y ?? 1);
  const sz = Math.max(0.01, scale.z ?? 1);
  const c = Math.cos(yRotation);
  const s = Math.sin(yRotation);
  return new Float32Array([
    c * sx, 0, -s * sx, 0,
    0, sy, 0, 0,
    s * sz, 0, c * sz, 0,
    position.x ?? 0, position.y ?? 1, position.z ?? 0, 1
  ]);
}

function pushVertex(target, position, color) {
  target.push(position[0], position[1], position[2], color[0], color[1], color[2]);
}

function createGridVertices() {
  const vertices = [];
  const size = 24;
  for (let index = -size; index <= size; index += 1) {
    const lineColor = index === 0 ? [0.32, 0.72, 0.28] : [0.18, 0.25, 0.31];
    const crossColor = index === 0 ? [0.84, 0.18, 0.18] : [0.18, 0.25, 0.31];
    pushVertex(vertices, [-size, 0, index], lineColor);
    pushVertex(vertices, [size, 0, index], lineColor);
    pushVertex(vertices, [index, 0, -size], crossColor);
    pushVertex(vertices, [index, 0, size], crossColor);
  }
  return new Float32Array(vertices);
}

function createAxisVertices() {
  const vertices = [];
  pushVertex(vertices, [0, 0.02, 0], [0.9, 0.2, 0.2]);
  pushVertex(vertices, [3, 0.02, 0], [0.9, 0.2, 0.2]);
  pushVertex(vertices, [0, 0.02, 0], [0.25, 0.8, 0.35]);
  pushVertex(vertices, [0, 3, 0], [0.25, 0.8, 0.35]);
  pushVertex(vertices, [0, 0.02, 0], [0.2, 0.45, 0.95]);
  pushVertex(vertices, [0, 0.02, 3], [0.2, 0.45, 0.95]);
  return new Float32Array(vertices);
}

function hexToRgb(value, fallback = [0.74, 0.77, 0.8]) {
  if (typeof value !== "string" || !/^#[0-9a-f]{6}$/i.test(value)) return fallback;
  return [
    Number.parseInt(value.slice(1, 3), 16) / 255,
    Number.parseInt(value.slice(3, 5), 16) / 255,
    Number.parseInt(value.slice(5, 7), 16) / 255
  ];
}

function shade(color, amount) {
  return color.map((channel) => Math.min(1, Math.max(0, channel * amount)));
}

function createCubeVertices(object = {}) {
  const baseColor = hexToRgb(object.material?.color);
  const p = {
    a: [-0.8, -0.8, 0.8],
    b: [0.8, -0.8, 0.8],
    c: [0.8, 0.8, 0.8],
    d: [-0.8, 0.8, 0.8],
    e: [-0.8, -0.8, -0.8],
    f: [0.8, -0.8, -0.8],
    g: [0.8, 0.8, -0.8],
    h: [-0.8, 0.8, -0.8]
  };
  const faces = [
    [[p.a, p.b, p.c], [p.a, p.c, p.d], shade(baseColor, 1.05)],
    [[p.b, p.f, p.g], [p.b, p.g, p.c], shade(baseColor, 0.7)],
    [[p.d, p.c, p.g], [p.d, p.g, p.h], shade(baseColor, 1.22)],
    [[p.e, p.h, p.g], [p.e, p.g, p.f], shade(baseColor, 0.48)],
    [[p.a, p.d, p.h], [p.a, p.h, p.e], shade(baseColor, 0.82)],
    [[p.a, p.e, p.f], [p.a, p.f, p.b], shade(baseColor, 0.62)]
  ];
  const vertices = [];
  for (const [triA, triB, color] of faces) {
    for (const point of triA) pushVertex(vertices, point, color);
    for (const point of triB) pushVertex(vertices, point, color);
  }
  return new Float32Array(vertices);
}

function createCubeWireVertices(object = {}) {
  const color = object.selected ? [0.96, 0.98, 1] : [0.46, 0.57, 0.68];
  const corners = [
    [-0.8, -0.8, 0.8], [0.8, -0.8, 0.8], [0.8, 0.8, 0.8], [-0.8, 0.8, 0.8],
    [-0.8, -0.8, -0.8], [0.8, -0.8, -0.8], [0.8, 0.8, -0.8], [-0.8, 0.8, -0.8]
  ];
  const edges = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]];
  const vertices = [];
  for (const [a, b] of edges) {
    pushVertex(vertices, corners[a], color);
    pushVertex(vertices, corners[b], color);
  }
  return new Float32Array(vertices);
}

function createBuffer(gl, data) {
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
  return { buffer, count: data.length / 6 };
}

function getPositionDistance(object = {}) {
  const position = object.transform?.position ?? {};
  const x = Number(position.x ?? 0);
  const y = Number(position.y ?? 0);
  const z = Number(position.z ?? 0);
  return Math.hypot(x, y * 0.4, z);
}

function createViewportObjectWindow(objects = [], config = {}) {
  const culling = config.culling === "none" ? "none" : "distance-window";
  const maxDrawnObjects = Math.max(25, Math.min(3000, Math.floor(Number(config.maxDrawnObjects) || 700)));
  const selected = objects.filter((object) => object.selected);
  const selectedIds = new Set(selected.map((object) => object.id));
  const remaining = objects
    .filter((object) => !selectedIds.has(object.id))
    .sort((a, b) => getPositionDistance(a) - getPositionDistance(b));
  const drawn = culling === "none" ? objects.slice() : [...selected, ...remaining].slice(0, maxDrawnObjects);
  return {
    objects: drawn,
    stats: {
      renderer: config.renderer ?? "webgl",
      culling,
      totalObjects: objects.length,
      drawnObjects: drawn.length,
      culledObjects: Math.max(0, objects.length - drawn.length),
      maxDrawnObjects: culling === "none" ? objects.length : maxDrawnObjects
    }
  };
}

function drawBuffer(gl, mesh, mode, matrix, matrixLocation, positionLocation, colorLocation) {
  gl.bindBuffer(gl.ARRAY_BUFFER, mesh.buffer);
  gl.vertexAttribPointer(positionLocation, 3, gl.FLOAT, false, 24, 0);
  gl.vertexAttribPointer(colorLocation, 3, gl.FLOAT, false, 24, 12);
  gl.uniformMatrix4fv(matrixLocation, false, matrix);
  gl.drawArrays(mode, 0, mesh.count);
}

export function createViewportRenderer(canvas, project, options = {}) {
  const gl = canvas.getContext("webgl", { antialias: true, alpha: true, preserveDrawingBuffer: true });
  if (!gl) {
    const sceneObjects = project.scene3d?.objects?.length ? project.scene3d.objects : [];
    const stats = createViewportObjectWindow(sceneObjects, options.viewportConfig ?? {}).stats;
    return { type: "fallback", getStats() { return { ...stats, renderer: "fallback", frame: 0 }; }, dispose() {} };
  }

  const program = createProgram(gl);
  const positionLocation = gl.getAttribLocation(program, "aPosition");
  const colorLocation = gl.getAttribLocation(program, "aColor");
  const matrixLocation = gl.getUniformLocation(program, "uMatrix");
  const grid = createBuffer(gl, createGridVertices());
  const axes = createBuffer(gl, createAxisVertices());
  const sceneObjects = project.scene3d?.objects?.length ? project.scene3d.objects : [];
  const viewportConfig = options.viewportConfig ?? {};
  const objectWindow = createViewportObjectWindow(sceneObjects, viewportConfig);
  let renderStats = { ...objectWindow.stats, frame: 0 };
  const objectMeshes = objectWindow.objects.map((object) => ({
    object,
    cube: createBuffer(gl, createCubeVertices(object)),
    wire: createBuffer(gl, createCubeWireVertices(object))
  }));
  let disposed = false;
  let frame = 0;
  const projectCamera = project.scene3d.camera ??= {};
  projectCamera.position ??= { x: 4.8, y: 3.2, z: 6.2 };
  projectCamera.target ??= { x: 0, y: 0.85, z: 0 };
  let cameraPosition = cameraVector(projectCamera.position, [4.8, 3.2, 6.2]);
  let cameraTarget = cameraVector(projectCamera.target, [0, 0.85, 0]);
  let drag = null;

  function commitCamera() {
    writeCameraVector(projectCamera.position, cameraPosition);
    writeCameraVector(projectCamera.target, cameraTarget);
    options.onCameraChange?.({ position: { ...projectCamera.position }, target: { ...projectCamera.target } });
  }

  function orbit(deltaX, deltaY) {
    const offset = subtract(cameraPosition, cameraTarget);
    const distance = Math.max(0.35, Math.hypot(...offset));
    let yaw = Math.atan2(offset[0], offset[2]);
    let pitch = Math.asin(Math.max(-0.98, Math.min(0.98, offset[1] / distance)));
    yaw -= deltaX * 0.008;
    pitch = Math.max(-1.42, Math.min(1.42, pitch + deltaY * 0.006));
    const horizontal = Math.cos(pitch) * distance;
    cameraPosition = [
      cameraTarget[0] + Math.sin(yaw) * horizontal,
      cameraTarget[1] + Math.sin(pitch) * distance,
      cameraTarget[2] + Math.cos(yaw) * horizontal
    ];
    commitCamera();
  }

  function pan(deltaX, deltaY) {
    const forward = normalize(subtract(cameraTarget, cameraPosition));
    const right = normalize(cross(forward, [0, 1, 0]));
    const up = normalize(cross(right, forward));
    const distance = Math.max(1, Math.hypot(...subtract(cameraPosition, cameraTarget)));
    const scale = distance * 0.0016;
    const move = right.map((value, index) => value * -deltaX * scale + up[index] * deltaY * scale);
    cameraPosition = cameraPosition.map((value, index) => value + move[index]);
    cameraTarget = cameraTarget.map((value, index) => value + move[index]);
    commitCamera();
  }

  function zoom(delta) {
    const offset = subtract(cameraPosition, cameraTarget);
    const distance = Math.max(0.5, Math.hypot(...offset));
    const next = Math.max(0.5, Math.min(500, distance * Math.exp(delta * 0.001)));
    const direction = normalize(offset);
    cameraPosition = cameraTarget.map((value, index) => value + direction[index] * next);
    commitCamera();
  }

  function onPointerDown(event) {
    if (![0, 1, 2].includes(event.button)) return;
    drag = { x: event.clientX, y: event.clientY, pan: event.button !== 0 || event.shiftKey };
    canvas.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  }

  function onPointerMove(event) {
    if (!drag) return;
    const deltaX = event.clientX - drag.x;
    const deltaY = event.clientY - drag.y;
    drag.x = event.clientX;
    drag.y = event.clientY;
    if (drag.pan || event.shiftKey) pan(deltaX, deltaY);
    else orbit(deltaX, deltaY);
  }

  function onPointerUp(event) {
    drag = null;
    canvas.releasePointerCapture?.(event.pointerId);
  }

  function onWheel(event) {
    zoom(event.deltaY);
    event.preventDefault();
  }

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerUp);
  canvas.addEventListener("wheel", onWheel, { passive: false });
  canvas.addEventListener("contextmenu", (event) => event.preventDefault());

  function resize() {
    const scale = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.floor(canvas.clientWidth * scale));
    const height = Math.max(1, Math.floor(canvas.clientHeight * scale));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    gl.viewport(0, 0, canvas.width, canvas.height);
  }

  function render(now = 0) {
    if (disposed) return;
    resize();
    const aspect = canvas.width / canvas.height;
    const fov = Math.max(20, Math.min(110, Number(projectCamera.fov) || 45)) * Math.PI / 180;
    const projection = perspective(fov, aspect, 0.05, 1000);
    const view = lookAt(cameraPosition, cameraTarget, [0, 1, 0]);
    const viewProjection = multiply(projection, view);
    const mode = options.getMode?.() ?? "stopped";
    const spin = mode === "playing" ? now * 0.00045 : 0;
    renderStats = { ...objectWindow.stats, frame: renderStats.frame + 1 };

    gl.useProgram(program);
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(0.035, 0.07, 0.105, 0.86);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enableVertexAttribArray(positionLocation);
    gl.enableVertexAttribArray(colorLocation);
    drawBuffer(gl, grid, gl.LINES, viewProjection, matrixLocation, positionLocation, colorLocation);
    gl.lineWidth(2);
    drawBuffer(gl, axes, gl.LINES, viewProjection, matrixLocation, positionLocation, colorLocation);
    for (const mesh of objectMeshes) {
      const objectSpin = mesh.object.selected ? spin : 0;
      const cubeMatrix = multiply(viewProjection, modelMatrix(mesh.object.transform, objectSpin));
      drawBuffer(gl, mesh.cube, gl.TRIANGLES, cubeMatrix, matrixLocation, positionLocation, colorLocation);
      drawBuffer(gl, mesh.wire, gl.LINES, cubeMatrix, matrixLocation, positionLocation, colorLocation);
    }
    options.onStats?.(renderStats);
    frame = window.requestAnimationFrame(render);
  }

  frame = window.requestAnimationFrame(render);
  return {
    type: "webgl",
    getStats() {
      return { ...renderStats, camera: this.getCamera() };
    },
    getCamera() {
      return {
        position: { x: cameraPosition[0], y: cameraPosition[1], z: cameraPosition[2] },
        target: { x: cameraTarget[0], y: cameraTarget[1], z: cameraTarget[2] },
        fov: Math.max(20, Math.min(110, Number(projectCamera.fov) || 45))
      };
    },
    dispose() {
      disposed = true;
      window.cancelAnimationFrame(frame);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
      canvas.removeEventListener("wheel", onWheel);
      gl.deleteBuffer(grid.buffer);
      gl.deleteBuffer(axes.buffer);
      for (const mesh of objectMeshes) {
        gl.deleteBuffer(mesh.cube.buffer);
        gl.deleteBuffer(mesh.wire.buffer);
      }
      gl.deleteProgram(program);
    }
  };
}
