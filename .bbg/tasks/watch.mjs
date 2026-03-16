import cfg from '../config.mjs';
import path from 'path';
import fs from 'fs-extra';
import glob from 'fast-glob';
import { log, TASK_RESULT, handleTaskResult, formatTime, startTaskTimer, stopTaskTimer } from '../utils/common.mjs';
import { cssTask } from './css.mjs';
import { jsTask } from './js.mjs';
import { tplTask } from './tpl.mjs';
import { copyTask } from './copy.mjs';
import { fontsTask } from './fonts.mjs';
import { imgTask } from './img.mjs';
import { svgTask } from './svg.mjs';
import { jsonTask } from './json.mjs';
import { webpTask } from './webp.mjs';

// Task mapping for asset processing
const taskMap = {
  css: cssTask,
  js: jsTask,
  tpl: tplTask,
  copy: copyTask,
  fonts: fontsTask,
  img: imgTask,
  svg: svgTask,
  json: jsonTask,
  webp: webpTask,
};

// Debounce function
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

export async function watchTask() {
  const watchers = new Map();

  try {
    // Check if build directory exists and has been built
    const buildExists = await fs.pathExists(cfg.path.build.assets);

    if (!buildExists) {
      log.error('❌ Build directory not found. Please run "dev" task first before watching.');
      return {
        status: TASK_RESULT.ERROR,
        message: 'Build directory not found. Run dev task first.',
        details: {
          suggestion: 'Use "node bbg.mjs start" or run "node bbg.mjs dev" followed by "node bbg.mjs watch"'
        }
      };
    }

    // File timestamp tracking for all assets (including JS)
    const fileTimestamps = new Map();

    // Initialize file timestamps
    const initializeTimestamps = async () => {
      for (const [taskName, watchPath] of Object.entries(cfg.path.watch)) {
        try {
          // Handle both string and array patterns (for exclusions)
          const patterns = Array.isArray(watchPath) ? watchPath : [watchPath];
          const normalizedPatterns = patterns.map(p => p.replace(/\\/g, '/'));

          const files = await glob(normalizedPatterns);

          for (const file of files) {
            try {
              // Skip _env.scss files (specifically global/_env.scss)
              if (file.includes('global/_env.scss') || file.includes('_env.scss')) {
                continue;
              }

              const stats = await fs.stat(file);
              fileTimestamps.set(file, stats.mtimeMs);
            } catch (error) {
              // File might not exist, skip
            }
          }
        } catch (error) {
          log.warn(`⚠️ Error initializing timestamps for ${taskName}: ${error.message}`);
        }
      }
    };

    await initializeTimestamps();

    // Create debounced task runners for all assets
    const debouncedTasks = new Map();

    Object.keys(cfg.path.watch).forEach(taskName => {
      debouncedTasks.set(taskName, debounce(async () => {
        try {
          log.info(`🔄 Running ${taskName} task...`);
          const taskId = `watch-${taskName}-${Date.now()}`;
          startTaskTimer(taskId);

          if (taskMap[taskName]) {
            const result = await taskMap[taskName]('development');
            const duration = stopTaskTimer(taskId);

            // Use centralized task result handling
            handleTaskResult(taskName, result, 'development', true);

            // Always show completion time for watch mode
            if (result && result.status === TASK_RESULT.SUCCESS) {
              log.success(`✅ ${taskName} completed in ${formatTime(duration)}`);
            }
          } else {
            stopTaskTimer(taskId);
            log.warn(`⚠️ Unknown task: ${taskName}`);
          }
        } catch (error) {
          log.error(`❌ ${taskName} failed: ${error.message}`);
        }
      }, 300));
    });

    // Start unified polling for all assets
    const pollForChanges = async () => {
      for (const [taskName, watchPath] of Object.entries(cfg.path.watch)) {
        try {

          // Handle both string and array patterns (for exclusions)
          const patterns = Array.isArray(watchPath) ? watchPath : [watchPath];
          const normalizedPatterns = patterns.map(p => p.replace(/\\/g, '/'));

          const files = await glob(normalizedPatterns);

          for (const file of files) {
            try {
              const stats = await fs.stat(file);
              const lastTimestamp = fileTimestamps.get(file) || 0;

              if (stats.mtimeMs > lastTimestamp) {
                const relativePath = path.relative(process.cwd(), file);

                // Additional check to ensure _env.scss is never processed
                if (relativePath.includes('global/_env.scss') || relativePath.includes('_env.scss')) {
                  continue;
                }

                log.info(`🔄 File changed: ${relativePath}`);

                fileTimestamps.set(file, stats.mtimeMs);

                const debouncedTask = debouncedTasks.get(taskName);
                if (debouncedTask) {
                  debouncedTask();
                }
                break; // Only trigger once per task type per poll cycle
              }
            } catch (error) {
              // File might have been deleted
              if (fileTimestamps.has(file)) {
                const relativePath = path.relative(process.cwd(), file);

                // Skip _env.scss even for deletion
                if (relativePath.includes('global/_env.scss') || relativePath.includes('_env.scss')) {
                  continue;
                }

                log.info(`🗑️ File removed: ${relativePath}`);
                fileTimestamps.delete(file);

                const debouncedTask = debouncedTasks.get(taskName);
                if (debouncedTask) {
                  debouncedTask();
                }
              }
            }
          }
        } catch (error) {
          // Silently continue, might be temporary glob issues
        }
      }
    };

    // Start polling interval
    const pollingInterval = setInterval(pollForChanges, 250); // Poll every 250ms
    watchers.set('polling', pollingInterval);

    log.info('👀 Watching assets (Press Ctrl+C to stop)');

    // Handle graceful shutdown
    const cleanup = async () => {
      log.info('\n🛑 Stopping watch system...');

      // Clear polling interval
      if (watchers.has('polling')) {
        clearInterval(watchers.get('polling'));
        log.success('✅ Asset watchers stopped');
      }

      process.exit(0);
    };

    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);

    // Keep the process alive
    return new Promise(() => {
      // This promise never resolves, keeping the watch active
    });

  } catch (error) {
    log.error(`❌ Failed to start watch system: ${error.message}`);
    throw error;
  }
}
