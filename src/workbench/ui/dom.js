export function element(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key.startsWith("on") && typeof value === "function") el.addEventListener(key.slice(2), value);
    else if (key === "class") el.className = value;
    else if (key in el && ["value", "checked", "disabled", "multiple"].includes(key)) el[key] = value;
    else if (value !== undefined && value !== null) el.setAttribute(key, String(value));
  }
  for (const child of children.flat()) if (child !== undefined && child !== null) el.append(child?.nodeType ? child : document.createTextNode(String(child)));
  return el;
}
export function empty(el) { el.replaceChildren(); return el; }
export function presentBootError(error) {
  const target = document.querySelector("#statusbar") ?? document.body;
  target.replaceChildren(element("strong", { class: "error" }, `Editor could not start: ${error.message}`));
  target.dataset.bootError = error.code ?? error.name;
  console.error(error);
}
