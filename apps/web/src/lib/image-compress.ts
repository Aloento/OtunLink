// 图片压缩工具（ck-04 §8.1）：
// - 纯函数（computeTargetDimensions / suggestJpegQuality）不依赖 DOM，可单测；
// - DOM 部分（compressImageFile / makeThumbnailBlob）在浏览器中用 Canvas 压缩，
//   最长边 ≤ maxEdge，JPEG 质量自适应到 ≤ maxBytes，缩略图固定 320px。

export interface ImageSize {
  width: number;
  height: number;
}

export interface CompressOptions {
  /** 展示图最长边像素（默认 1600）。 */
  maxEdge?: number;
  /** 展示图目标字节上限（默认 2MB）。 */
  maxBytes?: number;
  /** 起始 JPEG 质量（默认 0.92）。 */
  qualityStart?: number;
  /** 最低 JPEG 质量（默认 0.5）。 */
  qualityFloor?: number;
  /** 输出 MIME（默认 image/jpeg）。 */
  mimeType?: string;
}

export interface CompressedImage {
  blob: Blob;
  width: number;
  height: number;
}

export const DEFAULT_MAX_EDGE = 1600;
export const DEFAULT_MAX_BYTES = 2 * 1024 * 1024;
export const THUMBNAIL_MAX_EDGE = 320;
const QUALITY_START = 0.92;
const QUALITY_FLOOR = 0.5;

/** 按最长边缩放，返回正整数像素尺寸；无需缩放时返回原尺寸。 */
export function computeTargetDimensions(
  width: number,
  height: number,
  maxEdge: number = DEFAULT_MAX_EDGE,
): ImageSize {
  if (width <= 0 || height <= 0) {
    return { width: Math.max(1, Math.round(width)), height: Math.max(1, Math.round(height)) };
  }
  const longest = Math.max(width, height);
  if (longest <= maxEdge) {
    return { width: Math.round(width), height: Math.round(height) };
  }
  const scale = maxEdge / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/**
 * 依据原始字节数估算起始 JPEG 质量（纯启发式，用于减少压缩迭代次数）。
 * 输出被限制在 [qualityFloor, qualityStart] 区间。
 */
export function suggestJpegQuality(
  byteLength: number,
  targetBytes: number = DEFAULT_MAX_BYTES,
  qualityStart: number = QUALITY_START,
  qualityFloor: number = QUALITY_FLOOR,
): number {
  if (byteLength <= 0 || byteLength <= targetBytes) return qualityStart;
  const ratio = targetBytes / byteLength;
  // 经验公式：质量与体积近似平方关系，取 sqrt(ratio) 并略微保守。
  const q = qualityStart * Math.sqrt(ratio);
  return Math.min(qualityStart, Math.max(qualityFloor, q));
}

function loadImageElement(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('IMAGE_LOAD_FAILED'));
    img.src = url;
  });
}

function drawScaled(
  img: HTMLImageElement,
  targetWidth: number,
  targetHeight: number,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('CANVAS_UNSUPPORTED');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
  return canvas;
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  mimeType: string,
  quality: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('BLOB_ENCODE_FAILED'))),
      mimeType,
      quality,
    );
  });
}

/** 压缩单个图片文件为展示图（最长边 ≤ maxEdge，体积自适应 ≤ maxBytes）。 */
export async function compressImageFile(
  file: File,
  opts: CompressOptions = {},
): Promise<CompressedImage> {
  const maxEdge = opts.maxEdge ?? DEFAULT_MAX_EDGE;
  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES;
  const mimeType = opts.mimeType ?? 'image/jpeg';
  const qualityStart = opts.qualityStart ?? QUALITY_START;
  const qualityFloor = opts.qualityFloor ?? QUALITY_FLOOR;

  const url = URL.createObjectURL(file);
  let img: HTMLImageElement;
  try {
    img = await loadImageElement(url);
  } finally {
    URL.revokeObjectURL(url);
  }

  const { width, height } = computeTargetDimensions(img.naturalWidth, img.naturalHeight, maxEdge);
  const canvas = drawScaled(img, width, height);

  let quality = suggestJpegQuality(file.size, maxBytes, qualityStart, qualityFloor);
  let blob = await canvasToBlob(canvas, mimeType, quality);
  while (blob.size > maxBytes && quality > qualityFloor) {
    quality = Math.max(qualityFloor, quality - 0.1);
    blob = await canvasToBlob(canvas, mimeType, quality);
  }
  return { blob, width, height };
}

/** 生成 320px 缩略图（JPEG）。若原图更小则保持原尺寸。 */
export async function makeThumbnailBlob(
  file: File,
  maxEdge: number = THUMBNAIL_MAX_EDGE,
): Promise<Blob> {
  const url = URL.createObjectURL(file);
  let img: HTMLImageElement;
  try {
    img = await loadImageElement(url);
  } finally {
    URL.revokeObjectURL(url);
  }
  const { width, height } = computeTargetDimensions(img.naturalWidth, img.naturalHeight, maxEdge);
  const canvas = drawScaled(img, width, height);
  return canvasToBlob(canvas, 'image/jpeg', 0.82);
}
