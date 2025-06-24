// @ts-ignore – Skia types may not expose every helper in d.ts but exist at runtime
import { Skia } from '@shopify/react-native-skia';
import * as FileSystem from 'expo-file-system';

export interface TextOverlayInfo {
  text: string;
  x: number;
  y: number;
  fontSize: number;
  color: string;
  fontWeight: 'normal' | 'bold';
}

/**
 * Merge a captured camera photo (JPEG/PNG) with text overlays entirely in JS using Skia.
 * Returns the URI of a new PNG stored in the cache directory.
 */
export async function mergePhotoWithText(
  photoUri: string,
  width: number,
  height: number,
  overlays: TextOverlayInfo[],
): Promise<string> {
  // 1. Load the photo file as base64 and convert to Skia.Image
  const base64 = await FileSystem.readAsStringAsync(photoUri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  // @ts-ignore – runtime API exists
  const imageData = Skia.Data.fromBase64(base64);
  const image = Skia.Image.MakeImageFromEncoded(imageData);
  if (!image) throw new Error('Failed to load image into Skia');

  // Ensure width/height
  let imgW = width || image.width();
  let imgH = height || image.height();

  // Avoid very large canvases that can crash Skia on low-memory devices
  const MAX_DIMENSION = 2000; // px
  let scale = 1;
  if (imgW > MAX_DIMENSION) {
    scale = MAX_DIMENSION / imgW;
    imgW = Math.round(imgW * scale);
    imgH = Math.round(imgH * scale);
  }

  // 2. Create an off-screen surface
  // @ts-ignore
  const surface = Skia.Surface.MakeOffscreen(imgW, imgH);
  if (!surface) throw new Error('Failed to create Skia surface');

  const canvas = surface.getCanvas();

  // Clear and draw photo
  // @ts-ignore
  canvas.clear(Skia.Color('white'));
  // @ts-ignore
  canvas.drawImageRect(image, { x: 0, y: 0, width: imgW, height: imgH });

  // Prepare paint for text
  overlays.forEach((o) => {
    const paint = Skia.Paint();
    paint.setAntiAlias(true);
    paint.setColor(Skia.Color(o.color));

    // Create default typeface for reliability
    // @ts-ignore
    const tf = Skia.Typeface.MakeDefault();
    // @ts-ignore
    const font = Skia.Font(tf, o.fontSize * scale);
    if (o.fontWeight === 'bold') {
      // @ts-ignore – setEdging exists at runtime
      font.setEdging('Alias');
    }

    canvas.drawText(o.text, o.x * scale, o.y * scale + o.fontSize * scale, paint, font);
  });

  // 3. Snapshot surface and encode
  // @ts-ignore
  const snapshot = surface.makeImageSnapshot();
  // @ts-ignore
  const mergedBase64 = snapshot.encodeToBase64('png', 100);

  // 4. Write to cache directory
  const outPath = `${FileSystem.cacheDirectory}merged_${Date.now()}.png`;
  await FileSystem.writeAsStringAsync(outPath, mergedBase64, {
    encoding: FileSystem.EncodingType.Base64,
  });

  return outPath;
} 