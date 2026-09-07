import { createAuthoringThreePreview } from "./three-provider.js";
const canvas = document.querySelector("#viewport"),
  provider = createAuthoringThreePreview({ canvas });
window.nexusAuthoringPreview = { provider, ready: false, error: null };
try {
  const state = await (await fetch("/state")).json();
  await provider.load("/preview.glb", {
    ...state.view,
    width: innerWidth,
    height: innerHeight,
  });
  window.nexusAuthoringPreview.ready = true;
} catch (error) {
  window.nexusAuthoringPreview.error = error.message;
  console.error(error);
}
window.addEventListener("resize", () =>
  provider.resize(innerWidth, innerHeight),
);
window.addEventListener("beforeunload", () => provider.dispose());
