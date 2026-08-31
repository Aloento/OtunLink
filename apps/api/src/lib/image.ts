// 图片魔数与尺寸探测（纯函数，可单测）。
// Worker 环境没有 DOM 与 node 的 image-size 依赖，此处仅做最小实现：
// 校验 JPEG/PNG/WebP 魔数，并从头部字节流解析出 decoded 尺寸。

export type SniffedImage = {
  mime: 'image/jpeg' | 'image/png' | 'image/webp';
  width: number;
  height: number;
};

function be32(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset]! << 24) |
      (bytes[offset + 1]! << 16) |
      (bytes[offset + 2]! << 8) |
      bytes[offset + 3]!) >>>
    0
  );
}

function be16(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset]! << 8) | bytes[offset + 1]!) >>> 0;
}

function le16(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset + 1]! << 8) | bytes[offset]!) >>> 0;
}

function le24(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset + 2]! << 16) | (bytes[offset + 1]! << 8) | bytes[offset]!) >>> 0;
}

function sniffJpeg(bytes: Uint8Array): { width: number; height: number } | null {
  // JPEG 以 FF D8 FF 开头；SOI 之后可能跟 FF 系列标记（APPn / COM / DQT / DRI...）。
  let offset = 2;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) return null;
    const marker = bytes[offset + 1]!;
    // 填充字节 0xFF
    if (marker === 0xff) {
      offset += 1;
      continue;
    }
    // 独立标记（无长度段）：SOF 之外的常见单字节标记
    const standalone = marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9);
    if (!standalone && offset + 4 <= bytes.length) {
      const len = be16(bytes, offset + 2);
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        // SOF0-SOF15（跳过 DHT/C8、JPG/CC）
        if (offset + 7 + 2 <= bytes.length) {
          const height = be16(bytes, offset + 5);
          const width = be16(bytes, offset + 7);
          if (width > 0 && height > 0) return { width, height };
        }
      }
      offset += 2 + len;
      continue;
    }
    offset += 2;
  }
  return null;
}

function sniffPng(bytes: Uint8Array): { width: number; height: number } | null {
  // 89 50 4E 47 0D 0A 1A 0A，随后 IHDR chunk 携带宽高。
  if (bytes.length < 24) return null;
  const width = be32(bytes, 16);
  const height = be32(bytes, 20);
  if (width > 0 && height > 0) return { width, height };
  return null;
}

function sniffWebp(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 30) return null;
  const chunk = String.fromCharCode(bytes[12]!, bytes[13]!, bytes[14]!, bytes[15]!);
  if (chunk === 'VP8X') {
    const width = le24(bytes, 24) + 1;
    const height = le24(bytes, 27) + 1;
    if (width > 0 && height > 0) return { width, height };
  }
  if (chunk === 'VP8 ') {
    const width = le16(bytes, 26) & 0x3fff;
    const height = le16(bytes, 28) & 0x3fff;
    if (width > 0 && height > 0) return { width, height };
  }
  if (chunk === 'VP8L') {
    // 14-bit 尺寸以小端存储在字节 21-25。
    const bits = (bytes[21]! | (bytes[22]! << 8) | (bytes[23]! << 16)) >>> 0;
    const width = (bits & 0x3fff) + 1;
    const height = ((bits >> 14) & 0x3fff) + 1;
    if (width > 0 && height > 0) return { width, height };
  }
  return null;
}

export function sniffImage(bytes: Uint8Array): SniffedImage | null {
  if (bytes.length < 12) return null;
  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    const dim = sniffJpeg(bytes);
    return dim ? { mime: 'image/jpeg', ...dim } : null;
  }
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    const dim = sniffPng(bytes);
    return dim ? { mime: 'image/png', ...dim } : null;
  }
  // WebP: RIFF .... WEBP
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    const dim = sniffWebp(bytes);
    return dim ? { mime: 'image/webp', ...dim } : null;
  }
  return null;
}
