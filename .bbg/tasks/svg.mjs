import cfg from '../config.mjs';
import fs from 'fs-extra';
import path from 'path';
import { optimize } from 'svgo';
import { globesExist, createTaskResult, TASK_RESULT, batchProcessFiles, getOptimalConcurrency, writeDebugLog } from '../utils/common.mjs';
import fastGlob from 'fast-glob';

// SVGO configuration for production optimization
const svgoConfig = {
  multipass: true,
  plugins: [
    'removeComments',
    'removeDoctype',
    'removeXMLProcInst'
  ]
};

// Helper function to optimize SVG content
async function optimizeSvg(inputPath, outputPath) {
  try {
    const svgContent = await fs.readFile(inputPath, 'utf8');
    const result = optimize(svgContent, {
      path: inputPath,
      ...svgoConfig
    });

    if (result.error) {
      throw new Error(result.error);
    }

    await fs.writeFile(outputPath, result.data, 'utf8');

    // Calculate compression ratio
    const originalSize = Buffer.byteLength(svgContent, 'utf8');
    const optimizedSize = Buffer.byteLength(result.data, 'utf8');
    const compression = Math.round((1 - optimizedSize / originalSize) * 100);

    return {
      success: true,
      originalSize,
      optimizedSize,
      compression
    };
  } catch (error) {
    writeDebugLog(`Failed to optimize SVG ${inputPath}: ${error.message}`);
    return {
      success: false,
      error: error.message
    };
  }
}

export async function svgTask(env = 'development') {
  if (!globesExist(cfg.path.src.svg)) {
    return null;
  }

  try {
    // Get all SVG files
    const files = await fastGlob(cfg.path.src.svg, {
      onlyFiles: true,
      dot: true
    });

    // Ensure destination directory exists
    await fs.ensureDir(cfg.path.build.img);

    if (env === 'development') {
      // Development mode: Copy SVGs as-is for faster builds
      const results = await batchProcessFiles({
        files,
        srcBase: path.join(cfg.path.srcBase, 'img'),
        destBase: cfg.path.build.img,
        env,
        processFile: null, // Use default copy behavior
        taskName: 'SVG'
      });

      return createTaskResult(
        TASK_RESULT.SUCCESS,
        `Processed ${results.processed} file(s)`,
        null,
        { ...results, optimized: 0, compressionSaved: 0 }
      );

    } else {
      // Production mode: Optimize SVGs with SVGO using parallel processing
      let totalOriginalSize = 0;
      let totalOptimizedSize = 0;
      let optimizedCount = 0;
      const errors = [];

      const results = await batchProcessFiles({
        files,
        srcBase: path.join(cfg.path.srcBase, 'img'),
        destBase: cfg.path.build.img,
        env,
        processFile: async (srcPath, destPath) => {
          // Optimize SVG
          const optimizationResult = await optimizeSvg(srcPath, destPath);

          if (optimizationResult.success) {
            optimizedCount++;
            totalOriginalSize += optimizationResult.originalSize;
            totalOptimizedSize += optimizationResult.optimizedSize;
          } else {
            // Optimization failed - treat as error
            const errorMsg = `Failed to optimize ${path.basename(srcPath)}: ${optimizationResult.error}`;
            errors.push({
              file: srcPath,
              error: errorMsg
            });
            throw new Error(errorMsg);
          }
        },
        taskName: 'SVG',
        useChangeDetection: false // Always process in production for deterministic builds
      });

      // Calculate overall compression statistics
      const compressionSaved = totalOriginalSize > 0
        ? Math.round((1 - totalOptimizedSize / totalOriginalSize) * 100)
        : 0;

      const savedBytes = totalOriginalSize - totalOptimizedSize;

      return createTaskResult(
        results.errors.length > 0 ? TASK_RESULT.ERROR : TASK_RESULT.SUCCESS,
        results.errors.length > 0
          ? `SVG processing failed: ${results.errors.length} optimization error(s), ${results.processed} processed successfully`
          : `Processed ${results.processed} file(s) in parallel (${optimizedCount} optimized, ${compressionSaved}% compression, ${(savedBytes / 1024).toFixed(1)}KB saved)`,
        results.errors.length > 0 ? { errors: results.errors } : null,
        {
          processed: results.processed,
          skipped: results.skipped,
          total: results.total,
          optimized: optimizedCount,
          failed: results.errors.length,
          compressionSaved,
          bytesSaved: savedBytes,
          concurrency: results.concurrency
        }
      );
    }

  } catch (error) {
    return createTaskResult(
      TASK_RESULT.ERROR,
      `SVG task failed: ${error.message}`,
      { stack: error.stack, originalError: error }
    );
  }
}
