const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function localExtraLength(offset, nameLength) {
  const base = offset + 30 + nameLength;
  let length = (64 - (base % 64)) % 64;
  if (length > 0 && length < 4) length += 64;
  return length;
}

export function createStoredZip(entries) {
  const locals = [],
    central = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8"),
      bytes = Buffer.from(entry.bytes),
      crc = crc32(bytes),
      extraLength = localExtraLength(offset, name.length),
      extra = Buffer.alloc(extraLength);
    if (extraLength) {
      extra.writeUInt16LE(0xffff, 0);
      extra.writeUInt16LE(extraLength - 4, 2);
    }
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0x21, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(bytes.length, 18);
    local.writeUInt32LE(bytes.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(extra.length, 28);
    const localOffset = offset,
      payload = Buffer.concat([local, name, extra, bytes]);
    locals.push(payload);
    offset += payload.length;

    const record = Buffer.alloc(46);
    record.writeUInt32LE(0x02014b50, 0);
    record.writeUInt16LE(20, 4);
    record.writeUInt16LE(20, 6);
    record.writeUInt16LE(0, 8);
    record.writeUInt16LE(0, 10);
    record.writeUInt16LE(0, 12);
    record.writeUInt16LE(0x21, 14);
    record.writeUInt32LE(crc, 16);
    record.writeUInt32LE(bytes.length, 20);
    record.writeUInt32LE(bytes.length, 24);
    record.writeUInt16LE(name.length, 28);
    record.writeUInt16LE(0, 30);
    record.writeUInt16LE(0, 32);
    record.writeUInt16LE(0, 34);
    record.writeUInt16LE(0, 36);
    record.writeUInt32LE(0, 38);
    record.writeUInt32LE(localOffset, 42);
    central.push(Buffer.concat([record, name]));
  }
  const directoryOffset = offset,
    directory = Buffer.concat(central);
  offset += directory.length;
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(directoryOffset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...locals, directory, end]);
}

export function readStoredZipEntries(bytes) {
  const input = Buffer.from(bytes),
    entries = [];
  let offset = 0;
  while (offset + 4 <= input.length && input.readUInt32LE(offset) === 0x04034b50) {
    if (offset + 30 > input.length) throw new Error("Truncated ZIP local header.");
    const compression = input.readUInt16LE(offset + 8),
      crc = input.readUInt32LE(offset + 14),
      size = input.readUInt32LE(offset + 18),
      nameLength = input.readUInt16LE(offset + 26),
      extraLength = input.readUInt16LE(offset + 28),
      nameStart = offset + 30,
      dataStart = nameStart + nameLength + extraLength,
      dataEnd = dataStart + size;
    if (compression !== 0) throw new Error("USDZ entry is compressed.");
    if (dataEnd > input.length) throw new Error("Truncated ZIP entry.");
    const name = input.subarray(nameStart, nameStart + nameLength).toString("utf8"),
      data = input.subarray(dataStart, dataEnd);
    if (crc32(data) !== crc) throw new Error(`CRC mismatch for ${name}.`);
    entries.push({ name, bytes: data, dataOffset: dataStart });
    offset = dataEnd;
  }
  return entries;
}
