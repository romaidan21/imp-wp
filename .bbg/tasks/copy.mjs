import cfg from '../config.mjs';
import { globesExist, batchCopyFiles, createTaskResult, TASK_RESULT } from '../utils/common.mjs';
import fastGlob from 'fast-glob';

export async function copyTask(env = 'development') {
  if (!globesExist(cfg.path.src.copy)) {
    return null; // Silently skip when no files to copy
  }

  try {
    // Get all files to copy
    const files = await fastGlob(cfg.path.src.copy, {
      onlyFiles: true,
      dot: true
    });

    // Use batch copy utility
    const results = await batchCopyFiles({
      files,
      srcBase: cfg.path.srcBase,
      destBase: cfg.path.build.assets,
      env,
      taskName: 'Copy'
    });

    return createTaskResult(
      TASK_RESULT.SUCCESS,
      `Processed ${results.processed} file(s)`,
      null,
      results
    );

  } catch (error) {
    return createTaskResult(
      TASK_RESULT.ERROR,
      `Copy task failed: ${error.message}`,
      { stack: error.stack, originalError: error }
    );
  }
}