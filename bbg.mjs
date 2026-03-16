#!/usr/bin/env node

import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";

import { cleanTask } from "./.bbg/tasks/clean.mjs";
import { cssTask } from "./.bbg/tasks/css.mjs";
import { jsTask } from "./.bbg/tasks/js.mjs";
import { tplTask } from "./.bbg/tasks/tpl.mjs";
import { copyTask } from "./.bbg/tasks/copy.mjs";
import { fontsTask } from "./.bbg/tasks/fonts.mjs";
import { imgTask } from "./.bbg/tasks/img.mjs";
import { svgTask } from "./.bbg/tasks/svg.mjs";
import { jsonTask } from "./.bbg/tasks/json.mjs";
import { webpTask } from "./.bbg/tasks/webp.mjs";
import { watchTask } from "./.bbg/tasks/watch.mjs";
import { lighthouseTask } from "./.bbg/tasks/lighthouse.mjs";
import { createTimestamp } from "./.bbg/utils/local.mjs";

// Import SSH and DB tasks
import { backupTask, deployTask, syncTask } from "./.bbg/tasks/ssh.mjs";
import {
  createDbTask,
  updateDbTask,
  backupDbTask,
  migrateDbTask,
  exportDbTask,
  deleteDbTask,
  rollbackDbTask,
} from "./.bbg/tasks/db.mjs";

// Import utilities
import {
  log,
  logError,
  handleTaskError,
  handleTaskResult,
  TASK_RESULT,
  setGlobalArgs,
  writeDebugLog,
  formatTime,
  startTaskTimer,
  getTaskDuration,
  stopTaskTimer,
} from "./.bbg/utils/common.mjs";

const __filename = fileURLToPath(import.meta.url);

// Task factory for creating task variants
const createTaskVariant = (taskFn, mode) => () => taskFn(mode);

// Available tasks - optimized with factory pattern
const tasks = {
  // Main development tasks
  clean: cleanTask,
  css: createTaskVariant(cssTask, "development"),
  js: createTaskVariant(jsTask, "development"),
  tpl: createTaskVariant(tplTask, "development"),
  copy: createTaskVariant(copyTask, "development"),
  fonts: createTaskVariant(fontsTask, "development"),
  img: createTaskVariant(imgTask, "development"),
  svg: createTaskVariant(svgTask, "development"),
  json: createTaskVariant(jsonTask, "development"),
  webp: createTaskVariant(webpTask, "development"),
  watch: watchTask,

  // Build variants
  "build:css": createTaskVariant(cssTask, "production"),
  "build:js": createTaskVariant(jsTask, "production"),
  "build:tpl": createTaskVariant(tplTask, "production"),
  "build:fonts": createTaskVariant(fontsTask, "production"),
  "build:img": createTaskVariant(imgTask, "production"),
  "build:svg": createTaskVariant(svgTask, "production"),
  "build:json": createTaskVariant(jsonTask, "production"),
  "build:webp": createTaskVariant(webpTask, "production"),

  // SSH tasks
  backup: backupTask,
  deploy: deployTask,
  sync: syncTask,

  // Database tasks
  "db:create": createDbTask,
  "db:update": updateDbTask,
  "db:backup": backupDbTask,
  "db:migrate": migrateDbTask,
  "db:export": exportDbTask,
  "db:delete": deleteDbTask,
  "db:rollback": rollbackDbTask,

  // Performance tasks
  lighthouse: lighthouseTask,
};

// Composite tasks configuration
const compositeTasks = {
  dev: [
    "clean",
    "css",
    "js",
    "tpl",
    "copy",
    "fonts",
    "img",
    "svg",
    "json",
    "webp",
  ],
  build: [
    "clean",
    "build:css",
    "build:js",
    "build:tpl",
    "copy",
    "build:fonts",
    "build:img",
    "build:svg",
    "build:json",
    "build:webp",
  ], // Full production build
  start: ["dev", "watch"],
  default: ["dev"], // Changed from 'watch' to 'dev' as default
};

// Parse command line arguments configuration
class BBG {
  constructor() {
    this.isRunning = false;
    this.runningTasks = new Set();
    this.taskCache = new Map();
    this.isWatchingMode = false;
  }

  /**
   * Validates if a task exists
   * @param {string} taskName - Name of the task to validate
   * @returns {boolean} - True if task exists
   */
  isValidTask(taskName) {
    return Boolean(tasks[taskName] || compositeTasks[taskName]);
  }

  /**
   * Gets task function with caching
   * @param {string} taskName - Name of the task
   * @returns {Function|null} - Task function or null if not found
   */
  getTask(taskName) {
    if (this.taskCache.has(taskName)) {
      return this.taskCache.get(taskName);
    }

    const task = tasks[taskName] || null;
    if (task) {
      this.taskCache.set(taskName, task);
    }
    return task;
  }

  async runTask(taskName, args = {}) {
    if (!this.isValidTask(taskName)) {
      throw new Error(`Task '${taskName}' not found`);
    }

    const taskId = taskName; // Use consistent task ID with individual tasks
    const env = this.getTaskEnvironment(taskName);
    const isWatching = taskName === "watch" || this.isWatchingMode;

    // Start the centralized task timer
    startTaskTimer(taskId);

    // Write debug log entry for task start
    writeDebugLog("BBG", `Starting task: ${taskName}`, {
      environment: env,
      isWatching,
      arguments: args,
    });

    try {
      log.info(`Starting task: ${taskName}`);

      let result;

      // Check if it's a composite task
      if (compositeTasks[taskName]) {
        result = await this.runCompositeTask(taskName, args);
      } else {
        const task = this.getTask(taskName);
        if (task) {
          result = await task(args);
        }
      }

      // Handle task result using unified system
      if (result && typeof result === "object" && result.status) {
        // Write debug log for task result
        writeDebugLog("BBG", `Task result: ${taskName}`, {
          status: result.status,
          message: result.message,
          debugData: result.data?.debug,
        });

        // Task returned a structured result
        const taskInfo = handleTaskResult(taskName, result, env, isWatching);
        const duration = stopTaskTimer(taskId);

        if (!taskInfo.continue) {
          // Task failed and we should exit
          writeDebugLog("BBG", `Task ${taskName} failed - exiting process`, {
            reason: "Task error in production mode",
          });
          setTimeout(() => {
            process.exit(1);
          }, 300);
          return result; // Return the error result
        }

        // Show combined completion message with file count and timing
        if (taskName !== "watch" && result.status === TASK_RESULT.SUCCESS) {
          let message = `Task '${taskName}' completed in ${formatTime(
            duration
          )}`;

          if (
            taskInfo.compiledCount !== undefined &&
            taskInfo.compiledCount !== null
          ) {
            message += ` (processed ${taskInfo.compiledCount} files)`;
          } else if (
            taskInfo.processed !== undefined &&
            taskInfo.processed !== null
          ) {
            if (taskName === "clean") {
              message += ` (cleaned ${taskInfo.processed} locations)`;
            } else if (taskInfo.converted > 0) {
              message += ` (processed ${taskInfo.processed} files, converted ${taskInfo.converted} to WebP)`;
            } else if (env === "development" && taskInfo.skipped > 0) {
              message += ` (processed ${taskInfo.processed} files, skipped ${taskInfo.skipped} unchanged)`;
            } else {
              message += ` (processed ${taskInfo.processed} files)`;
            }
          }

          log.success(message);
        }

        // Return the result so composite tasks can access it
        return result;
      }

      const duration = stopTaskTimer(taskId);

      // Write debug log for task completion
      writeDebugLog("BBG", `Task completed: ${taskName}`, {
        duration,
        environment: env,
      });

      // Only show completion for non-watch tasks that don't handle their own timing
      // SSH/DB tasks handle their own completion messages with timing
      if (
        taskName !== "watch" &&
        ![
          "deploy",
          "backup",
          "sync",
          "db:create",
          "db:update",
          "db:backup",
          "db:migrate",
          "db:export",
          "db:delete",
        ].includes(taskName)
      ) {
        log.success(`Task '${taskName}' completed in ${formatTime(duration)}`);
      }

      // Return success result for composite tasks
      return (
        result || {
          status: TASK_RESULT.SUCCESS,
          message: `Task '${taskName}' completed successfully`,
          duration,
        }
      );
    } catch (error) {
      const duration = stopTaskTimer(taskId);

      // Write debug log for task error
      writeDebugLog("BBG", `Task failed: ${taskName}`, {
        duration,
        error: error.message,
        stack: error.stack,
      });

      // Handle legacy errors that don't use the new result system
      if (args.debug) {
        logError("Task Error", error.stack || error.message);
      }

      // Use unified error handling for legacy tasks
      const errorResult = {
        status: TASK_RESULT.ERROR,
        message: error.message || "Task execution failed",
        details: {
          stack: error.stack,
          originalError: error,
        },
      };

      const shouldContinue = handleTaskResult(
        taskName,
        errorResult,
        env,
        isWatching
      );

      if (!shouldContinue) {
        setTimeout(() => {
          process.exit(1);
        }, 300);
      }

      // Return error result for composite tasks to handle
      return errorResult;
    }
  }
  /**
   * Get the environment for a task (development or production)
   * @param {string} taskName - Name of the task
   * @returns {string} Environment string
   */
  getTaskEnvironment(taskName) {
    return taskName.startsWith("build:") ? "production" : "development";
  }

  async runCompositeTask(taskName, args = {}) {
    const taskList = compositeTasks[taskName];
    if (!taskList) {
      throw new Error(`Composite task '${taskName}' not found`);
    }

    writeDebugLog("BBG", `Starting composite task: ${taskName}`, {
      tasks: taskList,
      totalTasks: taskList.length,
    });

    switch (taskName) {
      case "start":
        // Special handling for start task - run dev tasks, then start watching
        const devResult = await this.runCompositeTask("dev", args);

        // Only start watching if dev tasks completed successfully
        if (devResult.status === TASK_RESULT.ERROR) {
          log.error(`❌ Cannot start watching: Development build failed`);
          log.info(`📝 Fix the errors above and run 'yarn dev' again`);
          return devResult;
        }

        log.success(`✅ Development build successful`);
        this.isWatchingMode = true;
        await this.runTask("watch", args);
        break;

      case "dev":
      case "build":
        // Add timestamp creation after clean
        await this.runTask("clean", args);
        await createTimestamp();

        // Run remaining tasks in parallel (exclude clean since it's already run)
        const remainingTasks = taskList.filter((task) => task !== "clean");
        const results = await this.runTasksInParallel(remainingTasks, args);

        // Check if any tasks failed
        const failedTasks = results.filter(
          (result) => result && result.status === TASK_RESULT.ERROR
        );

        writeDebugLog("BBG", `Composite task ${taskName} completed`, {
          totalTasks: remainingTasks.length + 1,
          failedTasks: failedTasks.length,
          failedTaskNames: failedTasks.map((t) => t.taskName),
        });

        if (failedTasks.length > 0) {
          const errorMsg = `${failedTasks.length} task(s) failed in ${taskName}`;
          return {
            status: TASK_RESULT.ERROR,
            message: errorMsg,
            details: { failedTasks: failedTasks.map((t) => t.taskName) },
            data: {
              debug: args.debug
                ? {
                    failedTasks: failedTasks,
                    totalTasks: remainingTasks.length + 1,
                  }
                : null,
            },
          };
        }

        return {
          status: TASK_RESULT.SUCCESS,
          message: `All tasks completed successfully`,
          data: {
            completedTasks: remainingTasks.length + 1,
            debug: args.debug
              ? {
                  taskList: remainingTasks,
                  duration: Date.now(),
                }
              : null,
          },
        };

      default:
        // Default: run tasks in parallel
        await this.runTasksInParallel(taskList, args);
    }
  }
  async runTasksInParallel(taskList, args = {}) {
    const promises = taskList.map(async (taskName) => {
      try {
        let result;
        if (compositeTasks[taskName]) {
          result = await this.runCompositeTask(taskName, args);
        } else {
          result = await this.runTask(taskName, args);
        }
        return { taskName, ...result };
      } catch (error) {
        return {
          taskName,
          status: TASK_RESULT.ERROR,
          message: error.message || "Task failed",
          details: { originalError: error },
        };
      }
    });

    const results = await Promise.all(promises);
    return results;
  }

  async runTasksInSeries(taskList, args = {}) {
    for (const taskName of taskList) {
      if (compositeTasks[taskName]) {
        await this.runCompositeTask(taskName, args);
      } else {
        await this.runTask(taskName, args);
      }
    }
  }
}

// Parse command line arguments configuration
const parseArgsConfig = {
  args: process.argv.slice(2),
  options: {
    // Development options
    debug: { type: "boolean", short: "d" },

    // Environment options
    to: { type: "string" },
    from: { type: "string" },
    target: { type: "string" },

    // Source/path options
    src: { type: "string" },
    dump: { type: "string" },

    // Compression and transfer options
    compress: { type: "boolean" },
    nocompress: { type: "boolean" },
    nostream: { type: "boolean" },

    // Backup options
    nobackup: { type: "boolean" },
    save: { type: "boolean" },

    // Transfer method options
    ftp: { type: "boolean" },

    // Lighthouse options
    open: { type: "boolean" },
    // Allow specifying a full URL to audit (overrides config.local)
    url: { type: "string" },
    // Minimum score to require for audits (fail task when any device score is below)
    min: { type: "string" },
    // Optional summary flag (boolean) - presence will produce JSON summary in .reports
    summary: { type: "boolean" },
    // Allow specifying which device(s) the Lighthouse task should target
    device: { type: "string" },
  },
  allowPositionals: true,
};

// Main execution
async function main() {
  try {
    const { values: args, positionals } = parseArgs(parseArgsConfig);
    const runner = new BBG();

    // Set global arguments for use in all tasks
    setGlobalArgs(args);

    // Get task name from positionals or default to 'default'
    const taskName = positionals[0] || "default";

    // Validate task exists before setting global args
    if (!runner.isValidTask(taskName)) {
      throw new Error(`Task '${taskName}' not found`);
    }

    // Legacy global args available to all tasks (for backward compatibility)
    global.taskArgs = args;

    await runner.runTask(taskName, args);

    // For non-watch tasks, exit cleanly to prevent hanging
    if (taskName !== "watch" && taskName !== "start") {
      // Give a brief moment for any cleanup, then exit
      setTimeout(() => {
        process.exit(0);
      }, 100);
    }
  } catch (error) {
    // Use unified error handling and show notification
    handleTaskError("Task runner", error, true, false);

    // Give notifications time to be sent before soft exit (like Ctrl+C)
    setTimeout(() => {
      process.exit(0);
    }, 1500);
  }
}

// Handle graceful shutdown
const gracefulShutdown = (signal) => {
  const messages = {
    SIGINT: "Interrupted by user (Ctrl+C)",
    SIGTERM: "Terminated by system",
  };

  const message = messages[signal] || `Received ${signal}`;
  log.info(`\n${message}. Shutting down task runner...`);
  process.exit(0);
};

process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));

// Run if this file is executed directly
if (process.argv[1] === __filename) {
  main().catch((error) => {
    log.error(`Unhandled error: ${error.message}`);
    process.exit(1);
  });
}

export { BBG, tasks, compositeTasks };
