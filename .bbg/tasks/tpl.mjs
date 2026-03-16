import cfg from '../config.mjs';
import path from 'path';
import { globesExist, batchCopyFiles, createTaskResult, TASK_RESULT } from '../utils/common.mjs';
import fastGlob from 'fast-glob';

export async function tplTask(env = 'development') {
  if (!globesExist(cfg.path.src.tpl)) {
    return null;
  }

  try {
    // Get all template files
    const files = await fastGlob(cfg.path.src.tpl, {
      onlyFiles: true,
      dot: true
    });

    // Use batch copy utility with custom path mapping for templates
    const results = await batchCopyFiles({
      files,
      srcBase: path.join(cfg.path.srcBase, cfg.path.templates),
      destBase: cfg.path.build.tpl,
      env,
      taskName: 'Template'
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
      `Template task failed: ${error.message}`,
      { stack: error.stack, originalError: error }
    );
  }
}