import cfg from '../config.mjs';
import fs from 'fs-extra';
import { globesExist, batchCopyFiles, batchProcessFiles, createTaskResult, TASK_RESULT, writeDebugLog } from '../utils/common.mjs';
import fastGlob from 'fast-glob';

// Helper function to replace image extensions with .webp
async function replaceImageExtensions(inputPath, outputPath) {
  try {
    const content = await fs.readFile(inputPath, 'utf8');

    // Replace common image extensions with .webp
    const imageExtensionsRegex = /\.(jpg|jpeg|png|gif|bmp|tiff|tif)(?=["'\s\]>}]|$)/gi;
    const modifiedContent = content.replace(imageExtensionsRegex, '.webp');

    await fs.writeFile(outputPath, modifiedContent, 'utf8');

    // Count replacements made
    const matches = content.match(imageExtensionsRegex) || [];

    return {
      success: true,
      replacements: matches.length
    };
  } catch (error) {
    writeDebugLog(`Failed to process file ${inputPath}: ${error.message}`);
    return {
      success: false,
      error: error.message
    };
  }
}

export async function webpTask(env = 'development') {
  if (!globesExist(cfg.path.src.webp)) {
    return null; // Silently skip when no files to process
  }

  try {
    const files = await fastGlob(cfg.path.src.webp, {
      onlyFiles: true,
      dot: true
    });

    let totalReplacements = 0;

    if (env === 'development') {
      // Development mode: Copy files as-is for faster builds
      const results = await batchCopyFiles({
        files,
        srcBase: cfg.path.srcBase,
        destBase: cfg.path.build.assets,
        env,
        taskName: 'WebP'
      });

      return createTaskResult(
        TASK_RESULT.SUCCESS,
        `Processed ${results.processed} file(s)`,
        null,
        { ...results, replacements: 0 }
      );

    } else {
      // Production mode: Replace image extensions with .webp
      const results = await batchProcessFiles({
        files,
        srcBase: cfg.path.srcBase,
        destBase: cfg.path.build.assets,
        env,
        processFile: async (srcPath, destPath) => {
          const replacementResult = await replaceImageExtensions(srcPath, destPath);

          if (!replacementResult.success) {
            throw new Error(`Failed to process image extensions: ${replacementResult.error}`);
          }

          totalReplacements += replacementResult.replacements;
        },
        taskName: 'WebP',
        useChangeDetection: false // Always process in production for deterministic builds
      });

      return createTaskResult(
        TASK_RESULT.SUCCESS,
        `Processed ${results.processed} file(s) with ${totalReplacements} image extension replacements`,
        null,
        { ...results, replacements: totalReplacements }
      );
    }

  } catch (error) {
    return createTaskResult(
      TASK_RESULT.ERROR,
      `WebP task failed: ${error.message}`,
      { stack: error.stack, originalError: error }
    );
  }
}