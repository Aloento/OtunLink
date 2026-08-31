// BarcodeDetector 原生 API 的手动类型声明（TypeScript 7 的 lib.dom.d.ts 尚未内置）。
interface BarcodeDetectorOptions {
  formats?: string[];
}

interface DetectedBarcode {
  rawValue: string;
  format: string;
  cornerPoints: { x: number; y: number }[];
  boundingBox: DOMRectReadOnly;
}

declare class BarcodeDetector {
  constructor(options?: BarcodeDetectorOptions);
  static getSupportedFormats(): Promise<string[]>;
  detect(image: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement): Promise<DetectedBarcode[]>;
}

interface Window {
  BarcodeDetector?: typeof BarcodeDetector;
}
