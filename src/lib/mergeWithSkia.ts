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
 * Apply image filters using Skia
 */
export async function applyImageFilter(
  photoUri: string,
  filterType: string,
  width: number,
  height: number
): Promise<string> {
  try {
    console.log(`Applying ${filterType} filter to image:`, photoUri);
    
    // Load the photo file as base64 and convert to Skia.Image
    const base64 = await FileSystem.readAsStringAsync(photoUri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    
    console.log('Image loaded, creating Skia image...');
    // @ts-ignore – runtime API exists
    const imageData = Skia.Data.fromBase64(base64);
    const image = Skia.Image.MakeImageFromEncoded(imageData);
    if (!image) throw new Error('Failed to load image into Skia');

    // Ensure width/height
    let imgW = width || image.width();
    let imgH = height || image.height();
    console.log(`Image dimensions: ${imgW}x${imgH}`);

    // Create an off-screen surface
    // @ts-ignore
    const surface = Skia.Surface.MakeOffscreen(imgW, imgH);
    if (!surface) throw new Error('Failed to create Skia surface');

    const canvas = surface.getCanvas();
    const paint = Skia.Paint();
    paint.setAntiAlias(true);

    // Apply filter based on type
    if (filterType === 'bw') {
      console.log('Applying B&W filter...');
      // Create a grayscale color filter using standard luminance weights
      const colorMatrix = Float32Array.from([
        0.299, 0.587, 0.114, 0, 0,  // Red channel -> grayscale
        0.299, 0.587, 0.114, 0, 0,  // Green channel -> grayscale  
        0.299, 0.587, 0.114, 0, 0,  // Blue channel -> grayscale
        0,     0,     0,     1, 0   // Alpha channel unchanged
      ]);
      
      try {
        // @ts-ignore
        const colorFilter = Skia.ColorFilter.MakeMatrix(colorMatrix);
        if (colorFilter) {
          paint.setColorFilter(colorFilter);
          console.log('B&W color filter applied successfully');
        } else {
          throw new Error('Failed to create B&W color filter');
        }
      } catch (matrixError) {
        console.error('Color matrix creation failed:', matrixError);
        throw matrixError;
      }
    } else if (filterType === 'invert') {
      console.log('Applying invert filter...');
      // Create an invert color filter
      const invertMatrix = Float32Array.from([
        -1,  0,  0, 0, 1,  // Red channel (invert and offset)
         0, -1,  0, 0, 1,  // Green channel (invert and offset)
         0,  0, -1, 0, 1,  // Blue channel (invert and offset)
         0,  0,  0, 1, 0   // Alpha channel (unchanged)
      ]);
      
      try {
        // @ts-ignore
        const colorFilter = Skia.ColorFilter.MakeMatrix(invertMatrix);
        if (colorFilter) {
          paint.setColorFilter(colorFilter);
          console.log('Invert color filter applied successfully');
        } else {
          throw new Error('Failed to create invert color filter');
        }
      } catch (matrixError) {
        console.error('Invert matrix creation failed:', matrixError);
        throw matrixError;
      }
    }

    // Clear and draw the filtered image
    console.log('Drawing filtered image...');
    // @ts-ignore
    canvas.clear(Skia.Color('transparent'));
    
    // Draw the image with the filter applied
    // @ts-ignore
    canvas.drawImageRect(
      image, 
      { x: 0, y: 0, width: imgW, height: imgH },
      { x: 0, y: 0, width: imgW, height: imgH },
      paint
    );

    // Convert back to base64 and save
    console.log('Encoding filtered image...');
    const snapshot = surface.makeImageSnapshot();
    if (!snapshot) throw new Error('Failed to create image snapshot');
    
    // @ts-ignore
    const pngData = snapshot.encodeToBytes();
    if (!pngData) throw new Error('Failed to encode image to bytes');
    
    // @ts-ignore
    const pngBase64 = pngData.toBase64();

    const filteredUri = `${FileSystem.cacheDirectory}filtered_${filterType}_${Date.now()}.png`;
    await FileSystem.writeAsStringAsync(filteredUri, pngBase64, {
      encoding: FileSystem.EncodingType.Base64,
    });

    console.log(`${filterType} filter applied successfully, saved to:`, filteredUri);
    return filteredUri;
  } catch (error) {
    console.error(`Filter application failed for ${filterType}:`, error);
    return photoUri; // Return original if filter fails
  }
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

  // 3. Export to PNG
  const snapshot = surface.makeImageSnapshot();
  // @ts-ignore
  const pngData = snapshot.encodeToBytes();
  // @ts-ignore
  const pngBase64 = pngData.toBase64();

  const mergedUri = `${FileSystem.cacheDirectory}merged_${Date.now()}.png`;
  await FileSystem.writeAsStringAsync(mergedUri, pngBase64, {
    encoding: FileSystem.EncodingType.Base64,
  });

  return mergedUri;
} 