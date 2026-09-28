import { readFile, access } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const GROUPS = Object.freeze({
  build: ['nexusengine', 'three', 'esbuild'],
  test: ['nexusengine', 'three', 'esbuild', 'playwright'],
  full: ['nexusengine', 'three', 'esbuild', 'playwright', 'pngjs', 'gltf-validator', '@modelcontextprotocol/sdk'],
});
const json = async path => JSON.parse(await readFile(path, 'utf8'));
async function installedPackage(require, name) {
  const entry = require.resolve(name);
  let directory = dirname(entry);
  while (directory !== dirname(directory)) {
    try { const data = await json(join(directory, 'package.json')); if (data.name === name) return { entry, directory, data }; }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    directory = dirname(directory);
  }
  throw new Error(`No package manifest for ${name}.`);
}
export function validateLock(pkg, lock) {
  const problems = [];
  if (lock?.lockfileVersion !== 3 || !lock.packages?.['']) return ['A complete package-lock.json v3 is required.'];
  for (const group of ['dependencies', 'devDependencies', 'peerDependencies']) {
    const wanted = pkg[group] ?? {}, locked = lock.packages[''][group] ?? {};
    for (const key of new Set([...Object.keys(wanted), ...Object.keys(locked)])) {
      if (wanted[key] !== locked[key]) problems.push(`Lockfile ${group}.${key} differs from package.json.`);
    }
  }
  const pin = pkg.nexusEngineArtifact?.commit;
  if (!/^[0-9a-f]{40}$/.test(pin ?? '') || !pkg.dependencies?.nexusengine?.endsWith(`#${pin}`)
    || !lock.packages['node_modules/nexusengine']?.resolved?.endsWith(`#${pin}`)) problems.push('Core dependency and lockfile must resolve the exact declared commit.');
  return problems;
}
export async function inspectDependencies({ root, mode = 'build', exerciseBundler = true } = {}) {
  root = resolve(root ?? dirname(fileURLToPath(import.meta.url)), root ? '.' : '..');
  if (!GROUPS[mode]) throw new TypeError(`Unknown dependency profile ${mode}.`);
  const report = { schema: 'nexusengine-editor.dependencies/1', mode, status: 'failed', node: process.versions.node, checks: [], errors: [] };
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major < 22 || (major === 22 && minor < 16)) report.errors.push({ code: 'NODE_VERSION', message: 'Node 22.16 or newer is required.' });
  const pkg = await json(join(root, 'package.json'));
  let lock;
  try { lock = await json(join(root, 'package-lock.json')); }
  catch (error) { report.errors.push({ code: 'LOCK_MISSING', message: `A full checkout and its real lockfile are required: ${error.code ?? error.message}` }); }
  if (lock) for (const message of validateLock(pkg, lock)) report.errors.push({ code: 'LOCK_MISMATCH', message });
  const require = createRequire(join(root, 'package.json'));
  const packages = new Map();
  for (const name of GROUPS[mode]) {
    try {
      const installed = await installedPackage(require, name); packages.set(name, installed);
      const locked = lock?.packages?.[`node_modules/${name}`]?.version;
      const declared = pkg.dependencies?.[name] ?? pkg.devDependencies?.[name];
      const expected = locked ?? (/^\d+\.\d+\.\d+(?:-.+)?$/.test(declared ?? '') ? declared : null);
      if (!expected && name !== 'nexusengine') throw new Error('No exact locked version is available.');
      if (expected && installed.data.version !== expected) throw new Error(`Installed ${installed.data.version}; expected ${expected}.`);
      report.checks.push({ name, version: installed.data.version, status: 'passed' });
    } catch (error) { report.errors.push({ code: 'DEPENDENCY_UNAVAILABLE', name, message: error.message }); }
  }
  if (mode === 'full' && packages.has('nexusengine')) {
    const core = packages.get('nexusengine');
    const coreRequire = createRequire(join(core.directory, 'package.json'));
    for (const [name, version] of Object.entries(core.data.dependencies ?? {})) {
      try {
        const installed = await installedPackage(coreRequire, name);
        if (installed.data.version !== version) throw new Error(`Expected ${version}; got ${installed.data.version}.`);
        report.checks.push({ name, requiredBy: 'nexusengine', version, status: 'passed' });
      } catch (error) { report.errors.push({ code: 'CORE_DEPENDENCY_UNAVAILABLE', name, message: error.message }); }
    }
  }
  if (packages.has('three')) {
    for (const subpath of ['three/addons/controls/TransformControls.js', 'three/addons/controls/OrbitControls.js', 'three/addons/loaders/GLTFLoader.js']) {
      try { await access(require.resolve(subpath)); }
      catch (error) { report.errors.push({ code: 'INCOMPLETE_PACKAGE', name: subpath, message: error.message }); }
    }
  }
  if (exerciseBundler && packages.has('esbuild')) {
    try {
      const module = await import(pathToFileURL(packages.get('esbuild').entry).href);
      const api = module.default ?? module;
      const result = await api.transform('export const dependencyProbe = 1;', { loader: 'js', format: 'esm' });
      if (!result.code.includes('dependencyProbe')) throw new Error('Native bundler probe returned unexpected output.');
      report.checks.push({ name: 'esbuild-native-execution', status: 'passed' });
    } catch (error) { report.errors.push({ code: 'BUNDLER_EXECUTION_FAILED', message: error.message }); }
  }
  report.status = report.errors.length ? 'failed' : 'passed';
  report.nextAction = report.status === 'passed' ? 'Run the build and browser gate.'
    : 'Use a complete checkout, retain the committed lockfile, and run npm ci with npm/Git network access. Do not substitute versions or fake a bundle.';
  return report;
}
export async function requireDependencies(options) {
  const report = await inspectDependencies(options);
  if (report.status !== 'passed') throw Object.assign(new Error(report.errors.map(e => `${e.code}: ${e.name ?? ''} ${e.message}`).join('\n')), { code: 'EDITOR_DEPENDENCIES', report });
  return report;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const report = await inspectDependencies({ mode: process.argv[2] ?? 'build' });
  console.log(JSON.stringify(report, null, 2));
  if (report.status !== 'passed') process.exitCode = 1;
}
