import { describe, expect, it } from 'vitest';

import { sniffImage } from './image';

const JPEG = new Uint8Array([
  0xff, 0xd8, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x06, 0x00, 0x08, 0x00,
]);

function png(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(24);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  bytes.set([0x00, 0x00, 0x00, 0x0d], 8);
  bytes.set([0x49, 0x48, 0x44, 0x52], 12);
  new DataView(bytes.buffer).setUint32(16, width);
  new DataView(bytes.buffer).setUint32(20, height);
  return bytes;
}

function webp(chunk: string, payload: Uint8Array): Uint8Array {
  const bytes = new Uint8Array(16 + payload.length);
  bytes.set([0x52, 0x49, 0x46, 0x46], 0); // RIFF
  bytes.set([0x00, 0x00, 0x00, 0x00], 4); // size（探测不关心）
  bytes.set([0x57, 0x45, 0x42, 0x50], 8); // WEBP
  for (let i = 0; i < 4; i++) bytes[12 + i] = chunk.charCodeAt(i);
  bytes.set(payload, 16);
  return bytes;
}

describe('sniffImage 魔数与尺寸探测', () => {
  it('识别 JPEG 并读出宽高', () => {
    expect(sniffImage(JPEG)).toEqual({ mime: 'image/jpeg', width: 8, height: 6 });
  });

  it('识别 PNG 并读出宽高', () => {
    expect(sniffImage(png(320, 180))).toEqual({ mime: 'image/png', width: 320, height: 180 });
  });

  it('识别 WebP VP8X', () => {
    const bytes = new Uint8Array(30);
    bytes.set([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]);
    bytes.set([0x56, 0x50, 0x38, 0x58], 12); // 'VP8X'
    bytes[24] = 319 & 0xff;
    bytes[25] = (319 >> 8) & 0xff;
    bytes[26] = 0;
    bytes[27] = 179 & 0xff;
    bytes[28] = (179 >> 8) & 0xff;
    bytes[29] = 0;
    expect(sniffImage(bytes)).toEqual({ mime: 'image/webp', width: 320, height: 180 });
  });

  it('识别 WebP VP8（有损）', () => {
    const bytes = webp('VP8 ', new Uint8Array(18));
    // VP8 尺寸位于 26/28（小端 16 位，低 14 位有效）
    bytes[26] = 320 & 0xff;
    bytes[27] = (320 >> 8) & 0xff;
    bytes[28] = 180 & 0xff;
    bytes[29] = (180 >> 8) & 0xff;
    expect(sniffImage(bytes)).toEqual({ mime: 'image/webp', width: 320, height: 180 });
  });

  it('识别 WebP VP8L（无损）', () => {
    const bytes = webp('VP8L', new Uint8Array(18));
    // 字节 21..23 携带 14 位宽-1 + 14 位高-1
    const bits = 319 | (179 << 14);
    bytes[21] = bits & 0xff;
    bytes[22] = (bits >> 8) & 0xff;
    bytes[23] = (bits >> 16) & 0xff;
    expect(sniffImage(bytes)).toEqual({ mime: 'image/webp', width: 320, height: 180 });
  });

  it('未知内容返回 null', () => {
    expect(sniffImage(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]))).toBeNull();
  });

  it('过短字节返回 null', () => {
    expect(sniffImage(new Uint8Array([0xff, 0xd8]))).toBeNull();
  });
});
