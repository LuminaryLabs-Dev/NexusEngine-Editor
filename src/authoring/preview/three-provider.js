import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { TransformControls } from "three/addons/controls/TransformControls.js";
export function createAuthoringThreePreview({
  canvas,
  onSelect = () => {},
  onTransform = () => {},
}) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    preserveDrawingBuffer: true,
    alpha: false,
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene(),
    camera = new THREE.PerspectiveCamera(40, 1, 0.01, 10000),
    controls = new OrbitControls(camera, canvas),
    gizmo = new TransformControls(camera, canvas);
  scene.add(gizmo.getHelper());
  let content = null,
    mixer = null,
    animations = [],
    generation = 0,
    view = null,
    selected = null,
    disposed = false,
    playback = null;
  const textures = new Set(),
    lighting = new THREE.Group();
  scene.add(lighting);
  controls.enableDamping = false;
  controls.addEventListener("change", () => render());
  gizmo.addEventListener("change", () => render());
  gizmo.addEventListener(
    "dragging-changed",
    (event) => (controls.enabled = !event.value),
  );
  gizmo.addEventListener("mouseUp", () => {
    if (selected)
      onTransform({
        id: selected.userData.sourceNodeId,
        translation: selected.position.toArray(),
        rotation: selected.quaternion.toArray(),
        scale: selected.scale.toArray(),
      });
  });
  function clear() {
    gizmo.detach();
    selected = null;
    if (mixer && content) {
      mixer.stopAllAction();
      mixer.uncacheRoot(content);
    }
    if (content) {
      scene.remove(content);
      const geometries = new Set(),
        materials = new Set();
      content.traverse((object) => {
        if (object.geometry) geometries.add(object.geometry);
        for (const material of (Array.isArray(object.material)
          ? object.material
          : [object.material]
        ).filter(Boolean)) {
          materials.add(material);
          for (const value of Object.values(material))
            if (value?.isTexture) textures.add(value);
        }
        object.skeleton?.dispose?.();
      });
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
      textures.forEach((t) => {
        t.image?.close?.();
        t.dispose();
      });
      textures.clear();
    }
    content = null;
    mixer = null;
    animations = [];
  }
  function render() {
    if (disposed || !view) return;
    renderer.render(scene, camera);
  }
  function configure(next) {
    view = next;
    scene.background = new THREE.Color().fromArray(next.background);
    renderer.toneMappingExposure = next.exposure;
    renderer.setSize(next.width, next.height, false);
    camera.aspect = next.width / next.height;
    lighting.traverse((o) => o.shadow?.dispose());
    lighting.clear();
    for (const descriptor of next.lights) {
      const color = new THREE.Color().fromArray(descriptor.color),
        light =
          descriptor.kind === "ambient"
            ? new THREE.AmbientLight(color, descriptor.intensity)
            : new THREE.DirectionalLight(color, descriptor.intensity);
      if (descriptor.position) light.position.fromArray(descriptor.position);
      light.castShadow = descriptor.castsShadow;
      if (light.shadow) {
        light.shadow.mapSize.set(2048, 2048);
        light.shadow.camera.left = -10;
        light.shadow.camera.right = 10;
        light.shadow.camera.top = 10;
        light.shadow.camera.bottom = -10;
        light.shadow.bias = -0.0003;
      }
      lighting.add(light);
    }
    camera.updateProjectionMatrix();
  }
  function frame() {
    if (!content) return;
    const bounds = new THREE.Box3().setFromObject(content),
      center = bounds.getCenter(new THREE.Vector3()),
      size = bounds.getSize(new THREE.Vector3()),
      radius = Math.max(size.length() / 2, 0.1);
    if (view.camera) {
      camera.position.fromArray(view.camera.position);
      controls.target.fromArray(view.camera.target);
      camera.fov = THREE.MathUtils.radToDeg(view.camera.yfov ?? Math.PI / 4);
    } else {
      camera.position
        .copy(center)
        .add(
          new THREE.Vector3(1, 0.65, 1.35)
            .normalize()
            .multiplyScalar(radius * 3.1),
        );
      controls.target.copy(center);
    }
    camera.near = Math.max(radius / 1000, 0.001);
    camera.far = radius * 100;
    camera.updateProjectionMatrix();
    camera.lookAt(controls.target);
    controls.update();
    render();
  }
  async function load(url, nextView, { preserveCamera = false } = {}) {
    const token = ++generation;
    const gltf = await new GLTFLoader().loadAsync(url);
    if (disposed || token !== generation) {
      gltf.scene.traverse((o) => {
        o.geometry?.dispose();
        for (const m of (Array.isArray(o.material)
          ? o.material
          : [o.material]
        ).filter(Boolean)) {
          for (const value of Object.values(m))
            if (value?.isTexture) {
              value.image?.close?.();
              value.dispose();
            }
          m.dispose();
        }
        o.skeleton?.dispose?.();
      });
      return { stale: true };
    }
    clear();
    configure(nextView);
    content = gltf.scene;
    content.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    scene.add(content);
    content.updateMatrixWorld(true);
    mixer = new THREE.AnimationMixer(content);
    animations = gltf.animations;
    if (!preserveCamera) frame();
    else render();
    return { stale: false, statistics: inspect() };
  }
  function inspect() {
    const meshes = [];
    content?.traverse((o) => {
      if (o.isMesh)
        meshes.push({
          name: o.name,
          vertices: o.geometry.getAttribute("position")?.count ?? 0,
          skinned: Boolean(o.isSkinnedMesh),
          joints: o.skeleton?.bones.length ?? 0,
          morphs: o.morphTargetInfluences?.length ?? 0,
          materials: (Array.isArray(o.material)
            ? o.material
            : [o.material]
          ).map((m) => ({
            name: m.name,
            color: m.color?.toArray(),
            roughness: m.roughness,
            metalness: m.metalness,
            baseTexture: Boolean(m.map),
            normalTexture: Boolean(m.normalMap),
          })),
        });
    });
    return {
      meshes,
      animations: animations.map((a) => ({
        name: a.name,
        duration: a.duration,
        tracks: a.tracks.length,
      })),
      bounds: content
        ? new THREE.Box3()
            .setFromObject(content)
            .getSize(new THREE.Vector3())
            .toArray()
        : [0, 0, 0],
      renderer: renderer.info.render,
      memory: renderer.info.memory,
      camera: {
        position: camera.position.toArray(),
        target: controls.target.toArray(),
        yfov: THREE.MathUtils.degToRad(camera.fov),
      },
    };
  }
  const pointer = (event) => {
    if (gizmo.dragging || event.button !== 0 || !content) return;
    const rect = canvas.getBoundingClientRect(),
      raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(
      new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        (-(event.clientY - rect.top) / rect.height) * 2 + 1,
      ),
      camera,
    );
    const hit = raycaster
      .intersectObject(content, true)
      .find((hit) => hit.object.isMesh);
    if (hit) {
      let object = hit.object;
      while (object && !object.userData.sourceNodeId) object = object.parent;
      if (object) onSelect(object.userData.sourceNodeId);
    }
  };
  canvas.addEventListener("pointerdown", pointer);
  return {
    load,
    inspect,
    render,
    frame,
    clear() {
      this.stop();
      generation++;
      clear();
      render();
    },
    resize(width, height) {
      if (view) {
        view = { ...view, width, height };
        renderer.setSize(width, height, false);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        render();
      }
    },
    select(id) {
      if (!content) return;
      let target = null;
      content.traverse((o) => {
        if (o.userData.sourceNodeId === id && !o.isMesh) target ??= o;
      });
      selected = target;
      if (target) gizmo.attach(target);
      else gizmo.detach();
      render();
    },
    setMode: (mode) => gizmo.setMode(mode),
    sample(clipIndex, time) {
      if (!mixer || !animations[clipIndex])
        throw Error("Animation clip is unavailable.");
      mixer.stopAllAction();
      const action = mixer.clipAction(animations[clipIndex]);
      action.setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true;
      action.play();
      mixer.setTime(time);
      content.updateMatrixWorld(true);
      render();
      return inspect();
    },
    play(clipIndex = 0) {
      this.stop();
      if (!animations[clipIndex]) throw Error("Animation clip is unavailable.");
      const start = performance.now(),
        duration = animations[clipIndex].duration;
      const tick = () => {
        this.sample(
          clipIndex,
          ((performance.now() - start) / 1000) % Math.max(duration, 0.001),
        );
        playback = requestAnimationFrame(tick);
      };
      tick();
    },
    stop() {
      if (playback !== null) cancelAnimationFrame(playback);
      playback = null;
    },
    dispose() {
      if (disposed) return;
      this.stop();
      generation++;
      clear();
      controls.dispose();
      gizmo.dispose();
      canvas.removeEventListener("pointerdown", pointer);
      lighting.traverse((o) => o.shadow?.dispose());
      renderer.dispose();
      renderer.forceContextLoss();
      disposed = true;
    },
    get objects() {
      return content;
    },
  };
}
