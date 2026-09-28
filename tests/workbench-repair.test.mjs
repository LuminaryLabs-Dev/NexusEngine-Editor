import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, mkdir, symlink, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCommandQueue } from '../src/workbench/command-queue.js';
import { assertSourceCommandAllowed } from '../src/workbench/host-contract.js';
import { encodeWire, decodeWire } from '../src/workbench/adapters/binary-wire.js';
import { createBrowserWorkbenchHost } from '../src/workbench/browser-host.js';
import { createLocalWorkbenchSession } from '../src/workbench/adapters/local-session.js';
import { createSceneCommands } from '../src/workbench/scene-commands.js';
import { validateLock, inspectDependencies } from '../scripts/dependency-doctor.mjs';
import { fileRecord, stable, sha256, verifyArtifact, prepareStagingPath, verifyBrowserEvidence } from '../scripts/static-build-support.mjs';
const defer = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const open = () => createBrowserWorkbenchHost({ storage: 'memory', restore: false, preferences: null, projectKey: crypto.randomUUID() });

test('queued payload is a copy, including bytes, at submission time', async () => {
  const seen = [], hold = defer();
  const queue = createCommandQueue(async (method, params) => { if (method === 'wait') await hold.promise; else seen.push(params); });
  const first = queue.execute('wait');
  const input = { name: 'original', bytes: new Uint8Array([1, 2]) };
  const second = queue.execute('write', input); input.name = 'changed'; input.bytes[0] = 9;
  hold.resolve(); await Promise.all([first, second]);
  assert.equal(seen[0].name, 'original'); assert.deepEqual(seen[0].bytes, new Uint8Array([1, 2]));
});

test('queue closes immediately, drains accepted work, and disposes once', async () => {
  const hold = defer(); let cleaned = 0;
  const queue = createCommandQueue(() => hold.promise);
  const work = queue.execute('pending'), closing = queue.close(() => cleaned++);
  await assert.rejects(queue.execute('late'), { code: 'EDITOR_HOST_CLOSED' });
  assert.equal(queue.close(() => cleaned++), closing); assert.equal(cleaned, 0);
  hold.resolve(); await work; await closing; assert.equal(cleaned, 1);
});

test('queue capacity is bounded; failures do not poison later commands', async () => {
  const hold = defer(); const queue = createCommandQueue((method) => method === 'hold' ? hold.promise : Promise.reject(new Error('expected')), { maxPending: 1 });
  const first = queue.execute('hold'); await assert.rejects(queue.execute('overflow'), { code: 'EDITOR_QUEUE_FULL' });
  hold.resolve(); await first; await queue.idle();
  await assert.rejects(queue.execute('fail'), /expected/); await queue.idle(); assert.equal(queue.pending, 0);
});

test('cancelled queued commands do not execute; functions cannot enter payloads', async () => {
  const controller = new AbortController(); controller.abort(); let calls = 0;
  const queue = createCommandQueue(() => calls++);
  await assert.rejects(queue.execute('write', { signal: controller.signal }), { code: 'EDITOR_CANCELLED' });
  await assert.rejects(queue.execute('write', { fn() {} }), { code: 'EDITOR_COMMAND_INPUT' });
  assert.equal(calls, 0);
});

test('both transports protect accept, project replacement and composition setup during Play', () => {
  for (const method of ['accept', 'new-project', 'open-project', 'composition-ensure', 'execute']) {
    for (const state of ['starting', 'playing', 'paused', 'failed']) assert.throws(() => assertSourceCommandAllowed(method, state), { code: 'EDITOR_SOURCE_PROTECTED' });
    assert.doesNotThrow(() => assertSourceCommandAllowed(method, 'stopped'));
  }
  assert.doesNotThrow(() => assertSourceCommandAllowed('play-frame', 'playing'));
});

test('binary decode rejects underreported payload before decoding', () => {
  const old = globalThis.atob; let decoded = false;
  globalThis.atob = () => { decoded = true; throw new Error('must not decode'); };
  try { assert.throws(() => decodeWire({ $editorBytes: 'base64/1', length: 0, data: 'AAAA' }), { code: 'EDITOR_WIRE_BYTES' }); }
  finally { globalThis.atob = old; }
  assert.equal(decoded, false);
});

test('binary transport enforces combined bytes, structural budgets and cycle rejection', () => {
  assert.throws(() => encodeWire([new Uint8Array(3), new Uint8Array(3)], { maxBytes: 5 }), { code: 'EDITOR_WIRE_BUDGET' });
  assert.throws(() => decodeWire(encodeWire([new Uint8Array(3), new Uint8Array(3)]), { maxBytes: 5 }), { code: 'EDITOR_WIRE_BUDGET' });
  assert.throws(() => encodeWire({ a: { b: { c: 1 } } }, { maxDepth: 2 }), { code: 'EDITOR_WIRE_BUDGET' });
  assert.throws(() => decodeWire([1, 2, 3], { maxNodes: 2 }), { code: 'EDITOR_WIRE_BUDGET' });
  const cycle = {}; cycle.next = cycle;
  assert.throws(() => encodeWire(cycle), { code: 'EDITOR_WIRE_CYCLE' });
});

test('wire data is canonical and preserves identical references without permitting reserved envelopes', () => {
  assert.throws(() => decodeWire({ $editorBytes: 'base64/1', length: 1, data: 'AB==' }), { code: 'EDITOR_WIRE_BYTES' });
  assert.throws(() => encodeWire({ $editorBytes: 'arbitrary' }), { code: 'EDITOR_WIRE_BYTES' });
  assert.throws(() => encodeWire(NaN), { code: 'EDITOR_WIRE_VALUE' });
  const child = { a: 1 }; assert.deepEqual(decodeWire(encodeWire([child, child])), [child, child]);
});

test('real browser host rejects new/open/accepted-preview commands while Play protects source', async () => {
  const host = await open();
  try {
    const id = await createSceneCommands(host).createPrimitive('box'); const before = host.project.getSnapshot();
    await host.execute('play', { controlledNodeId: id, autoTick: false });
    for (const method of ['accept', 'new-project', 'open-project', 'composition-ensure']) await assert.rejects(host.execute(method, { key: 'ignored' }), { code: 'EDITOR_SOURCE_PROTECTED' });
    await host.execute('stop'); assert.deepEqual(host.project.getSnapshot(), before);
  } finally { await host.dispose(); }
});

test('new project refuses an existing saved key without destroying active source', async () => {
  const host = await open();
  try {
    await createSceneCommands(host).createPrimitive('box'); await host.save();
    const before = host.project.getSnapshot(), key = host.state().status.projectKey;
    await assert.rejects(host.newProject(key), { code: 'EDITOR_PROJECT_EXISTS' });
    assert.deepEqual(host.project.getSnapshot(), before); assert.equal(host.state().status.projectKey, key);
  } finally { await host.dispose(); }
});

test('real host disposal rejects commands submitted during shutdown', async () => {
  const host = await open();
  const closing = host.dispose();
  await assert.rejects(host.execute('create', { requestId: 'late', kind: 'mesh', id: 'late', primitive: 'box' }), { code: 'EDITOR_HOST_CLOSED' });
  await closing; assert.throws(() => host.state(), { code: 'EDITOR_HOST_CLOSED' });
});

test('pause publishes neutral input into the installed Core Input resource', async () => {
  const host = await open();
  try {
    await host.execute('create-validation-game'); await host.execute('play', { autoTick: false });
    await host.execute('play-input', { x: 1, y: 1 });
    assert.equal(host.workbench.play.runtime.n.input.getState().intent.x, 1);
    await host.execute('pause');
    const intent = host.workbench.play.runtime.n.input.getState().intent;
    assert.equal(intent.x, 0); assert.equal(intent.y, 0);
    await host.execute('play-input', { x: 1, y: -1 });
    assert.equal(host.workbench.play.runtime.n.input.getState().intent.x, 0, 'Paused input cannot leak into resume');
    await host.execute('stop');
  } finally { await host.dispose(); }
});

test('local session also blocks accepted previews using the shared source guard', async () => {
  const browser = await open(); const project = browser.project; let accepted = false;
  const host = { engine: browser.engine, requestId: () => crypto.randomUUID(), status: () => ({ context: project.context() }),
    list: k => project.listDocuments(k), read: id => project.getDocument(id), snapshot: () => project.getSnapshot(),
    command: r => project.execute(r), accept: () => { accepted = true; } };
  const local = createLocalWorkbenchSession(host);
  try {
    await local.execute('play', { autoTick: false });
    await assert.rejects(local.execute('accept', {}), { code: 'EDITOR_SOURCE_PROTECTED' });
    assert.equal(accepted, false); await local.execute('stop');
  } finally { await local.dispose(); await browser.dispose(); }
});

async function withTemp(action) { const root = await mkdtemp(join(tmpdir(), 'editor-repair-')); try { return await action(root); } finally { await rm(root, { recursive: true, force: true }); } }
async function syntheticArtifact(root) {
  const paths = ['index.html', 'editor.js', 'editor.css', '.nojekyll'];
  for (const path of paths) await writeFile(join(root, path), path);
  const files = await Promise.all(paths.map(path => fileRecord(root, path)));
  const deployment = { schema: 'nexusengine-editor.deployment/3', files, artifactFingerprint: sha256(stable(files)),
    sourceFingerprint: 'synthetic-test-source', coreCommit: 'synthetic-test-core' };
  await writeFile(join(root, 'deployment.json'), stable(deployment)); return deployment;
}

test('staging rejects source, dependency and repository-root paths before deletion', () => withTemp(async root => {
  for (const path of ['.', 'src', 'tests', 'node_modules', '../outside']) await assert.rejects(prepareStagingPath(root, path), /staging/);
  assert.equal(await prepareStagingPath(root), join(root, 'dist'));
  assert.equal(await prepareStagingPath(root, '.build/retest'), join(root, '.build/retest'));
}));

test('staging and manifest reads reject symlinks', () => withTemp(async root => {
  await mkdir(join(root, 'safe')); await symlink(join(root, 'safe'), join(root, 'dist'));
  await assert.rejects(prepareStagingPath(root), /symlink/);
  await syntheticArtifact(root); await rm(join(root, 'editor.js')); await writeFile(join(root, 'external.js'), 'editor.js');
  await symlink(join(root, 'external.js'), join(root, 'editor.js'));
  await assert.rejects(verifyArtifact(root), /symlink/);
}));

test('strict staging verification rejects unmanifested executable content', () => withTemp(async root => {
  await syntheticArtifact(root); await writeFile(join(root, 'stray.js'), 'unmanifested');
  await verifyArtifact(root); await assert.rejects(verifyArtifact(root, { strict: true }), /Unmanifested/);
}));

test('release proof binds metadata as well as artifact bytes and rejects skipped checks', () => withTemp(async root => {
  const deployment = await syntheticArtifact(root);
  const proof = { status: 'passed', artifactFingerprint: deployment.artifactFingerprint,
    deploymentHash: sha256(await readFile(join(root, 'deployment.json'))), sourceFingerprint: deployment.sourceFingerprint,
    coreCommit: deployment.coreCommit, checks: [{ name: 'synthetic guard check', status: 'passed' }], errors: [] };
  await verifyBrowserEvidence(root, deployment, proof);
  await assert.rejects(verifyBrowserEvidence(root, deployment, { ...proof, checks: [{ status: 'skipped' }] }), /Browser proof/);
  await writeFile(join(root, 'deployment.json'), stable({ ...deployment, coreCommit: 'modified' }));
  await assert.rejects(verifyBrowserEvidence(root, deployment, proof), /Browser proof/);
}));

test('dependency doctor rejects missing or stale lockfiles instead of relaxing versions', () => {
  const pin = 'a'.repeat(40), spec = `git+https://github.com/LuminaryLabs-Dev/NexusEngine.git#${pin}`;
  const pkg = { nexusEngineArtifact: { commit: pin }, dependencies: { nexusengine: spec, esbuild: '0.25.10' } };
  const lock = { lockfileVersion: 3, packages: { '': { dependencies: { ...pkg.dependencies } }, 'node_modules/nexusengine': { resolved: spec } } };
  assert.deepEqual(validateLock(pkg, lock), []);
  lock.packages[''].dependencies.esbuild = '0.25.9'; assert.ok(validateLock(pkg, lock).some(s => s.includes('esbuild')));
  assert.ok(validateLock(pkg, null).length);
});

test('dependency doctor reports actual missing dependencies in an empty checkout', () => withTemp(async root => {
  await writeFile(join(root, 'package.json'), JSON.stringify({ name: 'missing-dependency-fixture', dependencies: { esbuild: '0.25.10', three: '0.180.0' } }));
  const report = await inspectDependencies({ root, exerciseBundler: false });
  assert.equal(report.status, 'failed'); assert.ok(report.errors.some(e => e.code === 'LOCK_MISSING'));
  assert.ok(report.errors.some(e => e.name === 'esbuild'));
}));
