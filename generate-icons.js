/**
 * ConnectFlow - Monochrome Developer Icon Generator
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const CRC_TABLE = new Int32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
  }
  CRC_TABLE[i] = c;
}

function crc32(buf) {
  let crc = -1;
  for (let i = 0; i < buf.length; i++) {
    crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ -1) >>> 0;
}

function createChunk(type, data) {
  const len = data.length;
  const chunk = Buffer.alloc(4 + 4 + len + 4);
  chunk.writeUInt32BE(len, 0);
  chunk.write(type, 4, 4, 'ascii');
  data.copy(chunk, 8);
  const crcBuf = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const c = crc32(crcBuf);
  chunk.writeUInt32BE(c, 8 + len);
  return chunk;
}

function createPng(width, height, drawFn) {
  const signature = Buffer.from([139, 80, 78, 71, 13, 10, 26, 10]);

  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData.writeUInt8(8, 8);
  ihdrData.writeUInt8(6, 9);
  ihdrData.writeUInt8(0, 10);
  ihdrData.writeUInt8(0, 11);
  ihdrData.writeUInt8(0, 12);
  const ihdrChunk = createChunk('IHDR', ihdrData);

  const rawData = Buffer.alloc(height * (1 + width * 4));
  let offset = 0;

  for (let y = 0; y < height; y++) {
    rawData[offset++] = 0;
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = drawFn(x, y, width, height);
      rawData[offset++] = Math.max(0, Math.min(255, Math.round(r)));
      rawData[offset++] = Math.max(0, Math.min(255, Math.round(g)));
      rawData[offset++] = Math.max(0, Math.min(255, Math.round(b)));
      rawData[offset++] = Math.max(0, Math.min(255, Math.round(a)));
    }
  }

  const idatCompressed = zlib.deflateSync(rawData);
  const idatChunk = createChunk('IDAT', idatCompressed);
  const iendChunk = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

/**
 * Pure Black & White Developer Tool Icon
 */
function drawMonochromeIcon(x, y, width, height) {
  const nx = x / width;
  const ny = y / height;
  const cx = 0.5;
  const cy = 0.5;
  const radius = 0.46;
  const cornerRadius = 0.16;

  const dx = Math.abs(nx - cx) - (radius - cornerRadius);
  const dy = Math.abs(ny - cy) - (radius - cornerRadius);
  const distInside = Math.min(Math.max(dx, dy), 0);
  const distOutside = Math.sqrt(Math.max(dx, 0) ** 2 + Math.max(dy, 0) ** 2);
  const dist = distInside + distOutside - cornerRadius;

  const pixelSize = 1.0 / width;
  const alphaSquircle = 1.0 - Math.min(Math.max(dist / pixelSize, 0), 1.0);

  if (alphaSquircle <= 0.01) {
    return [0, 0, 0, 0];
  }

  // Base background: Pure Black #000000
  let r = 0;
  let g = 0;
  let b = 0;

  // Thin outer border #333333
  if (dist > -0.04 && dist <= 0) {
    r = 50;
    g = 50;
    b = 50;
  }

  // Pure White geometric nodes
  const node1X = 0.35;
  const node1Y = 0.5;
  const node2X = 0.65;
  const node2Y = 0.5;
  const nodeRadius = 0.13;

  const d1 = Math.sqrt((nx - node1X) ** 2 + (ny - node1Y) ** 2);
  const d2 = Math.sqrt((nx - node2X) ** 2 + (ny - node2Y) ** 2);

  const inLineX = nx >= node1X && nx <= node2X;
  const dLine = Math.abs(ny - 0.5);
  const inLine = inLineX && dLine <= 0.035;

  if (d1 <= nodeRadius || d2 <= nodeRadius || inLine) {
    r = 255;
    g = 255;
    b = 255;
  }

  return [r, g, b, alphaSquircle * 255];
}

const SIZES = [16, 32, 48, 128];
const iconsDir = path.join(__dirname, 'assets', 'icons');

if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

SIZES.forEach(size => {
  const pngBuffer = createPng(size, size, drawMonochromeIcon);
  const filePath = path.join(iconsDir, `icon-${size}.png`);
  fs.writeFileSync(filePath, pngBuffer);
  console.log(`Generated monochrome ${filePath} (${size}x${size})`);
});
