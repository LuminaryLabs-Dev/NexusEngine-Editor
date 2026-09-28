/** Shared shell for static Pages and the local server; no second HTML/CSS application. */
export function workbenchHtml({ script = "./editor.js", stylesheet = "./editor.css", favicon = "./editor-assets/favicon.svg" } = {}) {
  const escape = x => String(x).replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>NexusEngine Editor</title><link rel="icon" href="${escape(favicon)}"><link rel="stylesheet" href="${escape(stylesheet)}"></head>
<body><div class="app"><header id="menus" class="row"></header><nav id="toolbar" class="row" aria-label="Editor tools"></nav>
<div class="main"><section class="panel"><div class="panel-title">OUTLINER</div><div id="outliner-list" class="scroll"></div></section>
<main class="viewport-wrap"><canvas id="viewport" tabindex="0" aria-label="NexusEngine scene viewport"></canvas><div id="viewport-label" class="viewport-label">SCENE VIEW</div></main>
<section class="panel right"><div class="panel-title">INSPECTOR</div><div id="inspector-body" class="inspector"></div></section>
<section class="bottom"><nav id="bottom-tabs" class="tabs" aria-label="Workbench panels">${["assets","domains","kits","validation","composition","runtime","build","console"].map(tab => `<button data-tab="${tab}">${tab[0].toUpperCase()+tab.slice(1)}</button>`).join("")}</nav><div id="bottom-content"></div></section></div>
<footer id="statusbar" class="status" role="status" aria-live="polite">Starting Core workbench…</footer></div>
<dialog id="command-palette"><form method="dialog"><label>Command<input id="command-input" autofocus autocomplete="off" placeholder="Create cube, save, play, export glb…"></label><button value="cancel">Cancel</button></form></dialog>
<script type="module" src="${escape(script)}"></script></body></html>\n`;
}
