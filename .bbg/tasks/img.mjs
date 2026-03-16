import cfg from '../config.mjs';
import fs from 'fs-extra';
import path from 'path';
import sharp from 'sharp';
import { globesExist, createTaskResult, TASK_RESULT, batchCopyFiles, batchProcessFiles, writeDebugLog } from '../utils/common.mjs';
import fastGlob from 'fast-glob';

const webpOptions = {
  quality: 75,
  effort: 6,
  lossless: false
};

const avifOptions = {
  quality: 75,
  effort: 4,
  lossless: false,
  speed: 6
};

// Helper function to convert image to WebP
async function convertToWebP(inputPath, outputPath) {
  try {
    const image = sharp(inputPath);
    await image
      .webp(webpOptions)
      .toFile(outputPath);

    return true;
  } catch (error) {
    writeDebugLog('Image', `Failed to convert ${inputPath} to WebP: ${error.message}`);
    return false;
  }
}

// Helper function to convert image to AVIF
async function convertToAvif(inputPath, outputPath) {
  try {
    const image = sharp(inputPath);

    await image
      .avif(avifOptions)
      .toFile(outputPath);

    return true;
  } catch (error) {
    writeDebugLog('Image', `Failed to convert ${inputPath} to AVIF: ${error.message}`);
    return false;
  }
}

// Helper function to check if file should be converted to WebP
function shouldConvertToWebP(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return ['.jpg', '.jpeg', '.png', '.tiff'].includes(ext);
}

// Helper function to check if file should be converted to AVIF
function shouldConvertToAvif(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return ['.jpg', '.jpeg', '.png', '.tiff', '.webp'].includes(ext);
}

// Helper function to check if file should be converted to modern formats
function shouldConvertImage(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return ['.jpg', '.jpeg', '.png', '.tiff', '.webp'].includes(ext);
}

export async function imgTask(env = 'development') {
  if (!globesExist(cfg.path.src.img)) {
    return null;
  }

  try {
    const files = await fastGlob(cfg.path.src.img, {
      onlyFiles: true,
      dot: true
    });

    // Ensure destination directory exists
    await fs.ensureDir(cfg.path.build.img);

    if (env === 'development') {
      // Development mode: Copy images as-is for faster builds
      const results = await batchCopyFiles({
        files,
        srcBase: path.join(cfg.path.srcBase, 'img'),
        destBase: cfg.path.build.img,
        env,
        taskName: 'Image'
      });

      return createTaskResult(
        TASK_RESULT.SUCCESS,
        `Processed ${results.processed} file(s)`,
        null,
        { ...results, converted: 0 }
      );

    } else {
      // Production mode: Convert images to modern formats
      let convertedCount = 0;

      const results = await batchProcessFiles({
        files,
        srcBase: path.join(cfg.path.srcBase, 'img'),
        destBase: cfg.path.build.img,
        env,
        operationType: 'image', // Set proper timeout for image operations
        processFile: async (srcPath, destPath) => {
          // Convert to both WebP and AVIF if it's a convertible image format
          if (shouldConvertImage(srcPath)) {
            const baseName = path.basename(destPath, path.extname(destPath));
            const destDir = path.dirname(destPath);

            const webpPath = path.join(destDir, baseName + '.webp');
            // const avifPath = path.join(destDir, baseName + '.avif');

            let webpConverted = false;
            let avifConverted = false;

            // Convert to WebP (skip if source is already WebP)
            if (shouldConvertToWebP(srcPath)) {
              webpConverted = await convertToWebP(srcPath, webpPath);
            }

            // Convert to AVIF (including from WebP sources)
            // if (shouldConvertToAvif(srcPath)) {
            //   avifConverted = await convertToAvif(srcPath, avifPath);
            // }

            if (webpConverted || avifConverted) {
              convertedCount++;
            }

            // If both conversions failed, fall back to copying original
            if (!webpConverted && !avifConverted) {
              await fs.copy(srcPath, destPath);
            }
          } else {
            // Copy non-convertible files (GIF, SVG, etc.) as-is
            await fs.copy(srcPath, destPath);
          }
        },
        taskName: 'Image',
        useChangeDetection: false
      });

      return createTaskResult(
        TASK_RESULT.SUCCESS,
        `Processed ${results.processed} file(s) (${convertedCount} converted to WebP)`,
        results.errors.length > 0 ? { errors: results.errors } : null,
        {
          processed: results.processed,
          skipped: results.skipped,
          total: results.total,
          converted: convertedCount,
          concurrency: results.concurrency
        }
      );
    }
  } catch (error) {
    return createTaskResult(
      TASK_RESULT.ERROR,
      `Images task failed: ${error.message}`,
      { stack: error.stack, originalError: error }
    );
  }
}
