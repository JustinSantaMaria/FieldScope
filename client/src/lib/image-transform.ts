export interface ImageRenderTransform {
  imageScale: number;
  imageX: number;
  imageY: number;
  imageRotation: number;
}

export interface ContainTransformResult {
  scale: number;
  x: number;
  y: number;
}

export function computeContainTransform(
  imgWidth: number,
  imgHeight: number,
  stageWidth: number,
  stageHeight: number
): ContainTransformResult {
  const scaleX = stageWidth / imgWidth;
  const scaleY = stageHeight / imgHeight;
  const scale = Math.min(scaleX, scaleY);
  
  const x = (stageWidth - imgWidth * scale) / 2;
  const y = (stageHeight - imgHeight * scale) / 2;
  
  return { scale, x, y };
}

export function getImageRenderTransform(
  imgWidth: number,
  imgHeight: number,
  stageWidth: number,
  stageHeight: number,
  rotation: number = 0
): ImageRenderTransform {
  const { scale, x, y } = computeContainTransform(imgWidth, imgHeight, stageWidth, stageHeight);
  return {
    imageScale: scale,
    imageX: x,
    imageY: y,
    imageRotation: rotation,
  };
}

export function assertPixelRatioConsistency(
  imgNaturalWidth: number,
  imgNaturalHeight: number,
  stageWidth: number,
  stageHeight: number
): { pixelRatio: number; isConsistent: boolean } {
  const pixelRatioX = imgNaturalWidth / stageWidth;
  const pixelRatioY = imgNaturalHeight / stageHeight;
  
  const tolerance = 0.01;
  const isConsistent = Math.abs(pixelRatioX - pixelRatioY) < tolerance * Math.max(pixelRatioX, pixelRatioY);
  
  return {
    pixelRatio: pixelRatioX,
    isConsistent,
  };
}

export const NORMALIZATION_VERSION = 1;
