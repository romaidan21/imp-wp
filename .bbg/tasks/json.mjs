import cfg from '../config.mjs';
import fs from 'fs-extra';
import path from 'path';
import { log, globesExist, batchProcessFiles, createTaskResult, TASK_RESULT } from '../utils/common.mjs';
import fastGlob from 'fast-glob';

// Helper function to compress JSON files
async function compressJsonFile(inputPath, outputPath) {
  try {
    // Read and parse JSON
    const jsonContent = await fs.readJson(inputPath);

    // Write minified JSON (no whitespace)
    await fs.writeJson(outputPath, jsonContent, { spaces: 0 });

    return { success: true };
  } catch (error) {
    log.error(`Failed to compress JSON ${inputPath}: ${error.message}`);
    return { success: false, error: error.message };
  }
}

export async function jsonTask(env = 'development') {
  if (!globesExist(cfg.path.src.json)) {
    return null;
  }

  try {
    // Get all JSON files
    const files = await fastGlob(cfg.path.src.json, {
      onlyFiles: true,
      dot: true
    });

    let results;

    if (env === 'production') {
      // Production mode: Compress JSON files using parallel processing
      results = await batchProcessFiles({
        files,
        srcBase: cfg.path.srcBase,
        destBase: cfg.path.build.assets,
        env,
        processFile: async (srcPath, destPath) => {
          // Compress JSON file
          const compressionResult = await compressJsonFile(srcPath, destPath);

          if (!compressionResult.success) {
            throw new Error(`Failed to compress JSON file: ${compressionResult.error}`);
          }
        },
        taskName: 'JSON',
        useChangeDetection: false // Always process in production for deterministic builds
      });

      // Add compression count to results
      results.compressed = results.processed;
    } else {
      // Development mode: Use batch processing utility (no compression)
      results = await batchProcessFiles({
        files,
        srcBase: cfg.path.srcBase,
        destBase: cfg.path.build.assets,
        env,
        processFile: null, // Use default copy behavior
        taskName: 'JSON'
      });
    }

    return createTaskResult(
      TASK_RESULT.SUCCESS,
      `Processed ${results.processed} file(s)`,
      null,
      results
    );

  } catch (error) {
    return createTaskResult(
      TASK_RESULT.ERROR,
      `JSON task failed: ${error.message}`,
      { stack: error.stack, originalError: error }
    );
  }
}