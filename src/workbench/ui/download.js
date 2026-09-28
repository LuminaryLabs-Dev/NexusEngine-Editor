import { assertBytes, cleanRelativePath } from "../host-contract.js";
const utf8 = new TextEncoder();
const table = Uint32Array.from({ length: 256 }, (_, n) => { for (let k = 0; k < 8; k++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1; return n >>> 0; });
function crc32(bytes) { let crc = 0xffffffff; for (const b of bytes) crc = table[(crc ^ b) & 255] ^ (crc >>> 8); return (crc ^ 0xffffffff) >>> 0; }
/** Transport archive only: Core still owns every encoded asset and texture byte. */
export function artifactDownload(artifact) {
  const name = cleanRelativePath(artifact.fileName), resources = artifact.resources ?? {};
  if (!Object.keys(resources).length) return { name, bytes: assertBytes(artifact.bytes), type: artifact.format === "glb" ? "model/gltf-binary" : artifact.format === "usdz" ? "model/vnd.usdz+zip" : "application/octet-stream" };
  const entries = [[name, artifact.bytes], ...Object.entries(resources)], seen = new Set(), locals = [], central = [];
  if (entries.length > 4096) throw new Error("Too many export resources.");
  let offset = 0, total = 0;
  for (const [path, input] of entries) {
    cleanRelativePath(path); if (seen.has(path)) throw new Error("Duplicate export resource path."); seen.add(path);
    const filename = utf8.encode(path), bytes = assertBytes(input);
    if (filename.length > 65535 || (total += bytes.length) > 256 * 1024 * 1024) throw new Error("Export resource bundle exceeds its budget.");
    const local = new Uint8Array(30 + filename.length), l = new DataView(local.buffer), crc = crc32(bytes);
    l.setUint32(0, 0x04034b50, true); l.setUint16(4, 20, true); l.setUint16(6, 0x800, true); l.setUint16(12, 0x21, true);
    l.setUint32(14, crc, true); l.setUint32(18, bytes.length, true); l.setUint32(22, bytes.length, true); l.setUint16(26, filename.length, true); local.set(filename, 30);
    const c = new Uint8Array(46 + filename.length), d = new DataView(c.buffer);
    d.setUint32(0, 0x02014b50, true); d.setUint16(4, 20, true); d.setUint16(6, 20, true); d.setUint16(8, 0x800, true); d.setUint16(14, 0x21, true);
    d.setUint32(16, crc, true); d.setUint32(20, bytes.length, true); d.setUint32(24, bytes.length, true); d.setUint16(28, filename.length, true); d.setUint32(42, offset, true); c.set(filename, 46);
    locals.push(local, bytes); central.push(c); offset += local.length + bytes.length;
  }
  const size = central.reduce((n, b) => n + b.length, 0), end = new Uint8Array(22), d = new DataView(end.buffer);
  d.setUint32(0, 0x06054b50, true); d.setUint16(8, entries.length, true); d.setUint16(10, entries.length, true); d.setUint32(12, size, true); d.setUint32(16, offset, true);
  const output = new Uint8Array(offset + size + end.length); let at = 0;
  for (const part of [...locals, ...central, end]) { output.set(part, at); at += part.length; }
  return { name: name.replace(/\.[^.]+$/, "") + ".zip", bytes: output, type: "application/zip" };
}
export function triggerDownload(file) {
  const url = URL.createObjectURL(new Blob([file.bytes], { type: file.type }));
  const link = document.createElement("a"); link.href = url; link.download = file.name; document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
