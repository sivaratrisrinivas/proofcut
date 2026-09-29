import {
  countPureBlackPixels,
  decodePng,
  hasTransparency,
  measureWhiteEdgeDepth,
} from "./png";

export interface PngContentFacts {
  pixelWidth: number;
  pixelHeight: number;
  edgeDepthPx: number;
  blackPixelCount: number;
  blackFraction: number;
  hasTransparency: boolean;
}

export function measurePngContent(bytes: Buffer | Uint8Array): PngContentFacts {
  const decoded = decodePng(bytes);
  const blackPixelCount = countPureBlackPixels(decoded);
  return {
    pixelWidth: decoded.width,
    pixelHeight: decoded.height,
    edgeDepthPx: measureWhiteEdgeDepth(decoded),
    blackPixelCount,
    blackFraction: blackPixelCount / (decoded.width * decoded.height),
    hasTransparency: hasTransparency(decoded),
  };
}
