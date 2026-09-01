// 相机扫码：
// - 优先使用原生 BarcodeDetector（仅 https/本地环境可用）；
// - 失败或不可用时回退 @zxing/browser（纯 JS 解码）。
// 仅提供「单帧解码」原语，相机流由 ScannerDialog 统一管理（track.stop 释放）。

const NATIVE_FORMATS = [
  'ean_13',
  'ean_8',
  'upc_a',
  'upc_e',
  'code_128',
  'code_39',
  'qr_code',
  'data_matrix',
  'itf',
];

export function supportsNativeBarcodeDetector(): boolean {
  return (
    typeof window !== 'undefined' &&
    'BarcodeDetector' in window &&
    typeof window.BarcodeDetector === 'function'
  );
}

/** 用原生 BarcodeDetector 尝试解码一帧；无结果返回 null。 */
export async function decodeFrameNative(
  video: HTMLVideoElement,
): Promise<string | null> {
  if (!supportsNativeBarcodeDetector()) return null;
  try {
    const detector = new window.BarcodeDetector!({ formats: NATIVE_FORMATS });
    const codes = await detector.detect(video);
    return codes.length > 0 ? codes[0].rawValue : null;
  } catch {
    return null;
  }
}

/** 用 @zxing/browser 尝试解码一帧；无结果返回 null。 */
export async function decodeFrameZxing(video: HTMLVideoElement): Promise<string | null> {
  const { BrowserMultiFormatReader } = await import('@zxing/browser');
  const reader = new BrowserMultiFormatReader();
  try {
    const result = await reader.decodeOnceFromVideoElement(video);
    return result ? result.getText() : null;
  } catch {
    return null;
  }
}
