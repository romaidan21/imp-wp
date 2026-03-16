import fs from "fs-extra";
import path from "path";
import os from "os";
import notifier from "node-notifier";
import prompts from "prompts";
import ora from "ora";
import clc from "cli-color";
import fastGlob from "fast-glob";
import PQueue from "p-queue";
import { runLocalSilent } from "./local.mjs";
import { runRemoteSilent } from "./remote.mjs";
import cfg from "../config.mjs";

// Cache for compression tools per environment
const compressionCache = new Map();

// Simplified compression tools - fallback is last in array
const COMPRESSION_TOOLS = [
  {
    name: "pigz",
    cmd: "pigz",
    compressCmd: "pigz",
    decompressCmd: "pigz -dc",
  },
  {
    name: "gzip",
    cmd: "gzip",
    compressCmd: "gzip",
    decompressCmd: "gunzip -c",
  },
];

// Unified argument system - will be populated by the task runner
let globalArgs = {};

/**
 * Set global arguments from the task runner
 * @param {object} args - Parsed arguments from parseArgs
 */
export function setGlobalArgs(args) {
  globalArgs = { ...args };
}

/**
 * Get unified arguments with type coercion and defaults
 * @param {object} overrides - Override specific arguments
 * @returns {object} - Unified arguments object
 */
export function getArgs(overrides = {}) {
  const args = { ...globalArgs, ...overrides };

  // Ensure proper type coercion for boolean arguments
  const booleanArgs = [
    "debug",
    "compress",
    "nocompress",
    "nostream",
    "nobackup",
    "save",
    "ftp",
  ];
  booleanArgs.forEach((key) => {
    if (args[key] !== undefined) {
      args[key] = Boolean(args[key]);
    }
  });

  // Handle compression logic - if nocompress is true, compress should be false
  if (args.nocompress) {
    args.compress = false;
  }

  return args;
}

/**
 * Legacy args export for backward compatibility
 * @deprecated Use getArgs() instead
 */
export const args = new Proxy(
  {},
  {
    get(target, prop) {
      const currentArgs = getArgs();
      return currentArgs[prop];
    },

    set(target, prop, value) {
      globalArgs[prop] = value;
      return true;
    },

    has(target, prop) {
      const currentArgs = getArgs();
      return prop in currentArgs;
    },

    ownKeys(target) {
      const currentArgs = getArgs();
      return Object.keys(currentArgs);
    },
  }
);

// Get env params
export function getEnv(env) {
  let filePath = path.resolve(process.cwd(), `.env.${env}`);
  let envBuffer = fs.readFileSync(filePath);
  let creds = parseBuffer(envBuffer);

  creds.sudo = creds.SSH_SUDO ? "sudo " : "";
  creds.SSH_KEYPATH = creds.SSH_KEYNAME
    ? path.resolve(process.env.USERPROFILE, ".ssh", creds.SSH_KEYNAME)
    : null;

  // Auto-validate SSH_PATH to prevent root directory deployments
  if (creds.SSH_PATH && env !== "local") {
    validateRemotePath(creds.SSH_PATH, cfg);
  }

  return creds;
}

// Check if env file exists
export async function checkEnv(envs) {
  const envsArray = Array.isArray(envs) ? envs : [envs];

  await Promise.all(
    envsArray.map(async (env) => {
      const filePath = path.resolve(process.cwd(), `.env.${env}`);
      if (!(await fs.pathExists(filePath))) {
        throw new Error(
          `Environment file "${env}" does not exist or is not accessible`
        );
      }
    })
  );
}

// Validate database name
export function validateDbName(name) {
  // Only allow alphanumeric, hyphens and underscores
  const validPattern = /^[a-zA-Z0-9_]+$/;
  const maxLength = 64;

  if (!name || typeof name !== "string") {
    throw new Error("Database name must be provided");
  }

  if (name.length > maxLength) {
    throw new Error(`Database name cannot exceed ${maxLength} characters`);
  }

  if (!validPattern.test(name)) {
    throw new Error(
      "Database name can only contain letters, numbers, and underscores"
    );
  }

  return true;
}

// Task Timer Management
let taskTimers = new Map();

/**
 * Start timing a task
 * @param {string} taskId - Unique identifier for the task
 */
export function startTaskTimer(taskId = "default") {
  taskTimers.set(taskId, {
    startTime: Date.now(),
    activeDuration: 0,
    isPaused: false,
  });
}

/**
 * Pause the task timer (e.g., during user prompts)
 * @param {string} taskId - Unique identifier for the task
 */
export function pauseTaskTimer(taskId = "default") {
  const timer = taskTimers.get(taskId);
  if (timer && !timer.isPaused) {
    // Add the current active period to total active duration
    timer.activeDuration += Date.now() - timer.startTime;
    timer.isPaused = true;
  }
}

/**
 * Resume the task timer after pause
 * @param {string} taskId - Unique identifier for the task
 */
export function resumeTaskTimer(taskId = "default") {
  const timer = taskTimers.get(taskId);
  if (timer && timer.isPaused) {
    // Restart timing from now
    timer.startTime = Date.now();
    timer.isPaused = false;
  }
}

/**
 * Get the current task duration excluding paused time
 * @param {string} taskId - Unique identifier for the task
 * @returns {number} Duration in milliseconds
 */
export function getTaskDuration(taskId = "default") {
  const timer = taskTimers.get(taskId);
  if (!timer) return 0;

  // If currently running, add current period to total active duration
  const currentPeriod = timer.isPaused ? 0 : Date.now() - timer.startTime;
  return timer.activeDuration + currentPeriod;
}

/**
 * Stop and cleanup a task timer
 * @param {string} taskId - Unique identifier for the task
 * @returns {number} Final duration in milliseconds
 */
export function stopTaskTimer(taskId = "default") {
  const duration = getTaskDuration(taskId);
  taskTimers.delete(taskId);
  return duration;
}

/**
 * Enhanced promptUser that automatically pauses/resumes task timer
 * @param {string} message - The prompt message
 * @param {string} taskId - Optional task ID to pause (defaults to 'default')
 */
export async function promptUser(message, taskId = "default") {
  pauseTaskTimer(taskId);
  try {
    const result = await new Promise((resolve, reject) => {
      prompt({
        message: message,
        callback: () => resolve(true),
        fallback: () => resolve(false),
      });
    });
    return result;
  } finally {
    resumeTaskTimer(taskId);
  }
}

// Common function to validate required arguments
export function prompt({
  message,
  callback,
  fallback = () => {
    process.exit(1);
  },
}) {
  return (async () => {
    const response = await prompts({
      type: "confirm",
      name: "value",
      initial: true,
      message,
    });
    if (response.value === true) {
      callback();
    } else {
      fallback();
    }
  })();
}

// Format bytes to human readable format
export function formatSize(bytes) {
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;

  while (bytes >= 1024 && i < units.length - 1) {
    bytes /= 1024;
    i++;
  }

  return `${i === 0 ? bytes : bytes.toFixed(2)} ${units[i]}`;
}

// Format milliseconds to human readable format
export function formatTime(ms) {
  const seconds = ms / 1000;
  if (seconds < 60) {
    return `${seconds.toFixed(2)} s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")} m`;
}

// Log helpers
export const log = {
  info: (msg) => {
    console.log(clc.blue("→ " + msg));
  },

  warn: (msg) => {
    console.log(clc.yellow("⚠ " + msg));
  },

  error: (msg, notify = false) => {
    console.log(clc.red.bold("✗ " + msg));
    if (notify) {
      notifications.error(msg);
    }
  },

  success: (msg, notify = false) => {
    console.log(clc.green.bold("✓ " + msg));
    if (notify) {
      notifications.success(msg);
    }
  },

  debug: (msg) => {
    // Print debug messages in gray color
    console.log(clc.xterm(8)("DEBUG: " + msg));
  },
};

// Spinner
export const spinner = {
  loader: null,
  message: "",
  startTime: null,

  start(msg, cb = () => {}) {
    if (!this.loader) {
      this.message = msg;
      this.startTime = Date.now();
      this.loader = ora(msg).start();
      setTimeout(cb, 200);
    }
  },

  stop(error = null) {
    if (this.loader) {
      const elapsedTime = Date.now() - this.startTime;
      this.loader.stop();

      if (error) {
        log.error(error);
      } else {
        log.success(`${this.message}`);
        log.info(`Complete in ${formatTime(elapsedTime)}`);
      }

      this.loader = null;
      this.startTime = null;
    }
  },

  update(msg) {
    if (this.loader) {
      this.message = this.loader.text = msg;
    }
  },
};

// Save debug logs
export function logError(message, error) {
  const timestamp = new Date().toISOString();
  const logMessage = `${timestamp} - ${message}: ${error.stack || error}\n`;
  fs.appendFileSync("debug.log", logMessage);
}

/**
 * Centralized debug logging - only writes to debug.log if debug mode is enabled
 * @param {string} taskName - Name of the task
 * @param {string} message - Debug message
 * @param {object} data - Additional debug data
 */
export function writeDebugLog(taskName, message, data = null) {
  const args = getArgs();
  if (!args.debug) return; // Only log if debug mode is enabled

  const timestamp = new Date().toISOString();
  const debugData = data ? ` | Data: ${JSON.stringify(data)}` : "";
  const logMessage = `${timestamp} - [${taskName}] ${message}${debugData}\n`;

  try {
    fs.appendFileSync("debug.log", logMessage);
  } catch (error) {
    // Fallback to console if file writing fails
    console.error(`Failed to write debug log: ${error.message}`);
  }
}

// Windows tray notifications
export function showNotification({
  title,
  message,
  type = "info",
  sound = false,
  timeout = 5,
}) {
  const notificationConfig = {
    title,
    message,
    sound: type === "error" ? true : sound,
    wait: false,
    timeout: type === "error" ? 10 : timeout,
  };

  try {
    notifier.notify(notificationConfig);
  } catch (error) {
    // Fallback - at least show error in console
    console.error(`Notification failed: ${error.message}`);
  }
}

// Convenience functions for common notification types
export const notifications = {
  success: (message, title = "Success") =>
    showNotification({ title, message, type: "success" }),
  error: (message, title = "Error") =>
    showNotification({ title, message, type: "error", sound: true }),
  info: (message, title = "Info") =>
    showNotification({ title, message, type: "info" }),
  warn: (message, title = "Warning") =>
    showNotification({ title, message, type: "warning" }),
};

// Create date/timestamp for archive/dump
export function getTimeStamp() {
  const now = new Date();
  return now.toISOString().slice(0, 19).replace("T", "-").replace(/:/g, "-");
}

// Fix double|single quotes for env params
export function parseBuffer(src) {
  const NEWLINES_MATCH = /\r\n|\n|\r/;
  const NEWLINE = "\n";
  const RE_INI_KEY_VAL = /^\s*([\w.-]+)\s*=\s*(.*)?\s*$/;
  const RE_NEWLINES = /\\n/g;
  const obj = {};

  src
    .toString()
    .split(NEWLINES_MATCH)
    .forEach((line) => {
      const keyValueArr = line.match(RE_INI_KEY_VAL);
      if (keyValueArr != null) {
        const key = keyValueArr[1];
        let val = keyValueArr[2] || "";
        const end = val.length - 1;
        const isDoubleQuoted = val[0] === '"' && val[end] === '"';
        const isSingleQuoted = val[0] === "'" && val[end] === "'";

        if (isSingleQuoted || isDoubleQuoted) {
          val = val.substring(1, end);
          if (isDoubleQuoted) {
            val = val.replace(RE_NEWLINES, NEWLINE);
          }
        } else {
          val = val.trim();
        }
        obj[key] = val;
      }
    });

  return obj;
}

// Generate safe password
export function generateSafePass(length = 16) {
  const characters =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-";
  return Array.from(crypto.getRandomValues(new Uint8Array(length)))
    .map((x) => characters[x % characters.length])
    .join("");
}

// Check if glob pattern exists
export function globesExist(globPattern) {
  const entries = fastGlob.sync(globPattern, { onlyFiles: true, dot: true });
  return entries.length > 0;
}

// Check if file needs to be copied by comparing modification times and sizes
export async function shouldCopyFile(srcPath, destPath) {
  try {
    const [srcStats, destStats] = await Promise.all([
      fs.stat(srcPath),
      fs.stat(destPath).catch(() => null), // Return null if destination doesn't exist
    ]);

    // Copy if destination doesn't exist
    if (!destStats) {
      return true;
    }

    // Copy if source is newer or different size
    return (
      srcStats.mtimeMs > destStats.mtimeMs || srcStats.size !== destStats.size
    );
  } catch (error) {
    // If we can't stat the source file, don't copy
    return false;
  }
}

// Common function to validate required arguments
export async function validateArgs(args = null, required = []) {
  try {
    // Use provided args or get current global args
    const currentArgs = args || getArgs();

    for (const argName of required) {
      if (!currentArgs[argName]) {
        throw new Error(`"--${argName}" is required!`);
      }
    }

    if (
      currentArgs.from &&
      currentArgs.to &&
      currentArgs.from === currentArgs.to
    ) {
      throw new Error('"--from" and "--to" arguments cannot be the same.');
    }

    // Additional validation for specific argument combinations
    if (currentArgs.nocompress && currentArgs.compress) {
      log.warn(
        "Both --compress and --nocompress specified. Using --nocompress."
      );
    }
  } catch (error) {
    log.error(error.message);
    throw error;
  }
}

/**
 * Enhanced validation with type checking and custom validators
 * @param {object} args - Arguments to validate
 * @param {object} schema - Validation schema
 */
export async function validateArgsWithSchema(args = null, schema = {}) {
  const currentArgs = args || getArgs();

  try {
    // Check required fields
    if (schema.required) {
      await validateArgs(currentArgs, schema.required);
    }

    // Type validation
    if (schema.types) {
      Object.entries(schema.types).forEach(([key, expectedType]) => {
        if (currentArgs[key] !== undefined) {
          const actualType = typeof currentArgs[key];
          if (actualType !== expectedType) {
            throw new Error(
              `Argument "--${key}" must be of type ${expectedType}, got ${actualType}`
            );
          }
        }
      });
    }

    // Custom validators
    if (schema.validators) {
      Object.entries(schema.validators).forEach(([key, validator]) => {
        if (currentArgs[key] !== undefined) {
          const isValid = validator(currentArgs[key]);
          if (!isValid) {
            throw new Error(
              `Argument "--${key}" has invalid value: ${currentArgs[key]}`
            );
          }
        }
      });
    }

    // Mutually exclusive arguments
    if (schema.mutuallyExclusive) {
      schema.mutuallyExclusive.forEach((group) => {
        const presentArgs = group.filter((arg) => currentArgs[arg]);
        if (presentArgs.length > 1) {
          throw new Error(
            `Arguments ${presentArgs
              .map((arg) => `--${arg}`)
              .join(", ")} are mutually exclusive`
          );
        }
      });
    }
  } catch (error) {
    log.error(error.message);
    throw error;
  }
}

/**
 * Convenience function to get specific argument with default value
 * @param {string} key - Argument key
 * @param {any} defaultValue - Default value if argument is not provided
 * @returns {any} - Argument value or default
 */
export function getArg(key, defaultValue = undefined) {
  const args = getArgs();
  return args[key] !== undefined ? args[key] : defaultValue;
}

/**
 * Check if an argument is provided
 * @param {string} key - Argument key
 * @returns {boolean} - True if argument is provided
 */
export function hasArg(key) {
  const args = getArgs();
  return args[key] !== undefined;
}

/**
 * Get multiple arguments with defaults
 * @param {object} mapping - Object with key-defaultValue pairs
 * @returns {object} - Object with resolved values
 */
export function getArgsWithDefaults(mapping) {
  const args = getArgs();
  const result = {};

  Object.entries(mapping).forEach(([key, defaultValue]) => {
    result[key] = args[key] !== undefined ? args[key] : defaultValue;
  });

  return result;
}

// Get compression tools
export async function getGZtool(env, conn = null) {
  const cacheKey = env === "local" ? "local" : `${conn?.config?.host || env}`;

  // Return cached result if available
  if (compressionCache.has(cacheKey)) {
    return compressionCache.get(cacheKey);
  }

  spinner.start("Checking for compression tools");

  // Test each tool in order, use first available
  for (const tool of COMPRESSION_TOOLS) {
    try {
      let result;

      if (conn) {
        // Remote systems are typically Unix/Linux
        result = await runRemoteSilent(`command -v ${tool.cmd}`, conn);
      } else {
        // Local system - try to execute the tool with --version flag
        // Some tools output to stderr, so we need to handle both stdout and stderr
        try {
          result = await runLocalSilent(`${tool.cmd} --version`);
        } catch (error) {
          // If --version failed, try just the command name (some tools might not support --version)
          try {
            result = await runLocalSilent(`${tool.cmd} --help`);
          } catch (helpError) {
            // Tool doesn't exist or isn't executable
            continue;
          }
        }
      }

      // Accept any non-empty result as success
      if (result !== undefined && result !== null) {
        let compressionInfo = {
          name: tool.name,
          compressCmd: tool.compressCmd,
          decompressCmd: tool.decompressCmd,
        };

        // Platform-specific decompression command adjustments
        if (tool.name === "gzip") {
          if (conn) {
            // Remote Unix/Linux systems: use gunzip -c
            compressionInfo.decompressCmd = "gunzip -c";
          } else {
            // Local system: use gzip -dc (cross-platform)
            compressionInfo.decompressCmd = "gzip -dc";
          }
        } else if (tool.name === "pigz") {
          // pigz is cross-platform and uses the same flags everywhere
          compressionInfo.decompressCmd = "pigz -dc";
        }

        compressionCache.set(cacheKey, compressionInfo);
        spinner.stop();
        return compressionInfo;
      }
    } catch (error) {
      // Tool not available, try next
      continue;
    }
  }

  spinner.stop();

  // Fallback to last tool (gzip)
  const fallbackTool = COMPRESSION_TOOLS[COMPRESSION_TOOLS.length - 1];
  const compressionInfo = {
    name: fallbackTool.name,
    compressCmd: fallbackTool.compressCmd,
    decompressCmd: fallbackTool.decompressCmd,
  };

  // Apply platform-specific adjustments to fallback tool as well
  if (fallbackTool.name === "gzip") {
    if (conn) {
      // Remote Unix/Linux systems: use gunzip -c
      compressionInfo.decompressCmd = "gunzip -c";
    } else {
      // Local system: use gzip -dc (cross-platform)
      compressionInfo.decompressCmd = "gzip -dc";
    }
  } else if (fallbackTool.name === "pigz") {
    // pigz is cross-platform and uses the same flags everywhere
    compressionInfo.decompressCmd = "pigz -dc";
  }

  compressionCache.set(cacheKey, compressionInfo);
  return compressionInfo;
}

// Clear compression tool cache (useful for testing/debugging)
export function clearCompressionCache() {
  compressionCache.clear();
  log.info("Compression tool cache cleared");
}

// Get cached compression info
export function getGZtoolInfo(env, conn = null) {
  const cacheKey = env === "local" ? "local" : `${conn?.config?.host || env}`;
  return compressionCache.get(cacheKey) || null;
}

/**
 * Function to detect if a path looks like a root/home directory
 * and automatically prevents deployments to dangerous root directories
 * @param {string} path - The path to check
 * @returns {boolean} - True if the path appears to be a root directory
 */
export function isRootPath(path) {
  if (!path || typeof path !== "string") return true;

  // Normalize the path by removing trailing slashes
  const normalizedPath = path.replace(/\/$/, "");

  // Common root/home directory patterns that should be avoided
  const rootPatterns = [
    /^\/$/, // Root directory "/"
    /^\/home\/[^\/]+\/?$/, // Home directory like "/home/username" or "/home/username/"
    /^\/var\/www\/?$/, // Common web root
    /^\/usr\/?$/, // System directory
    /^\/opt\/?$/, // Optional software directory
    /^C:\\$|^C:\\\\$/, // Windows C: root
    /^[A-Z]:\\$|^[A-Z]:\\\\$/, // Any Windows drive root
    /^\/Users\/[^\/]+\/?$/, // macOS home directory
  ];

  // Check if path matches any root patterns
  for (const pattern of rootPatterns) {
    if (pattern.test(normalizedPath)) {
      return true;
    }
  }

  // Additional check: if path has less than 3 segments, it's likely too close to root
  const segments = normalizedPath
    .split("/")
    .filter((segment) => segment.length > 0);
  if (segments.length < 2) {
    return true;
  }

  return false;
}

// Cache for path validation warnings to show each warning only once
const _pathWarningsShown = new Set();

/**
 * Function to validate staging path from environment
 * Enhanced with better error messages and path validation
 * @param {string} envPath - The staging path to validate
 * @param {object} config - Configuration object with siteName and themeName
 * @returns {string} - The normalized validated path
 */
export function validateRemotePath(envPath, config = null) {
  if (!envPath || typeof envPath !== "string") {
    throw new Error("Staging path must be a valid non-empty string");
  }

  // Normalize path for consistent checking
  const normalizedPath = path.normalize(envPath).replace(/\\/g, "/");

  // If config is provided, check if path contains project identifier
  if (config && (config.siteName || config.themeName)) {
    const hasProjectId =
      normalizedPath.includes(config.siteName) ||
      normalizedPath.includes(config.themeName);

    if (!hasProjectId && !_pathWarningsShown.has(normalizedPath)) {
      console.warn(
        `⚠️  Warning: Staging path "${envPath}" doesn't contain project name "${config.siteName}" or theme "${config.themeName}". ` +
          `Please verify this is the correct staging directory.`
      );
      _pathWarningsShown.add(normalizedPath);
    }
  }

  return normalizedPath;
}

// Task result types for unified error handling
export const TASK_RESULT = {
  SUCCESS: "success",
  ERROR: "error",
  WARNING: "warning",
};

/**
 * Create a standardized task result
 * @param {string} status - TASK_RESULT status
 * @param {string} message - Result message
 * @param {object} details - Additional details (error object, stats, etc.)
 * @param {object} data - Task-specific data (files processed, etc.)
 * @returns {object} Standardized task result
 */
export function createTaskResult(status, message, details = null, data = null) {
  return {
    status,
    message,
    details,
    data,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Unified BBG task result handler - processes task results and handles display
 * @param {string} taskName - Name of the task
 * @param {object} result - Task result object
 * @param {string} env - Environment ('development' or 'production')
 * @param {boolean} isWatching - Whether this is part of a watch process
 * @returns {boolean} Whether the task should continue (false = exit process)
 */
export function handleTaskResult(
  taskName,
  result,
  env = "development",
  isWatching = false
) {
  const isDevelopment = env === "development";
  const isProduction = env === "production";

  switch (result.status) {
    case TASK_RESULT.SUCCESS:
      // Return processing info for BBG to handle completion message
      if (result.data && typeof result.data.processed === "number") {
        const {
          processed,
          skipped,
          total,
          compressed,
          converted,
          convertedType,
        } = result.data;

        // Return info object for BBG to create combined completion message
        return {
          continue: true,
          processed,
          skipped,
          total,
          converted,
          convertedType,
          compiledCount: null,
        };
      }
      // Handle compilation tasks (JS/CSS) that return compiled array or count
      else if (result.data && Array.isArray(result.data.compiled)) {
        const compiledCount = result.data.compiled.length;
        return {
          continue: true,
          processed: null,
          compiledCount,
        };
      } else if (result.data && typeof result.data.compiled === "number") {
        return {
          continue: true,
          processed: null,
          compiledCount: result.data.compiled,
        };
      }
      // Fallback - no specific file count info
      else if (result.message) {
        log.info(result.message);
      }
      return { continue: true };

    case TASK_RESULT.WARNING:
      // Show warning but continue
      log.warn(`${taskName}: ${result.message}`, true);
      if (result.details && result.details.formatted) {
        console.warn(result.details.formatted);
      }
      return { continue: true };

    case TASK_RESULT.ERROR:
      // Show error with tray notification
      const errorMsg = `${taskName}: ${result.message}`;
      log.error(errorMsg, true);

      // Show detailed error information in console
      if (result.details) {
        if (result.details.formatted) {
          console.error(result.details.formatted);
        } else if (result.details.message) {
          console.error(result.details.message);
        } else if (result.details.stack) {
          console.error(result.details.stack);
        }
      }

      // Environment-specific behavior
      if (isProduction && !isWatching) {
        log.error(`${taskName} failed in production mode. Exiting...`);
        return { continue: false }; // Signal to exit
      } else if (isDevelopment) {
        if (isWatching) {
          log.error(
            `${taskName} failed in development mode. Continuing with watch mode...`
          );
        } else {
          log.error(`${taskName} failed in development mode.`);
        }
        return { continue: true }; // Continue
      }

      return { continue: false }; // Default to exit on error

    default:
      log.error(`${taskName}: Unknown result status: ${result.status}`);
      return false;
  }
}

// Legacy BBG task error handler (deprecated - use handleTaskResult instead)
export function handleTaskError(
  taskName,
  error,
  showDetails = false,
  skipNotification = false
) {
  const errorMsg = error.message || error.toString();

  // Clean up common error types
  let cleanMessage = errorMsg;

  if (errorMsg.includes("Access denied")) {
    cleanMessage = "Invalid database credentials";
  } else if (errorMsg.includes("mysql-client")) {
    cleanMessage = "Database connection failed";
  } else if (errorMsg.includes("ENOTFOUND")) {
    cleanMessage = "Server not found";
  } else if (errorMsg.includes("ECONNREFUSED")) {
    cleanMessage = "Connection refused";
  } else if (errorMsg.includes("ENOENT") && errorMsg.includes(".ssh")) {
    cleanMessage = "SSH key file not found";
  } else if (errorMsg.includes("ENOENT")) {
    cleanMessage = "File or directory not found";
  } else if (showDetails) {
    cleanMessage = errorMsg.split("\n")[0]; // Show only first line for details
  } else {
    cleanMessage = "Task execution failed";
  }

  const finalMessage = `${taskName}: ${cleanMessage}`;

  // Only show notification if not skipped (to avoid duplicates)
  log.error(finalMessage, !skipNotification);

  return finalMessage;
}

// Helper function to determine optimal concurrency for file operations
export function getOptimalConcurrency() {
  const cpuCount = os.cpus().length;

  // Adaptive multiplier based on CPU thread count for better scaling
  let multiplier;
  if (cpuCount >= 16) {
    // High-end CPUs (i7-13700H: 20 threads, i5-12500H: 16 threads)
    multiplier = 1.5;
  } else if (cpuCount >= 8) {
    // Mid-range CPUs (i5-11400H: 12 threads)
    multiplier = 1.75;
  } else {
    // Lower-end CPUs (quad-core and below)
    multiplier = 2.0;
  }

  const ioConcurrency = Math.floor(cpuCount * multiplier);

  // Adaptive bounds: minimum 4, maximum scales with CPU capability
  const maxConcurrency = Math.min(32, Math.max(16, cpuCount * 2));
  return Math.max(4, Math.min(maxConcurrency, ioConcurrency));
}

/**
 * Universal batch file processing utility with optimized parallel processing
 * Handles both copying and custom processing functions with dynamic timeout handling
 * @param {object} options - Configuration options
 * @param {string[]} options.files - Array of source file paths
 * @param {string} options.srcBase - Source base directory
 * @param {string} options.destBase - Destination base directory
 * @param {string} options.env - Environment ('development' or 'production')
 * @param {function} options.getRelativePath - Function to get relative path from source file
 * @param {function} options.getDestPath - Function to get destination path from relative path
 * @param {function} options.processFile - Function to process individual file (srcPath, destPath, relativePath)
 * @param {number} options.concurrency - Concurrency level for parallel processing (auto-detected if not provided)
 * @param {boolean} options.isDebug - Enable debug logging
 * @param {string} options.taskName - Task name for logging
 * @param {boolean} options.useChangeDetection - Whether to use change detection in development mode (default: true)
 * @param {object} options.timeouts - Timeout configuration { check: 5000, process: 30000, heavy: 300000 }
 * @param {string} options.operationType - Operation type hint: 'copy', 'image', 'video', 'compress', 'heavy' (default: 'copy')
 * @returns {object} - Results { processed, skipped, total, concurrency, errors }
 */
export async function batchProcessFiles({
  files,
  srcBase,
  destBase,
  env = "development",
  getRelativePath = (file) => path.relative(srcBase, file),
  getDestPath = (relativePath) => path.join(destBase, relativePath),
  processFile, // Custom processing function (srcPath, destPath, relativePath) => Promise
  concurrency,
  taskName = "Files",
  useChangeDetection = true,
  timeouts = {},
  operationType = "copy",
}) {
  let processedCount = 0;
  let skippedCount = 0;
  const isDebug = getArgs().debug || false;
  const errors = [];

  // Dynamic timeout configuration based on operation type
  const defaultTimeouts = {
    check: 5000, // File checking operations
    copy: 30000, // Simple file copying
    image: 120000, // Image processing operations
    video: 600000, // Video processing operations
    compress: 180000, // Compression operations
    heavy: 300000, // Heavy processing operations
  };

  // Merge user timeouts with defaults
  const finalTimeouts = { ...defaultTimeouts, ...timeouts };

  // Determine timeout based on operation type
  const getOperationTimeout = (opType) => {
    return finalTimeouts[opType] || finalTimeouts.heavy;
  };

  // Determine optimal concurrency if not provided
  // Reduce concurrency for heavy operations to prevent system overload
  let actualConcurrency = concurrency || getOptimalConcurrency();

  if (["video", "heavy", "compress"].includes(operationType)) {
    actualConcurrency = Math.max(2, Math.floor(actualConcurrency * 0.5));
    if (isDebug) {
      writeDebugLog(
        taskName,
        `Reduced concurrency to ${actualConcurrency} for ${operationType} operations`
      );
    }
  } else if (operationType === "image") {
    actualConcurrency = Math.max(2, Math.floor(actualConcurrency * 0.75));
  }

  if (isDebug) {
    writeDebugLog(
      taskName,
      `Batch processing started - ${files.length} files, concurrency: ${actualConcurrency}`
    );
  }

  // Ensure destination directory exists
  await fs.ensureDir(destBase);

  if (env === "development" && useChangeDetection) {
    // Development mode: Use change detection and parallel processing with p-queue
    const filesToProcess = [];
    const skippedFiles = { value: 0 };

    // Check which files need to be processed in parallel
    const checkQueue = new PQueue({
      concurrency: Math.min(actualConcurrency * 2, 16), // Use higher concurrency for file checks
      timeout: getOperationTimeout("check"),
      throwOnTimeout: false, // Don't throw on timeout, handle gracefully
      autoStart: true,
    });

    const checkTasks = files.map((file) =>
      checkQueue.add(async () => {
        try {
          const relativePath = getRelativePath(file);
          const destPath = getDestPath(relativePath);

          if (await shouldCopyFile(file, destPath)) {
            filesToProcess.push({ file, destPath, relativePath });
          } else {
            skippedFiles.value++;
          }
        } catch (error) {
          // Handle timeout and other errors gracefully
          const errorMessage =
            error.name === "TimeoutError"
              ? `File check timeout after ${getOperationTimeout("check")}ms`
              : error.message;

          errors.push({
            file,
            operation: "check",
            error: errorMessage,
          });

          if (isDebug) {
            writeDebugLog(
              taskName,
              `Failed to check file ${file}: ${errorMessage}`
            );
          }

          // If it's a timeout, assume file needs processing to be safe
          if (error.name === "TimeoutError") {
            const relativePath = getRelativePath(file);
            const destPath = getDestPath(relativePath);
            filesToProcess.push({ file, destPath, relativePath });
          }
        }
      })
    );

    await Promise.all(checkTasks);

    // Process files using p-queue for better parallel processing
    const processQueue = new PQueue({
      concurrency: actualConcurrency,
      timeout: getOperationTimeout(operationType),
      throwOnTimeout: false, // Handle timeouts gracefully
      autoStart: true,
    });

    let completedProcessing = 0;
    const processTasks = filesToProcess.map(
      (fileInfo, index) =>
        processQueue.add(
          async () => {
            const startTime = Date.now();
            try {
              const { file, destPath, relativePath } = fileInfo;
              await fs.ensureDir(path.dirname(destPath));

              if (processFile) {
                // Add timeout wrapper for custom processing functions
                await Promise.race([
                  processFile(file, destPath, relativePath),
                  new Promise((_, reject) =>
                    setTimeout(
                      () => reject(new Error("Operation timeout")),
                      getOperationTimeout(operationType)
                    )
                  ),
                ]);
              } else {
                // Default behavior: copy file
                await fs.copy(file, destPath);
              }

              completedProcessing++;
              processedCount++;

              // Log progress and timing in debug mode
              if (isDebug) {
                const processingTime = Date.now() - startTime;
                if (completedProcessing % 25 === 0) {
                  writeDebugLog(
                    taskName,
                    `Processing progress: ${completedProcessing}/${filesToProcess.length} files`
                  );
                }
                if (processingTime > 5000) {
                  // Log slow operations
                  writeDebugLog(
                    taskName,
                    `Slow operation: ${path.basename(
                      file
                    )} took ${processingTime}ms`
                  );
                }
              }
            } catch (error) {
              const processingTime = Date.now() - startTime;
              const isTimeout =
                error.message.includes("timeout") ||
                error.name === "TimeoutError";

              const errorMessage = isTimeout
                ? `Processing timeout after ${processingTime}ms (limit: ${getOperationTimeout(
                    operationType
                  )}ms)`
                : error.message;

              errors.push({
                file: fileInfo.file,
                operation: "process",
                error: errorMessage,
                processingTime,
              });

              if (isDebug) {
                writeDebugLog(
                  taskName,
                  `Failed to process ${fileInfo.file}: ${errorMessage}`
                );
              }
            }
          },
          { priority: filesToProcess.length - index }
        ) // Higher priority for later files
    );

    processQueue.on("error", (error) => {
      writeDebugLog(taskName, `Process queue error: ${error.message}`);
    });

    await Promise.all(processTasks);
    skippedCount = skippedFiles.value;
  } else {
    // Production mode or no change detection: Process all files using p-queue
    const processQueue = new PQueue({
      concurrency: actualConcurrency,
      timeout: getOperationTimeout(operationType),
      throwOnTimeout: false, // Handle timeouts gracefully
      autoStart: true,
    });

    let completedProcessing = 0;
    const processTasks = files.map(
      (file, index) =>
        processQueue.add(
          async () => {
            const startTime = Date.now();
            try {
              const relativePath = getRelativePath(file);
              const destPath = getDestPath(relativePath);

              await fs.ensureDir(path.dirname(destPath));

              if (processFile) {
                // Add timeout wrapper for custom processing functions
                await Promise.race([
                  processFile(file, destPath, relativePath),
                  new Promise((_, reject) =>
                    setTimeout(
                      () => reject(new Error("Operation timeout")),
                      getOperationTimeout(operationType)
                    )
                  ),
                ]);
              } else {
                // Default behavior: copy file
                await fs.copy(file, destPath);
              }

              completedProcessing++;
              processedCount++;

              // Log progress every 50 files in debug mode (less frequent for production)
              if (isDebug) {
                const processingTime = Date.now() - startTime;
                if (completedProcessing % 50 === 0) {
                  writeDebugLog(
                    taskName,
                    `Processing progress: ${completedProcessing}/${files.length} files`
                  );
                }
                if (processingTime > 10000) {
                  // Log very slow operations in production
                  writeDebugLog(
                    taskName,
                    `Very slow operation: ${path.basename(
                      file
                    )} took ${processingTime}ms`
                  );
                }
              }
            } catch (error) {
              const processingTime = Date.now() - startTime;
              const isTimeout =
                error.message.includes("timeout") ||
                error.name === "TimeoutError";

              const errorMessage = isTimeout
                ? `Processing timeout after ${processingTime}ms (limit: ${getOperationTimeout(
                    operationType
                  )}ms)`
                : error.message;

              errors.push({
                file,
                operation: "process",
                error: errorMessage,
                processingTime,
              });

              if (isDebug) {
                writeDebugLog(
                  taskName,
                  `Failed to process ${file}: ${errorMessage}`
                );
              }
            }
          },
          { priority: files.length - index }
        ) // Higher priority for later files
    );

    processQueue.on("error", (error) => {
      if (isDebug) {
        writeDebugLog(taskName, `Process queue error: ${error.message}`);
      }
    });

    await Promise.all(processTasks);
  }

  if (isDebug) {
    writeDebugLog(
      taskName,
      `Batch processing completed - Processed: ${processedCount}, Skipped: ${skippedCount}, Errors: ${errors.length}`
    );
  }

  return {
    processed: processedCount,
    skipped: skippedCount,
    total: files.length,
    concurrency: actualConcurrency,
    errors,
  };
}

/**
 * Batch file copying utility with optimized performance and change detection
 * @param {object} options - Configuration options
 * @param {string[]} options.files - Array of source file paths
 * @param {string} options.srcBase - Source base directory
 * @param {string} options.destBase - Destination base directory
 * @param {string} options.env - Environment ('development' or 'production')
 * @param {function} options.getRelativePath - Function to get relative path from source file
 * @param {function} options.getDestPath - Function to get destination path from relative path
 * @param {number} options.concurrency - Concurrency level for parallel processing (auto-detected if not provided)
 * @param {boolean} options.isDebug - Enable debug logging
 * @param {string} options.taskName - Task name for logging
 * @returns {object} - Results { processed, skipped, total, concurrency, errors }
 */
export async function batchCopyFiles({
  files,
  srcBase,
  destBase,
  env = "development",
  getRelativePath = (file) => path.relative(srcBase, file),
  getDestPath = (relativePath) => path.join(destBase, relativePath),
  concurrency,
  taskName = "Files",
  timeouts = {},
  operationType = "copy",
}) {
  // Use the universal batchProcessFiles utility with default copy behavior
  return await batchProcessFiles({
    files,
    srcBase,
    destBase,
    env,
    getRelativePath,
    getDestPath,
    processFile: null, // Use default copy behavior
    concurrency,
    taskName,
    useChangeDetection: true,
    timeouts,
    operationType,
  });
}
