// World News in One Frame — Tuesday, 24 November 2026
// Node 22 entrypoint (stdlib only) for make.fun competition news-image-20261124.
// Verifies image format, dimensions (<=1024x1024), and byte cap (<=1 MiB), then emits deterministic bytes.

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const MAX_BYTES = 1_048_576;
const MAX_DIMENSION = 1024;
const PNG_HEADER = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function crc32(data: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i += 1) {
    crc ^= data[i];
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 1) !== 0 ? (0xedb88320 ^ (crc >>> 1)) >>> 0 : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function readPngSize(raw: Buffer): { width: number; height: number } {
  if (raw.length < 33 || !raw.subarray(0, 8).equals(PNG_HEADER)) {
    throw new Error('Asset does not start with a valid PNG signature');
  }
  let pos = 8;
  let width = 0;
  let height = 0;
  let hasIhdr = false;
  let hasIdat = false;
  let hasIend = false;

  while (pos + 12 <= raw.length) {
    const chunkLen = raw.readUInt32BE(pos);
    const typeSlice = raw.subarray(pos + 4, pos + 8);
    const payloadEnd = pos + 8 + chunkLen;
    const nextPos = payloadEnd + 4;
    if (nextPos > raw.length) {
      throw new Error(`Truncated PNG chunk at offset ${pos}`);
    }
    const kind = typeSlice.toString('ascii');
    const recordedCrc = raw.readUInt32BE(payloadEnd);
    const computedCrc = crc32(raw.subarray(pos + 4, payloadEnd));
    if (recordedCrc !== computedCrc) {
      throw new Error(`CRC mismatch in PNG chunk ${kind}`);
    }
    if (!hasIhdr) {
      if (kind !== 'IHDR' || chunkLen !== 13) {
        throw new Error(`Expected IHDR first, found ${kind}`);
      }
      width = raw.readUInt32BE(pos + 8);
      height = raw.readUInt32BE(pos + 12);
      hasIhdr = true;
    } else if (kind === 'IDAT') {
      hasIdat = true;
    } else if (kind === 'IEND') {
      hasIend = true;
      pos = nextPos;
      break;
    }
    pos = nextPos;
  }

  if (!hasIhdr || !hasIdat || !hasIend || pos !== raw.length) {
    throw new Error('Malformed PNG chunk sequence');
  }
  return { width, height };
}

function main(): void {
  const rootDir = dirname(fileURLToPath(import.meta.url));
  const assetPath = join(rootDir, 'assets', 'world-news-2026-11-24.png');
  const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
  const targetPath = join(outDir, 'entry.png');

  const bytes = readFileSync(assetPath);
  if (bytes.length === 0 || bytes.length > MAX_BYTES) {
    throw new Error(`Image size ${bytes.length} exceeds 1..${MAX_BYTES} limit`);
  }
  const { width, height } = readPngSize(bytes);
  if (width < 1 || height < 1 || width > MAX_DIMENSION || height > MAX_DIMENSION) {
    throw new Error(`Image dimensions ${width}x${height} exceed ${MAX_DIMENSION}x${MAX_DIMENSION}`);
  }

  mkdirSync(outDir, { recursive: true });
  writeFileSync(targetPath, bytes);
  const expectedDigest = createHash('sha256').update(bytes).digest('hex');
  const actualDigest = createHash('sha256').update(readFileSync(targetPath)).digest('hex');
  if (expectedDigest !== actualDigest) {
    throw new Error(`Output integrity mismatch: ${expectedDigest} !== ${actualDigest}`);
  }
  process.stderr.write(
    `Wrote ${width}x${height} PNG (${bytes.length} bytes, sha256=${expectedDigest.slice(0, 12)}) to ${targetPath}\n`,
  );
}

main();
