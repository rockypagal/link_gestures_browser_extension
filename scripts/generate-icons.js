const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// CRC32 implementation for PNG chunks
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
  }
  crcTable[n] = c;
}

function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    c = crcTable[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  }
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function createChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);

  const crcTarget = Buffer.concat([typeBuf, data]);
  const crcVal = crc32(crcTarget);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crcVal, 0);

  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function createPng(width, height, rgbaBuffer) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // bit depth
  ihdrData[9] = 6; // color type: 6 = RGBA
  ihdrData[10] = 0; // compression
  ihdrData[11] = 0; // filter
  ihdrData[12] = 0; // interlace
  const ihdrChunk = createChunk('IHDR', ihdrData);

  // Scanlines with filter byte 0x00 at start of each row
  const scanlineLength = width * 4;
  const filteredData = Buffer.alloc(height * (scanlineLength + 1));

  for (let y = 0; y < height; y++) {
    const rowStartFiltered = y * (scanlineLength + 1);
    filteredData[rowStartFiltered] = 0; // No filter
    const rowStartRgba = y * scanlineLength;
    rgbaBuffer.copy(filteredData, rowStartFiltered + 1, rowStartRgba, rowStartRgba + scanlineLength);
  }

  const compressedData = zlib.deflateSync(filteredData, { level: 9 });
  const idatChunk = createChunk('IDAT', compressedData);
  const iendChunk = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

// Generate icon image data
// Design: Modern vibrant blue/indigo gradient rounded squircle with a link tab symbol & gesture pulse ring
function generateIconImage(size) {
  const buffer = Buffer.alloc(size * size * 4);

  function setPixel(x, y, r, g, b, a) {
    if (x < 0 || x >= size || y < 0 || y >= size) return;
    const idx = (y * size + x) * 4;
    // Alpha blending with existing pixel
    const prevA = buffer[idx + 3] / 255;
    const curA = a / 255;
    const outA = curA + prevA * (1 - curA);
    if (outA <= 0) return;
    
    buffer[idx] = Math.round((r * curA + buffer[idx] * prevA * (1 - curA)) / outA);
    buffer[idx + 1] = Math.round((g * curA + buffer[idx + 1] * prevA * (1 - curA)) / outA);
    buffer[idx + 2] = Math.round((b * curA + buffer[idx + 2] * prevA * (1 - curA)) / outA);
    buffer[idx + 3] = Math.round(outA * 255);
  }

  const center = size / 2;
  const radius = size * 0.44;
  const cornerRadius = size * 0.22;

  // Background rounded rectangle
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = Math.abs(x - center + 0.5);
      const dy = Math.abs(y - center + 0.5);
      const halfW = radius;
      const halfH = radius;
      
      const qx = dx - (halfW - cornerRadius);
      const qy = dy - (halfH - cornerRadius);
      let dist = 0;
      if (qx > 0 && qy > 0) {
        dist = Math.hypot(qx, qy) - cornerRadius;
      } else {
        dist = Math.max(dx - halfW, dy - halfH);
      }

      if (dist <= 0) {
        // Linear gradient from cyan (#00D2FF) at top-left to indigo (#3A7BD5) at bottom-right
        const factor = (x + y) / (size * 2);
        const r = Math.round(30 + (10 - 30) * factor);
        const g = Math.round(144 + (100 - 144) * factor);
        const b = Math.round(255 + (220 - 255) * factor);
        setPixel(x, y, r, g, b, 255);
      } else if (dist < 1) {
        // Anti-aliased edge
        const alpha = Math.round((1 - dist) * 255);
        setPixel(x, y, 20, 120, 240, alpha);
      }
    }
  }

  // Draw two overlapping browser tab cards / link card inside
  // Main tab: white / light card
  const tabW = size * 0.52;
  const tabH = size * 0.42;
  const tabX = size * 0.24;
  const tabY = size * 0.32;
  const tabR = Math.max(1, size * 0.08);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const cx = tabX + tabW / 2;
      const cy = tabY + tabH / 2;
      const dx = Math.abs(x - cx + 0.5);
      const dy = Math.abs(y - cy + 0.5);
      const qx = dx - (tabW / 2 - tabR);
      const qy = dy - (tabH / 2 - tabR);
      let dist = (qx > 0 && qy > 0) ? Math.hypot(qx, qy) - tabR : Math.max(dx - tabW / 2, dy - tabH / 2);

      if (dist <= 0) {
        setPixel(x, y, 255, 255, 255, 250);
      } else if (dist < 1) {
        setPixel(x, y, 255, 255, 255, Math.round((1 - dist) * 250));
      }
    }
  }

  // Tab top bar / notch inside the white card
  const barYEnd = tabY + Math.max(2, tabH * 0.28);
  for (let y = Math.floor(tabY); y <= Math.ceil(barYEnd); y++) {
    for (let x = Math.floor(tabX); x <= Math.ceil(tabX + tabW); x++) {
      const idx = (y * size + x) * 4;
      if (buffer[idx + 3] > 200) {
        setPixel(x, y, 210, 230, 255, 255);
      }
    }
  }

  // Pulse gesture ring / plus symbol at top-right indicating "New Tab hold gesture"
  const pulseX = size * 0.74;
  const pulseY = size * 0.26;
  const pulseR = size * 0.19;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x - pulseX + 0.5, y - pulseY + 0.5);
      if (d <= pulseR) {
        // Emerald / Teal badge (#10B981)
        setPixel(x, y, 16, 185, 129, 255);
      } else if (d < pulseR + 1) {
        setPixel(x, y, 16, 185, 129, Math.round((pulseR + 1 - d) * 255));
      }
    }
  }

  // White '+' symbol inside the pulse circle
  const plusLen = Math.max(1, Math.round(pulseR * 0.65));
  const plusThick = Math.max(1, Math.round(size * 0.04));
  for (let dy = -plusLen; dy <= plusLen; dy++) {
    for (let dx = -Math.floor(plusThick / 2); dx <= Math.floor(plusThick / 2); dx++) {
      setPixel(Math.round(pulseX + dx), Math.round(pulseY + dy), 255, 255, 255, 255);
    }
  }
  for (let dx = -plusLen; dx <= plusLen; dx++) {
    for (let dy = -Math.floor(plusThick / 2); dy <= Math.floor(plusThick / 2); dy++) {
      setPixel(Math.round(pulseX + dx), Math.round(pulseY + dy), 255, 255, 255, 255);
    }
  }

  return buffer;
}

const iconsDir = path.join(__dirname, '..', 'icons');
fs.mkdirSync(iconsDir, { recursive: true });

const sizes = [16, 48, 128];
for (const size of sizes) {
  const rgba = generateIconImage(size);
  const pngBuffer = createPng(size, size, rgba);
  const outPath = path.join(iconsDir, `icon-${size}.png`);
  fs.writeFileSync(outPath, pngBuffer);
  console.log(`Generated ${outPath} (${size}x${size}, ${pngBuffer.length} bytes)`);
}
