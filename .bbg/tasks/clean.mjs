import cfg from '../config.mjs';
import { removeLocal } from '../utils/local.mjs';
import { createTaskResult, TASK_RESULT } from '../utils/common.mjs';

export async function cleanTask() {
  try {
    const pathsToClean = [
      `app/${cfg.path.theme}/assets/**/*`,
      `app/${cfg.path.theme}/templates/**/*`,
    ];

    await removeLocal(pathsToClean, true);

    return createTaskResult(
      TASK_RESULT.SUCCESS,
      'Clean completed',
      null,
      {
        processed: pathsToClean.length,
        paths: pathsToClean
      }
    );
  } catch (error) {
    return createTaskResult(
      TASK_RESULT.ERROR,
      `Clean task failed: ${error.message}`,
      {
        stack: error.stack,
        originalError: error
      }
    );
  }
}
