import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { TransformControls } from "three/addons/controls/TransformControls.js";
/** Rendering is disposable derived state. No Three object becomes an Authoring document. */
export function createAuthoringThreePreview({ canvas, onSelect = () => {}, onTransform = () => {} }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio ?? 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(40, 1, .01, 10000);
  camera.position.set(4, 3, 6); camera.lookAt(0, 0, 0);
  const controls = new OrbitControls(camera, canvas), gizmo = new TransformControls(camera, canvas);
  const grid = new THREE.GridHelper(20, 20), lighting = new THREE.Group();
  scene.add(grid, lighting, gizmo.getHelper());
  scene.background = new THREE.Color(.035, .045, .065);
  let content = null, gameCamera = null, selected = null, mixer = null, animations = [], viewMode = "scene", generation = 0, disposed = false, animationFrame = null;
  let width = 1, height = 1, configuredCamera = null;
  function render() { if (!disposed) renderer.render(scene, viewMode === "game" && gameCamera ? gameCamera : camera); }
  function release(root) {
    if (!root) return;
    const geometries = new Set(), materials = new Set(), textures = new Set(), skeletons = new Set();
    root.traverse(o => {
      if (o.geometry) geometries.add(o.geometry);
      if (o.skeleton) skeletons.add(o.skeleton);
      for (const material of (Array.isArray(o.material) ? o.material : [o.material]).filter(Boolean)) {
        materials.add(material); Object.values(material).filter(v => v?.isTexture).forEach(v => textures.add(v));
      }
      o.shadow?.dispose?.();
    });
    textures.forEach(t => { t.image?.close?.(); t.dispose(); }); materials.forEach(m => m.dispose());
    geometries.forEach(g => g.dispose()); skeletons.forEach(s => s.dispose());
  }
  function stop() { if (animationFrame !== null) cancelAnimationFrame(animationFrame); animationFrame = null; }
  function clear() {
    stop(); gizmo.detach(); selected = null;
    if (mixer && content) { mixer.stopAllAction(); mixer.uncacheRoot(content); }
    if (content) { scene.remove(content); release(content); }
    content = null; gameCamera = null; mixer = null; animations = [];
  }
  function resize(w, h) {
    width = Math.max(1, w); height = Math.max(1, h); renderer.setSize(width, height, false);
    camera.aspect = width / height; camera.updateProjectionMatrix();
    if (gameCamera?.isPerspectiveCamera) { gameCamera.aspect = width / height; gameCamera.updateProjectionMatrix(); }
    render();
  }
  function configure(view) {
    configuredCamera = view.camera ?? null;
    scene.background.fromArray(view.background ?? [.035, .045, .065]); renderer.toneMappingExposure = view.exposure ?? 1;
    release(lighting); lighting.clear();
    for (const d of view.lights ?? []) {
      const color = new THREE.Color().fromArray(d.color);
      const light = d.kind === "ambient" ? new THREE.AmbientLight(color, d.intensity) : new THREE.DirectionalLight(color, d.intensity);
      if (d.position) light.position.fromArray(d.position);
      light.castShadow = Boolean(d.castsShadow); lighting.add(light);
    }
    resize(view.width ?? width, view.height ?? height);
  }
  function frame() {
    if (!content) return;
    const box = new THREE.Box3().setFromObject(content), center = box.getCenter(new THREE.Vector3());
    const radius = Math.max(box.getSize(new THREE.Vector3()).length() / 2, .1);
    camera.position.copy(center).add(new THREE.Vector3(1, .65, 1.35).normalize().multiplyScalar(radius * 3.1));
    controls.target.copy(center);
    if (configuredCamera) {
      camera.position.fromArray(configuredCamera.position);
      controls.target.fromArray(configuredCamera.target);
      camera.fov = THREE.MathUtils.radToDeg(configuredCamera.yfov ?? Math.PI / 4);
    }
    camera.near = Math.max(radius / 1000, .001); camera.far = Math.max(radius * 100, 100);
    camera.updateProjectionMatrix(); controls.update(); render();
  }
  async function load(url, view, { preserveCamera = false } = {}) {
    const token = ++generation;
    const gltf = await new GLTFLoader().loadAsync(url);
    if (disposed || token !== generation) { release(gltf.scene); return { stale: true }; }
    clear(); configure(view); content = gltf.scene; gameCamera = gltf.cameras?.[0] ?? null;
    content.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    scene.add(content); content.updateMatrixWorld(true); mixer = new THREE.AnimationMixer(content); animations = gltf.animations;
    resize(width, height); if (!preserveCamera) frame(); render(); return { stale: false, statistics: inspect() };
  }
  function select(id) {
    selected = null; content?.traverse(o => { if (o.userData.sourceNodeId === id) selected ??= o; });
    if (selected && viewMode === "scene") gizmo.attach(selected); else gizmo.detach(); render();
  }
  function setViewMode(mode = "scene") {
    if (!["scene", "game"].includes(mode)) throw new TypeError("Unknown viewport mode.");
    if (mode === "game" && !gameCamera) throw Object.assign(new Error("Add an authored camera before using Game View."), { code: "EDITOR_GAME_CAMERA_MISSING" });
    viewMode = mode; controls.enabled = mode === "scene"; grid.visible = mode === "scene"; lighting.visible = mode === "scene";
    if (mode === "game") gizmo.detach(); else if (selected) gizmo.attach(selected); render(); return mode;
  }
  function inspect() {
    const meshes = [];
    content?.traverse(o => { if (o.isMesh) meshes.push({ name: o.name, vertices: o.geometry.getAttribute("position")?.count ?? 0,
      triangles: (o.geometry.index?.count ?? o.geometry.getAttribute("position")?.count ?? 0) / 3,
      skinned: Boolean(o.isSkinnedMesh), joints: o.skeleton?.bones.length ?? 0, morphs: o.morphTargetInfluences?.length ?? 0,
      materials: (Array.isArray(o.material) ? o.material : [o.material]).map(m => ({ name: m.name, color: m.color?.toArray(), roughness: m.roughness, metalness: m.metalness, baseTexture: Boolean(m.map), normalTexture: Boolean(m.normalMap) })) }); });
    return { meshes, animations: animations.map(a => ({ name: a.name, duration: a.duration, tracks: a.tracks.length })),
      bounds: content ? new THREE.Box3().setFromObject(content).getSize(new THREE.Vector3()).toArray() : [0, 0, 0],
      renderer: { ...renderer.info.render }, memory: { ...renderer.info.memory }, viewMode, hasGameCamera: Boolean(gameCamera),
      camera: { position: camera.position.toArray(), target: controls.target.toArray(), yfov: THREE.MathUtils.degToRad(camera.fov) } };
  }
  function sample(index, time) {
    if (!mixer || !animations[index]) throw new Error("Animation clip is unavailable.");
    mixer.stopAllAction(); const action = mixer.clipAction(animations[index]); action.setLoop(THREE.LoopOnce, 1); action.clampWhenFinished = true; action.play(); mixer.setTime(time); content.updateMatrixWorld(true); render(); return inspect();
  }
  function pointer(e) {
    if (viewMode === "game" || gizmo.dragging || e.button !== 0 || !content) return;
    const rect = canvas.getBoundingClientRect(), ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(2 * (e.clientX - rect.left) / rect.width - 1, 1 - 2 * (e.clientY - rect.top) / rect.height), camera);
    let object = ray.intersectObject(content, true).find(x => x.object.isMesh)?.object;
    while (object && !object.userData.sourceNodeId) object = object.parent;
    if (object) onSelect(object.userData.sourceNodeId);
  }
  canvas.addEventListener("pointerdown", pointer);
  controls.addEventListener("change", render); gizmo.addEventListener("change", render);
  gizmo.addEventListener("dragging-changed", e => { controls.enabled = !e.value && viewMode === "scene"; });
  gizmo.addEventListener("mouseUp", () => { if (selected && viewMode === "scene") onTransform({ id: selected.userData.sourceNodeId, translation: selected.position.toArray(), rotation: selected.quaternion.toArray(), scale: selected.scale.toArray() }); });
  resize(canvas.clientWidth || 640, canvas.clientHeight || 480);
  return { load, inspect, render, frame, resize, select, sample, stop, setViewMode,
    updateTransforms(nodes) { const map = new Map(nodes.map(n => [n.id, n.transform])); content?.traverse(o => { const t = map.get(o.userData.sourceNodeId); if (t) { o.position.fromArray(t.translation); o.quaternion.fromArray(t.rotation); o.scale.fromArray(t.scale); } }); content?.updateMatrixWorld(true); render(); },
    clear() { generation++; clear(); viewMode = "scene"; grid.visible = true; lighting.visible = true; controls.enabled = true; render(); },
    setMode: mode => gizmo.setMode(mode),
    play(index = 0) { if (!animations[index]) throw new Error("Animation clip is unavailable."); stop(); const start = performance.now(); const run = () => { sample(index, ((performance.now() - start) / 1000) % Math.max(animations[index].duration, .001)); animationFrame = requestAnimationFrame(run); }; run(); },
    dispose() { if (disposed) return; generation++; clear(); controls.dispose(); gizmo.dispose(); release(grid); release(lighting); canvas.removeEventListener("pointerdown", pointer); renderer.dispose(); renderer.forceContextLoss(); disposed = true; },
    get objects() { return content; },
  };
}
