import cfg from "../config.mjs";
import fs from "fs-extra";
import zlib from "zlib";
import { pipeline } from "stream/promises";
import { Transform } from "stream";
import { spawn } from "child_process";

import {
  getArgs,
  validateArgs,
  log,
  spinner,
  getTimeStamp,
  getEnv,
  checkEnv,
  promptUser,
  getGZtool,
  getGZtoolInfo,
  formatTime,
  formatSize,
  startTaskTimer,
  stopTaskTimer,
} from "../utils/common.mjs";
import {
  runRemote,
  runRemoteSilent,
  uploadFile,
  removeRemoteFile,
  streamRemoteToLocal,
} from "../utils/remote.mjs";
import { runLocal, createLocalDir, runLocalSilent } from "../utils/local.mjs";
import {
  getPooledConnection,
  releaseConnection,
  closeAllConnections,
} from "../utils/pool.mjs";

let isPrompted = false;

const ZLIB_OPTIONS = { level: 9, memLevel: 9, chunkSize: 2 * 1024 * 1024 };

// Debug helper - logs only when debug flag is set
const debugLog = (message, data = null) => {
  if (getArgs().debug) {
    if (data) {
      log.info(`🔍 ${message}`, data);
    } else {
      log.info(`🔍 ${message}`);
    }
  }
};

// Dry-run helper - checks if dry-run mode is active
const isDryRun = () => getArgs().dryrun || getArgs()["dry-run"];

// Escape shell argument for safe command execution
// Handles special characters: ', ", $, `, \, spaces, etc.
const escapeShellArg = (arg) => {
  if (!arg || typeof arg !== "string") return "";

  // For PowerShell/Windows: use double quotes and escape internal double quotes
  // For Unix/Linux: use single quotes and escape single quotes
  if (process.platform === "win32") {
    // Windows/PowerShell escaping
    return `"${arg.replace(/"/g, '`"')}"`;
  } else {
    // Unix/Linux escaping: replace ' with '\'' (end quote, escaped quote, start quote)
    return `'${arg.replace(/'/g, "'\\'")}'`;
  }
};

// Helper functions
const askPass = (env, pass) => {
  if (env === "local") return "";
  // Use -p flag with properly escaped password
  // Note: The password is already wrapped in quotes by escapeShellArg
  return ` -p${escapeShellArg(pass)}`;
};

// Build MySQL import command with optimal performance flags
const buildImportCommand = (env) => {
  const { DB_HOST, DB_NAME, DB_USER, DB_PASSWORD } = getEnv(env);
  return (
    `mysql -u${DB_USER} -h${DB_HOST}${askPass(env, DB_PASSWORD)} ` +
    `--max-allowed-packet=1G ` +
    `--net-buffer-length=16M ` +
    `--default-character-set=utf8mb4 ` +
    `${DB_NAME} --force`
  );
};

// Check if DB exists and get version info in a single query
const checkDB = async (env, conn, options = {}) => {
  const { DB_HOST, DB_NAME, DB_USER, DB_PASSWORD, sudo } = getEnv(env);
  const { getVersionInfo = false } = options;

  const runQuery = env === "local" ? runLocal : runRemote;

  // Build combined query to check existence and optionally get version
  let query;
  let spinnerMsg;

  if (getVersionInfo) {
    // Combined query: check DB existence AND get version in one go
    query = `${sudo}mysql -u${DB_USER} -h${DB_HOST}${askPass(
      env,
      DB_PASSWORD,
    )} -e "SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME = '${DB_NAME}' LIMIT 1; SELECT VERSION();" -s -N`;
    spinnerMsg = `Checking database "${DB_NAME}" at "${DB_HOST}"`;
    debugLog(
      `Checking database existence and detecting version at "${DB_HOST}"`,
    );
  } else {
    // Simple existence check
    query = `${sudo}mysql -u${DB_USER} -h${DB_HOST}${askPass(
      env,
      DB_PASSWORD,
    )} -e "SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME = '${DB_NAME}' LIMIT 1"`;
    spinnerMsg = `Checking database "${DB_NAME}" at "${DB_HOST}"`;
    debugLog(`Checking if database "${DB_NAME}" exists at "${DB_HOST}"`);
  }

  try {
    const response = await runQuery({ cmd: query, spinner: spinnerMsg }, conn);

    const exists = response.includes(DB_NAME);

    if (!getVersionInfo) {
      return exists;
    }

    // Parse version info from combined response
    const lines = response.split("\n").filter((line) => line.trim());
    const versionStr = lines.length > 1 ? lines[1].trim() : lines[0].trim();
    const isMariaDB = versionStr.toLowerCase().includes("mariadb");
    const versionMatch = versionStr.match(/(\d+)\.(\d+)\.(\d+)/);

    if (!versionMatch) {
      log.warn(`Could not parse database version: ${versionStr}`);
      return {
        exists,
        versionInfo: { isMariaDB: false, version: "0.0.0", versionStr },
      };
    }

    const [, major, minor, patch] = versionMatch;
    const version = `${major}.${minor}.${patch}`;

    log.info(`Detected: ${isMariaDB ? "MariaDB" : "MySQL"} ${version}`);

    return {
      exists,
      versionInfo: {
        isMariaDB,
        version,
        major: parseInt(major),
        minor: parseInt(minor),
        versionStr,
      },
    };
  } catch (error) {
    if (getVersionInfo) {
      log.warn(`Could not check database or detect version: ${error.message}`);
      return {
        exists: false,
        versionInfo: {
          isMariaDB: false,
          version: "0.0.0",
          major: 0,
          minor: 0,
          versionStr: "unknown",
        },
      };
    }
    throw error;
  }
};

// Detect database type and version (kept for backward compatibility)
const getDbVersion = async (env, conn) => {
  const result = await checkDB(env, conn, { getVersionInfo: true });
  return result.versionInfo;
};

// Get the appropriate dump command for the database type
// MariaDB 10.4.6+ uses mariadb-dump, older versions and MySQL use mysqldump
const getDumpCommand = (dbInfo) => {
  const { isMariaDB } = dbInfo;
  // Use mariadb-dump for MariaDB, mysqldump for MySQL
  return isMariaDB ? "mariadb-dump" : "mysqldump";
};

// Get the appropriate mysql client command for the database type
const getMysqlCommand = (dbInfo) => {
  const { isMariaDB } = dbInfo;
  // Use mariadb for MariaDB, mysql for MySQL
  return isMariaDB ? "mariadb" : "mysql";
};

// Build mysqldump flags based on database type and version
// Compatible with: MySQL 5.7+, MySQL 8.0+, MariaDB 10.x+, MariaDB 11.x+
const buildDumpFlags = (dbInfo) => {
  const { isMariaDB, major, minor } = dbInfo;

  // Base flags compatible with all MySQL 5.7+ and MariaDB versions
  let flags = [
    "--max-allowed-packet=1G", // Large packet size for big tables
    "--disable-keys", // Speed up import by disabling keys during insert
    "--hex-blob", // Encode binary data as hex (cross-platform safe)
    "--single-transaction", // Consistent snapshot without locking (InnoDB)
    "--routines", // Include stored procedures and functions
    "--triggers", // Include triggers
    "--quick", // Retrieve rows one at a time (memory efficient)
    "--lock-tables=false", // Don't lock tables (use single-transaction instead)
    "--default-character-set=utf8mb4", // Ensure UTF-8 4-byte support (emoji, special chars)
  ];

  // --set-gtid-purged: Only for MySQL 5.6+, not for MariaDB
  if (!isMariaDB && major >= 5 && minor >= 6) {
    flags.push("--set-gtid-purged=OFF");
  }

  // --skip-column-statistics: For MySQL 8.0+ and MariaDB (to avoid MySQL client compatibility issues)
  // MySQL 8.0+ requires this flag to skip column statistics
  // MariaDB doesn't have COLUMN_STATISTICS table, but MySQL 8+ client tools may try to query it
  // Adding this flag for both MySQL 8+ and MariaDB prevents compatibility errors
  if ((!isMariaDB && major >= 8) || isMariaDB) {
    flags.push("--skip-column-statistics");
  }

  // --no-tablespaces: Removed to prevent warnings in MariaDB
  // This flag is mainly for InnoDB tablespace exports
  // Standard WordPress installations don't need it

  return flags.join(" ");
};

// Verify database import was successful
const verifyImport = async (env, conn, expectedMinTables = 1) => {
  const { DB_HOST, DB_NAME, DB_USER, DB_PASSWORD, sudo } = getEnv(env);

  debugLog(`Verifying import for ${env}`, { DB_NAME, expectedMinTables });

  try {
    // Detect DB type for appropriate command
    let mysqlCmd = "mysql";
    try {
      const dbInfo = await getDbVersion(env, conn);
      mysqlCmd = getMysqlCommand(dbInfo);
    } catch (error) {
      debugLog(`Using default mysql command for verification`);
    }

    // Check table count
    const tableCountCmd = `${sudo}${mysqlCmd} -u${DB_USER} -h${DB_HOST}${askPass(
      env,
      DB_PASSWORD,
    )} ${DB_NAME} -e "SELECT COUNT(*) as table_count FROM information_schema.tables WHERE table_schema = '${DB_NAME}'" -s -N`;

    const runQuery = env === "local" ? runLocal : runRemote;
    const tableCountResult = await runQuery(
      { cmd: tableCountCmd, spinner: `Verifying import: checking table count` },
      conn,
    );

    const tableCount = parseInt(tableCountResult.trim());
    debugLog(
      `Import verification: ${tableCount} tables found (expected min: ${expectedMinTables})`,
    );

    if (tableCount < expectedMinTables) {
      log.warn(
        `⚠️  Import verification: Only ${tableCount} tables found (expected at least ${expectedMinTables})`,
      );
      return { success: false, tableCount, issue: "low_table_count" };
    }

    // Check database charset
    const charsetCmd = `${sudo}${mysqlCmd} -u${DB_USER} -h${DB_HOST}${askPass(
      env,
      DB_PASSWORD,
    )} ${DB_NAME} -e "SELECT DEFAULT_CHARACTER_SET_NAME, DEFAULT_COLLATION_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = '${DB_NAME}'" -s -N`;

    const charsetResult = await runQuery(
      { cmd: charsetCmd, spinner: `Verifying import: checking charset` },
      conn,
    );

    const [charset, collation] = charsetResult.trim().split("\t");
    debugLog(`Import verification: charset=${charset}, collation=${collation}`);

    if (charset !== "utf8mb4") {
      log.warn(`⚠️  Database charset is "${charset}" (expected "utf8mb4")`);
    }

    log.success(`✅ Import verified: ${tableCount} tables, charset=${charset}`);
    return { success: true, tableCount, charset, collation };
  } catch (error) {
    log.warn(`⚠️  Could not verify import: ${error.message}`);
    return { success: false, error: error.message };
  }
};

// Get error recovery suggestions based on error type
const getRecoverySuggestions = (error, operation = "operation") => {
  const errorMsg = error.message || error.toString();
  const suggestions = [];

  // Connection errors
  if (errorMsg.includes("ECONNREFUSED") || errorMsg.includes("connect")) {
    suggestions.push("• Check if database server is running");
    suggestions.push("• Verify DB_HOST and DB_PORT are correct in .env file");
    suggestions.push("• Check firewall settings");
  }

  // Authentication errors
  if (
    errorMsg.includes("Access denied") ||
    errorMsg.includes("authentication")
  ) {
    suggestions.push("• Verify DB_USER and DB_PASSWORD in .env file");
    suggestions.push("• Check database user permissions");
    suggestions.push("• Ensure user has access from this host");
  }

  // SSH connection errors
  if (errorMsg.includes("SSH") || errorMsg.includes("ENOTFOUND")) {
    suggestions.push(
      "• Check SSH_HOST, SSH_PORT, and SSH_USERNAME in .env file",
    );
    suggestions.push("• Verify SSH key exists and has correct permissions");
    suggestions.push("• Test SSH connection manually: ssh user@host");
  }

  // Database not found
  if (
    errorMsg.includes("Unknown database") ||
    errorMsg.includes("does not exist")
  ) {
    suggestions.push("• Verify DB_NAME in .env file");
    suggestions.push("• Check if database was created");
    suggestions.push(`• Run: yarn db:create --from <env>`);
  }

  // File/path errors
  if (errorMsg.includes("ENOENT") || errorMsg.includes("no such file")) {
    suggestions.push("• Check file path is correct");
    suggestions.push("• Verify .migrations directory exists");
    suggestions.push("• Ensure dump file was created successfully");
  }

  // Compression tool errors
  if (errorMsg.includes("pigz") || errorMsg.includes("gzip")) {
    suggestions.push("• Install compression tools: pigz or gzip");
    suggestions.push("• Try without compression: add --nocompress flag");
  }

  // mysqldump/mariadb-dump errors
  if (errorMsg.includes("mysqldump") || errorMsg.includes("mariadb-dump")) {
    suggestions.push("• Verify MySQL/MariaDB client tools are installed");
    suggestions.push("• Check if mariadb-dump/mysqldump is in PATH");
    suggestions.push("• Try running the command manually to test");
  }

  if (suggestions.length === 0) {
    suggestions.push(`• Review error message: ${errorMsg}`);
    suggestions.push("• Check logs with --debug flag for more details");
    suggestions.push("• Try dry-run first: add --dry-run flag");
  }

  return suggestions;
};

// Log error with recovery suggestions
const logErrorWithSuggestions = (error, operation) => {
  log.error(`${operation} failed: ${error.message}`);

  const suggestions = getRecoverySuggestions(error, operation);
  if (suggestions.length > 0) {
    log.info("\n💡 Recovery suggestions:");
    suggestions.forEach((suggestion) => log.info(suggestion));
  }
};

// ==================== ROLLBACK UTILITIES ====================

// List available backups from .migrations folder
const listBackups = async () => {
  const migrationsPath = cfg.path.migrations;

  try {
    await createLocalDir(migrationsPath);
    const files = await fs.readdir(migrationsPath);

    // Filter SQL dumps and get metadata
    const backups = await Promise.all(
      files
        .filter((file) => file.endsWith(".sql") || file.endsWith(".sql.gz"))
        .map(async (file) => {
          const filePath = `${migrationsPath}/${file}`;
          const stats = await fs.stat(filePath);

          // Parse filename: dump_[env]-[timestamp].sql(.gz)
          const match = file.match(/dump_([^-]+)-(.+)\.(sql(?:\.gz)?)$/);
          const env = match ? match[1] : "unknown";
          const timestamp = match ? match[2] : "";
          const compressed = file.endsWith(".gz");

          return {
            file,
            path: filePath,
            env,
            timestamp,
            size: stats.size,
            sizeFormatted: formatSize(stats.size),
            date: stats.mtime,
            compressed,
          };
        }),
    );

    // Sort by date (newest first)
    return backups.sort((a, b) => b.date - a.date);
  } catch (error) {
    throw new Error(`Failed to list backups: ${error.message}`);
  }
};

// Interactive backup selection
const selectBackup = async () => {
  const backups = await listBackups();

  if (backups.length === 0) {
    throw new Error("No backups found in .migrations folder");
  }

  log.info("\n📦 Available backups:\n");

  backups.forEach((backup, index) => {
    const dateStr = backup.date.toLocaleString("en-US", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });

    const compressTag = backup.compressed ? " [compressed]" : "";
    log.info(`  ${index + 1}. ${backup.file}`);
    log.info(`     Environment: ${backup.env}`);
    log.info(`     Date: ${dateStr}`);
    log.info(`     Size: ${backup.sizeFormatted}${compressTag}`);
    log.info("");
  });

  // Import readline for interactive selection
  const readline = await import("readline");
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve, reject) => {
    rl.question(
      `Select backup number (1-${backups.length}) or 0 to cancel: `,
      (answer) => {
        rl.close();

        const selection = parseInt(answer, 10);

        if (selection === 0) {
          reject(new Error("Rollback cancelled by user"));
          return;
        }

        if (isNaN(selection) || selection < 1 || selection > backups.length) {
          reject(
            new Error(
              `Invalid selection. Please enter a number between 1 and ${backups.length}`,
            ),
          );
          return;
        }

        resolve(backups[selection - 1]);
      },
    );
  });
};

// Rollback database to selected backup
const rollbackDB = async (
  targetEnv,
  selectedBackup = null,
  taskId = "default",
) => {
  log.info(`====== Rolling back ${targetEnv} database ======`);

  const { DB_HOST, DB_NAME } = getEnv(targetEnv);

  debugLog(`Rollback started`, {
    targetEnv,
    DB_NAME,
    DB_HOST,
    selectedBackup: selectedBackup?.file,
  });

  if (isDryRun()) {
    if (selectedBackup) {
      log.info(
        `[DRY RUN] Would rollback ${targetEnv} database from: ${selectedBackup.file}`,
      );
      log.info(`[DRY RUN] Backup environment: ${selectedBackup.env}`);
      log.info(`[DRY RUN] Backup size: ${selectedBackup.sizeFormatted}`);
    } else {
      log.info(`[DRY RUN] Would show backup selection menu`);
    }
    return;
  }

  let conn = null;

  try {
    // Select backup if not provided
    const backup = selectedBackup || (await selectBackup());

    log.info(`\n🔄 Rolling back to: ${backup.file}`);
    log.info(`   From environment: ${backup.env}`);
    log.info(`   Backup date: ${backup.date.toLocaleString()}`);
    log.info(`   Size: ${backup.sizeFormatted}\n`);

    // Confirm rollback
    const confirmed = await promptUser(
      `Are you sure you want to rollback "${DB_NAME}" at "${DB_HOST}" (${targetEnv}) with this backup?\nThis will DELETE all current data!`,
      taskId,
    );

    if (!confirmed) {
      log.warn("Rollback cancelled by user");
      return;
    }

    // Connect if remote
    if (targetEnv !== "local") {
      conn = await getPooledConnection(targetEnv);
    }

    // Set isPrompted to skip confirmation in createDB (we already confirmed)
    isPrompted = true;

    // Create database and import backup
    await createDB(targetEnv, backup.path, conn, taskId);

    log.success(`✅ Rollback completed successfully!`);
  } catch (error) {
    logErrorWithSuggestions(error, "Database rollback");
    throw error;
  } finally {
    if (conn) {
      await releaseConnection(targetEnv, conn);
    }
  }
};

// Stream local dump file directly to remote database
const streamLocalDumpToRemote = async (localDumpPath, env, conn) => {
  const { DB_HOST, DB_NAME, DB_USER, DB_PASSWORD } = getEnv(env);
  const isCompressed = localDumpPath.endsWith(".gz");

  debugLog(`Streaming local dump to remote database`, {
    localDumpPath,
    env,
    DB_NAME,
    DB_HOST,
    isCompressed,
  });

  return new Promise((resolve, reject) => {
    // Build mysql command on remote server with performance flags
    const mysqlCmd = buildImportCommand(env);

    debugLog(`Stream command`, { mysqlCmd });

    // Execute mysql on remote and pipe local file to it
    conn.exec(mysqlCmd, (err, stream) => {
      if (err) {
        reject(err);
        return;
      }

      const startTime = Date.now();
      let bytesRead = 0;
      let pipeFinished = false;
      let streamClosed = false;
      let exitCode = null;

      // Read local file
      const fileStream = fs.createReadStream(localDumpPath);

      // If compressed, decompress on the fly
      let inputStream = fileStream;
      if (isCompressed) {
        inputStream = fileStream.pipe(zlib.createGunzip());
      }

      // Track progress on file read
      fileStream.on("data", (chunk) => {
        bytesRead += chunk.length;
      });

      let stderr = "";
      let stdout = "";

      stream.stderr.on("data", (data) => {
        stderr += data.toString();
      });

      stream.stdout.on("data", (data) => {
        stdout += data.toString();
      });

      // Check if we can resolve
      const tryResolve = () => {
        if (pipeFinished && streamClosed) {
          const duration = ((Date.now() - startTime) / 1000).toFixed(2);
          const sizeMB = (bytesRead / (1024 * 1024)).toFixed(2);
          const speed = (bytesRead / (1024 * 1024) / (duration || 1)).toFixed(
            2,
          );

          debugLog(`Stream completed`, {
            exitCode,
            duration: `${duration}s`,
            size: `${sizeMB} MB`,
            speed: `${speed} MB/s`,
            hasStderr: stderr.length > 0,
          });

          if (exitCode === 0) {
            log.info(
              `📊 Streamed ${sizeMB} MB in ${duration}s (${speed} MB/s)`,
            );
            resolve();
          } else {
            const errorMsg = stderr || stdout || "Unknown error";
            reject(
              new Error(`Stream failed with code ${exitCode}: ${errorMsg}`),
            );
          }
        }
      };

      // Handle pipe finish
      inputStream.on("end", () => {
        debugLog(`Input stream ended`);
        pipeFinished = true;
        stream.stdin.end(); // Signal EOF to remote mysql
        tryResolve();
      });

      // Handle errors
      stream.on("error", (error) => {
        reject(error);
      });

      fileStream.on("error", (error) => {
        reject(new Error(`Failed to read dump file: ${error.message}`));
      });

      inputStream.on("error", (error) => {
        reject(new Error(`Stream processing error: ${error.message}`));
      });

      // Wait for stream to close
      stream.on("close", (code, signal) => {
        debugLog(`Stream closed`, { code, signal });
        exitCode = code;
        streamClosed = true;
        tryResolve();
      });

      // Pipe input to remote mysql stdin
      inputStream.pipe(stream.stdin, { end: false }); // Don't auto-end, we'll do it manually
    });
  });
};

// Create dump
const createDump = async (
  env,
  targetPath,
  conn,
  compressed = true,
  migrate = false,
) => {
  log.info(`====== Creating dump for ${env} database ======`);
  const { DB_HOST, DB_NAME, DB_USER, DB_PASSWORD, sudo } = getEnv(env);
  const runQuery = env === "local" ? runLocal : runRemote;

  debugLog(`CreateDump started`, { env, targetPath, compressed, migrate });

  try {
    if (env === "local" && migrate) {
      await createLocalDir(".migrations");
    }

    // Detect database version and build appropriate flags
    const dbInfo = await getDbVersion(env, conn);
    let dumpFlags = buildDumpFlags(dbInfo);
    const dumpCommand = getDumpCommand(dbInfo);

    // Probe if dump command supports --skip-column-statistics flag
    // (MariaDB client tools don't support this flag even though the server is MariaDB)
    if (dumpFlags.includes("--skip-column-statistics")) {
      try {
        let helpOutput;
        if (env === "local") {
          // For local, get help output and check if it contains the flag
          helpOutput = await runLocalSilent(`${sudo}${dumpCommand} --help`, {
            shell: true,
          });
        } else {
          // For remote, use runRemoteSilent
          helpOutput = await runRemoteSilent(
            `${sudo}${dumpCommand} --help`,
            conn,
          );
        }

        // Check if help output actually contains skip-column-statistics option
        if (helpOutput.includes("skip-column-statistics")) {
          debugLog(`${dumpCommand} supports --skip-column-statistics flag`);
        } else {
          throw new Error("Flag not found in help output");
        }
      } catch (err) {
        debugLog(
          `${dumpCommand} does not support --skip-column-statistics, removing flag`,
          { env, err: err.message },
        );
        dumpFlags = dumpFlags
          .replace("--skip-column-statistics", "")
          .replace(/\s+/g, " ")
          .trim();
      }
    }

    debugLog(`Dump configuration`, {
      command: dumpCommand,
      flags: dumpFlags,
      dbType: dbInfo.isMariaDB ? "MariaDB" : "MySQL",
      dbVersion: dbInfo.version,
    });

    if (compressed) {
      // Ultra-simple compression detection
      const compressionInfo =
        env === "local"
          ? await getGZtool("local")
          : getGZtoolInfo(env, conn) || (await getGZtool(env, conn));

      const dumpCmd = `${sudo}${dumpCommand} ${dumpFlags} -u${DB_USER}${askPass(
        env,
        DB_PASSWORD,
      )} -h${DB_HOST} ${DB_NAME} | ${
        compressionInfo.compressCmd
      } > "${targetPath}"`;

      await runQuery(
        {
          cmd: dumpCmd,
          spinner: `Creating compressed dump "${DB_NAME}" using ${compressionInfo.name}`,
        },
        conn,
      );

      // Verify dump file was created and is not empty
      if (env === "local") {
        const stats = await fs.stat(targetPath);
        if (stats.size === 0) {
          throw new Error(
            `Dump file is empty (0 bytes). Database "${DB_NAME}" may be empty or dump command failed.`,
          );
        }
        debugLog(`Dump file created: ${formatSize(stats.size)}`);
      }
    } else {
      const dumpCmd = `${sudo}${dumpCommand} ${dumpFlags} -u${DB_USER}${askPass(
        env,
        DB_PASSWORD,
      )} -h${DB_HOST} ${DB_NAME} > "${targetPath}"`;
      await runQuery(
        {
          cmd: dumpCmd,
          spinner: `Creating dump "${DB_NAME}" to ${targetPath}`,
        },
        conn,
      );

      // Verify dump file was created and is not empty
      if (env === "local") {
        const stats = await fs.stat(targetPath);
        if (stats.size === 0) {
          throw new Error(
            `Dump file is empty (0 bytes). Database "${DB_NAME}" may be empty or dump command failed.`,
          );
        }
        debugLog(`Dump file created: ${formatSize(stats.size)}`);
      }
    }
  } catch (error) {
    logErrorWithSuggestions(error, "Database dump creation");
    throw error;
  }
};

// Update urls in dump file for DB export/migration
const updateUrls = async (dump, source, target) => {
  log.info(`====== Updating url's from "${source}" to "${target}" ======`);

  const oldUrl = cfg.url[source];
  const newUrl = cfg.url[target];
  const isCompressed = dump.endsWith(".gz");
  const isDebug = getArgs().debug || false;

  // Get compression tool info for potential stream operations
  const compressionInfo = await getGZtool("local");

  // Create detailed log file only if debug mode is enabled
  let logStream = null;
  if (isDebug) {
    await createLocalDir(".migrations");
    const logFile = `${cfg.path.migrations}/changeurls.log`;
    logStream = fs.createWriteStream(logFile, { flags: "w" });

    // Log URL migration details to file
    const timestamp = new Date().toISOString();
    logStream.write(`URL REPLACEMENT LOG - ${timestamp}\n`);
    logStream.write(`${"=".repeat(80)}\n`);
    logStream.write(`Source: ${source} -> Target: ${target}\n`);
    logStream.write(`Old URL: "${oldUrl}" (${oldUrl.length} chars)\n`);
    logStream.write(`New URL: "${newUrl}" (${newUrl.length} chars)\n`);
  }

  // Console - only essential info
  log.info(`Old URL: "${oldUrl}" -> New URL: "${newUrl}"`);

  // Escape function for regex patterns
  const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  // Replacement counters
  let acfReplacements = 0;
  let urlReplacements = 0;
  let emailReplacements = 0;

  // ACF serialized link pattern (expanded to capture full URLs)
  const acfLinkRegex = new RegExp(
    `s:[1-9][0-9]{0,2}:\\\\"${escapeRegex(oldUrl)}[^"\\\\]*`,
    "g",
  );

  // URL replacement pattern that excludes email addresses
  const urlRegex = new RegExp(
    `(?<!@[\\w.-]*?)${escapeRegex(oldUrl)}(?!\\s*@)`,
    "g",
  );

  // Collection arrays for grouped logging (only in debug mode)
  const acfEntries = isDebug ? [] : null;
  const emailEntries = isDebug ? [] : null;

  const urlTransform = new Transform({
    objectMode: false,
    transform(chunk, encoding, callback) {
      let data = chunk.toString();

      // Extract domain from URLs for email handling
      const oldDomain = oldUrl.replace(/^https?:\/\//, "");
      const newDomain = newUrl.replace(/^https?:\/\//, "");

      // 1. First detect and log email addresses (but don't replace them)
      const emailOld = new RegExp(`@${escapeRegex(oldDomain)}`, "g");
      let match;
      while ((match = emailOld.exec(data)) !== null) {
        emailReplacements++;
        const newEmail = `@${newDomain}`;
        const offset = match.index;

        // Collect email data for grouped logging (only in debug mode)
        if (isDebug && emailEntries) {
          const beforeMatch = data.substring(Math.max(0, offset - 150), offset);
          const emailPrefixMatch = beforeMatch.match(/([a-zA-Z0-9._%+-]+)$/);
          const fullOldEmail = emailPrefixMatch
            ? emailPrefixMatch[1] + match[0]
            : "unknown" + match[0];
          const fullNewEmail = emailPrefixMatch
            ? emailPrefixMatch[1] + newEmail
            : "unknown" + newEmail;

          // Enhanced context detection using custom DB prefix
          let context = "";
          let tableInfo = "";
          let purpose = "";

          if (beforeMatch.includes(`${cfg.db.prefix}options`)) {
            tableInfo = `${cfg.db.prefix}options`;
            const optMatch = beforeMatch.match(/option_name[^']*'([^']+)'/);
            if (optMatch) purpose = `option: ${optMatch[1]}`;
          } else if (beforeMatch.includes(`${cfg.db.prefix}users`)) {
            tableInfo = `${cfg.db.prefix}users`;
            purpose = "user account";
          } else if (beforeMatch.includes(`${cfg.db.prefix}postmeta`)) {
            tableInfo = `${cfg.db.prefix}postmeta`;
            const metaMatch = beforeMatch.match(/meta_key[^']*'([^']+)'/);
            if (metaMatch) purpose = `meta: ${metaMatch[1]}`;
          } else if (beforeMatch.includes(`${cfg.db.prefix}posts`)) {
            tableInfo = `${cfg.db.prefix}posts`;
            purpose = "post content";
          }

          context = tableInfo ? ` | ${tableInfo}` : "";

          emailEntries.push({
            number: emailReplacements,
            context,
            purpose,
            oldEmail: fullOldEmail,
            newEmail: fullNewEmail,
          });
        }
      }

      // 2. Then handle ACF serialized links (expanded to capture full URLs)
      data = data.replace(acfLinkRegex, function (match) {
        acfReplacements++;

        // Extract the full URL from the match
        const urlMatch = match.match(/s:(\d+):\\"([^"\\]*)/);
        if (urlMatch) {
          // const oldLength = parseInt(urlMatch[1]);
          const fullOldUrl = urlMatch[2];

          // Replace old domain with new domain in the full URL
          const fullNewUrl = fullOldUrl.replace(oldUrl, newUrl);
          const newLength = fullNewUrl.length;
          const newMatch = `s:${newLength}:\\"${fullNewUrl}`;

          // Collect ACF data for grouped logging - only for entries with real field keys
          const dataContext = data.substring(
            Math.max(0, data.indexOf(match) - 2000),
            data.indexOf(match) + match.length + 1000,
          );

          // Extract field key with better pattern matching
          const fieldKeyMatch = dataContext.match(/field_[a-f0-9]{13}/g);
          const fieldKey = fieldKeyMatch
            ? fieldKeyMatch[fieldKeyMatch.length - 1]
            : null;

          // Collect ACF data for grouped logging (only in debug mode)
          if (isDebug && acfEntries && fieldKey) {
            acfEntries.push({
              number: acfReplacements,
              fieldKey,
              oldUrl: fullOldUrl,
              newUrl: fullNewUrl,
            });
          }

          return newMatch;
        }

        return match;
      });

      // 3. Then handle regular URL replacements (count only, no logging)
      data = data.replace(urlRegex, function (match) {
        urlReplacements++;
        return newUrl;
      });

      callback(null, data);
    },
  });

  try {
    spinner.start(
      `Changing url's from "${oldUrl}" to "${newUrl}"${
        isCompressed ? " (compressed)" : ""
      }`,
    );

    const tempFile = `${dump}.tmp`;

    // For stream operations in updateUrls, we'll still use zlib for reliability
    // but with a note that gz tool is used everywhere else
    if (isDebug) {
      log.info(
        `🔧 Stream processing: Using zlib for reliable stream operations`,
      );
      log.info(
        `💡 Note: ${compressionInfo.name} is used for all other compression operations`,
      );

      // OPTIMIZATION IDEAS (current implementation is already optimal):
      // 1. ✅ Already using streams (best approach)
      // 2. ✅ Already using high-performance zlib options
      // 3. 🤔 Could increase chunk size for larger files: highWaterMark: 128KB+
      // 4. 🤔 Could compile regex patterns once outside transform loop
      // 5. 🤔 Could use Worker threads for CPU-intensive regex on huge files
    }

    // Create input stream (decompress if needed)
    const inputStream = isCompressed
      ? fs.createReadStream(dump).pipe(zlib.createGunzip())
      : fs.createReadStream(dump, {
          encoding: "utf8",
          highWaterMark: 64 * 1024,
        });

    // Create output stream (compress if original was compressed)
    const outputStream = isCompressed
      ? zlib.createGzip(ZLIB_OPTIONS).pipe(fs.createWriteStream(tempFile))
      : fs.createWriteStream(tempFile, { encoding: "utf8" }); // Process the file
    if (isCompressed) {
      // For compressed files, ensure proper stream completion and verification
      const gzipStream = zlib.createGzip(ZLIB_OPTIONS);
      const writeStream = fs.createWriteStream(tempFile);

      // Handle the compression stream completion properly
      await pipeline(inputStream, urlTransform, gzipStream, writeStream);

      // Wait for file system to fully complete the write operation
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Verify the compressed file was written correctly
      try {
        const buffer = await fs.readFile(tempFile, {
          encoding: null,
          flag: "r",
        });
        const isProperlyCompressed =
          buffer.length >= 2 && buffer[0] === 0x1f && buffer[1] === 0x8b;

        if (isDebug) {
          log.info(
            `🔍 Temp file compression check: Size ${
              buffer.length
            } bytes, Magic: ${buffer[0]?.toString(16)} ${buffer[1]?.toString(
              16,
            )}`,
          );
        }

        if (!isProperlyCompressed) {
          if (isDebug) {
            log.warn(
              `⚠️  zlib stream didn't create proper gzip headers, using ${compressionInfo.name} instead`,
            );
          }

          // Fallback to gz tool compression using spawn with streams
          const tempGzFile = `${tempFile}.gz`;

          spinner.start(`Recompressing with ${compressionInfo.name}`);
          try {
            const compressProcess = spawn(compressionInfo.compressCmd, [], {
              stdio: ["pipe", "pipe", "inherit"],
            });

            // Pipe input file through compression to output file
            const inputStream = fs.createReadStream(tempFile);
            const outputStream = fs.createWriteStream(tempGzFile);

            inputStream.pipe(compressProcess.stdin);
            compressProcess.stdout.pipe(outputStream);

            // Wait for completion
            await new Promise((resolve, reject) => {
              outputStream.on("finish", resolve);
              outputStream.on("error", reject);
              compressProcess.on("error", reject);
              compressProcess.on("exit", (code) => {
                if (code !== 0 && code !== null) {
                  reject(
                    new Error(
                      `${compressionInfo.name} exited with code ${code}`,
                    ),
                  );
                }
              });
            });

            spinner.stop();
          } catch (pipeError) {
            spinner.stop();
            throw pipeError;
          }

          await fs.unlink(tempFile);
          await fs.rename(tempGzFile, tempFile);

          if (isDebug) {
            log.success(`✅ ${compressionInfo.name} compression completed`);
          }
        } else if (isDebug) {
          log.success(`✅ zlib compression verified`);
        }
      } catch (verifyError) {
        log.warn(
          `⚠️  Could not verify temp file compression: ${verifyError.message}`,
        );
      }
    } else {
      // For uncompressed files, simple pipeline
      await pipeline(inputStream, urlTransform, fs.createWriteStream(tempFile));
    }

    // Replace original file with temp file
    await fs.unlink(dump);
    await fs.rename(tempFile, dump);

    spinner.stop();

    // Write detailed log sections (only in debug mode)
    if (isDebug && logStream) {
      if (acfEntries && acfEntries.length > 0) {
        logStream.write(`\n${"=".repeat(80)}\n`);
        logStream.write(
          `ACF SERIALIZED FIELD REPLACEMENTS (${acfEntries.length} entries)\n`,
        );
        logStream.write(`${"=".repeat(80)}\n`);

        acfEntries.forEach((entry) => {
          logStream.write(
            `🔄 ACF #${entry.number}: ${entry.fieldKey} | ${entry.oldUrl} → ${entry.newUrl}\n`,
          );
        });
      }

      if (emailEntries && emailEntries.length > 0) {
        logStream.write(`\n${"=".repeat(80)}\n`);
        logStream.write(
          `EMAIL ADDRESSES DETECTED (${emailEntries.length} entries - NOT REPLACED)\n`,
        );
        logStream.write(`${"=".repeat(80)}\n`);

        emailEntries.forEach((entry) => {
          logStream.write(
            `📧 EMAIL DETECTED #${entry.number}${entry.context} (NOT REPLACED):\n`,
          );
          if (entry.purpose) {
            logStream.write(`   📋 Purpose: ${entry.purpose}\n`);
          }
          logStream.write(`   📍 FOUND: ${entry.oldEmail}\n`);
          logStream.write(`   💡 WOULD BECOME: ${entry.newEmail}\n\n`);
        });
      }

      // Close log file stream
      logStream.write(`\n${"=".repeat(80)}\n`);
      logStream.write(`FINAL SUMMARY:\n`);
      logStream.write(
        `Email Addresses: ${emailReplacements} detected (NOT REPLACED)\n`,
      );
      logStream.write(
        `ACF Serialized Links: ${acfReplacements} replacements (${
          acfEntries ? acfEntries.length : 0
        } with field keys logged)\n`,
      );
      logStream.write(`Regular URLs: ${urlReplacements} replacements\n`);
      logStream.write(
        `Total Replacements: ${acfReplacements + urlReplacements}\n`,
      );
      logStream.write(`${"=".repeat(80)}\n`);
      logStream.end();
    }

    // === CONSOLE SUMMARY (Essential Info Only) ===
    log.info("=".repeat(60));
    log.info("URL REPLACEMENT SUMMARY");
    log.info("=".repeat(60));

    if (emailReplacements > 0) {
      log.info(
        `📧 Email Addresses: ${emailReplacements} detected (NOT REPLACED)`,
      );
    }
    if (acfReplacements > 0) {
      log.info(`✅ ACF Serialized Links: ${acfReplacements} replacements`);
    }

    if (urlReplacements > 0) {
      log.info(`✅ Regular URLs: ${urlReplacements} replacements`);
    }

    const totalReplacements = acfReplacements + urlReplacements;
    log.info("=".repeat(60));
    log.info(`✅ COMPLETED: ${totalReplacements} total replacements`);
    if (isDebug) {
      log.info(`📄 Detailed log: .migrations/changeurls.log`);
    }
    log.info("=".repeat(60));
  } catch (error) {
    spinner.stop();
    logErrorWithSuggestions(error, "URL update");

    // Clean up temp file if it exists
    try {
      await fs.unlink(`${dump}.tmp`);
    } catch (cleanupError) {
      // Ignore cleanup errors
    }

    // Close log stream on error
    if (isDebug && logStream && !logStream.destroyed) {
      logStream.write(`\nERROR: ${error.message}\n`);
      logStream.end();
    }

    throw error;
  }
};

// Create DB
const createDB = async (
  env,
  dump,
  conn,
  noBackup = false,
  compressed = true,
  taskId = "default",
) => {
  log.info(`====== Creating ${env} database ======`);
  const { DB_HOST, DB_NAME, DB_USER, DB_PASSWORD, sudo } = getEnv(env);

  debugLog(`Create DB operation started`, {
    env,
    DB_NAME,
    DB_HOST,
    dump,
    compressed,
    noBackup,
  });

  // Split commands to handle errors better
  const dropCmd = `${sudo}mysql -u${DB_USER} -h${DB_HOST}${askPass(
    env,
    DB_PASSWORD,
  )} -e "DROP DATABASE IF EXISTS ${DB_NAME}"`;
  const createCmd = `${sudo}mysql -u${DB_USER} -h${DB_HOST}${askPass(
    env,
    DB_PASSWORD,
  )} -e "CREATE DATABASE IF NOT EXISTS ${DB_NAME} CHARACTER SET ${
    cfg.db.charset
  } COLLATE ${cfg.db.collate}"`;

  const runQuery = env === "local" ? runLocal : runRemote;

  try {
    const exists = await checkDB(env, conn);

    if (!isPrompted && exists) {
      const shouldProceed = await promptUser(
        `Database "${DB_NAME}" already exists at "${DB_HOST}" (${env}). Do you want to rewrite it?`,
        taskId,
      );
      if (!shouldProceed) {
        log.warn("DB creation cancelled by user");
        return;
      }
      if (!noBackup) {
        await backupDB(env, true, null, null, compressed, taskId);
      } else {
        log.info("Skipping backup (--nobackup flag specified)");
      }
    }

    isPrompted = true;

    if (isDryRun()) {
      log.info(`[DRY RUN] Would drop database "${DB_NAME}" if exists`);
      log.info(
        `[DRY RUN] Would create database "${DB_NAME}" with charset ${cfg.db.charset} collate ${cfg.db.collate}`,
      );
      if (dump) {
        log.info(`[DRY RUN] Would import dump: ${dump}`);
      }
      return;
    }

    // Execute commands separately for better error handling
    await runQuery(
      {
        cmd: dropCmd,
        spinner: `Dropping existing database "${DB_NAME}" if exists`,
        fallback: (err) => log.error(`Failed to drop database: ${err}`),
      },
      conn,
    );

    await runQuery(
      {
        cmd: createCmd,
        spinner: `Creating database "${DB_NAME}"`,
        fallback: (err) => log.error(`Failed to create database: ${err}`),
      },
      conn,
    );

    if (env === "local" && dump) {
      // Check if dump file exists before proceeding
      if (!fs.existsSync(dump)) {
        throw new Error(
          `Dump file "${dump}" does not exist. Cannot proceed with database import.`,
        );
      }

      // Import dump directly into the local database
      if (getArgs().debug) {
        log.info(`🔍 Importing dump: ${dump}`);
        log.info(`📁 File exists: ${fs.existsSync(dump)}`);
      }

      // Check if file is actually compressed by reading first few bytes
      let isActuallyCompressed = false;
      try {
        const buffer = await fs.readFile(dump, { encoding: null, flag: "r" });
        // Check for gzip magic number (1f 8b)
        isActuallyCompressed =
          buffer.length >= 2 && buffer[0] === 0x1f && buffer[1] === 0x8b;
      } catch (error) {
        throw new Error(`Could not read dump file "${dump}": ${error.message}`);
      }

      if (getArgs().debug) {
        log.info(
          `🗜️  File extension suggests compressed: ${dump.endsWith(".gz")}`,
        );
        log.info(`🔍 File is actually compressed: ${isActuallyCompressed}`);
      }

      if (isActuallyCompressed) {
        const compressionInfo = await getGZtool("local");
        if (getArgs().debug) {
          log.info(`🛠️  Compression tool: ${compressionInfo.name}`);
        }

        const importMethods = [
          {
            name: `${compressionInfo.name} pipe`,
            cmd: `${
              compressionInfo.decompressCmd
            } "${dump}" | ${buildImportCommand(env)}`,
          },
          {
            name: "gzip -dc pipe",
            cmd: `gzip -dc "${dump}" | ${buildImportCommand(env)}`,
          },
        ];

        let importSuccess = false;
        for (const method of importMethods) {
          try {
            if (getArgs().debug) {
              log.info(`🚀 Importing with: ${method.name}`);
              log.info(`⚡ Command: ${method.cmd}`);
            }
            await runLocal({
              cmd: method.cmd,
              spinner: `Importing database from ${dump}`,
            });
            log.success(`✅ ${method.name} succeeded!`);
            importSuccess = true;
            break;
          } catch (error) {
            log.warn(`❌ ${method.name} failed: ${error.message}`);
          }
        }

        if (!importSuccess) {
          throw new Error("All compressed import methods failed");
        }
      } else {
        // File is uncompressed, use direct import with PowerShell-compatible syntax
        if (getArgs().debug) {
          log.info(`🚀 Importing uncompressed file`);
          log.info(`⚡ Using PowerShell-compatible import method`);
        }

        try {
          // Use Get-Content for PowerShell compatibility
          const cmd = `Get-Content "${dump}" | ${buildImportCommand(env)}`;
          await runLocal({ cmd, spinner: `Importing database from ${dump}` });
          log.success(`✅ Uncompressed import succeeded!`);
        } catch (error) {
          log.warn(`❌ PowerShell method failed: ${error.message}`);

          // Fallback to type command for Windows
          try {
            const cmd = `type "${dump}" | ${buildImportCommand(env)}`;
            await runLocal({
              cmd,
              spinner: `Importing database from ${dump} (fallback)`,
            });
            log.success(`✅ Fallback import succeeded!`);
          } catch (fallbackError) {
            throw new Error(
              `Both PowerShell and CMD import methods failed: ${error.message}, ${fallbackError.message}`,
            );
          }
        }
      }

      // Verify import success by checking table count
      try {
        // Use cross-platform approach for counting tables
        const isWindows = process.platform === "win32";
        let checkCmd;

        if (isWindows) {
          // Windows: Use PowerShell to count lines
          checkCmd = `mysql -u${DB_USER} -h${DB_HOST} ${DB_NAME} -e "SHOW TABLES;" | powershell -command "($input | Measure-Object -Line).Lines"`;
        } else {
          // Unix/Linux: Use traditional wc -l
          checkCmd = `mysql -u${DB_USER} -h${DB_HOST} ${DB_NAME} -e "SHOW TABLES;" | wc -l`;
        }

        const result = await runLocal({
          cmd: checkCmd,
          spinner: "Verifying import success",
        });
        const tableCount = parseInt(result.trim()) - 1; // Subtract 1 for header

        if (getArgs().debug) {
          log.info(`📊 Database has ${tableCount} tables after import`);
        }

        if (tableCount > 0) {
          log.success(`✅ Database import verification successful!`);
        } else {
          log.warn(`⚠️  Database appears to be empty after import`);
        }
      } catch (verifyError) {
        log.warn(`⚠️  Could not verify import: ${verifyError.message}`);
      }
    } else if (dump) {
      // Remote import - stream directly without uploading file
      spinner.start(`Streaming dump to remote database "${DB_NAME}"`);

      try {
        await streamLocalDumpToRemote(dump, env, conn);
        spinner.stop();
        log.success(`Database "${DB_NAME}" imported successfully`);
      } catch (streamError) {
        spinner.stop(streamError.message);
        throw streamError;
      }

      // Verify import
      try {
        const verification = await verifyImport(env, conn, 1);
        if (verification.success) {
          const { tableCount, charset, collation } = verification;
          log.info(`📊 Database has ${tableCount} tables after import`);
          if (charset && collation) {
            log.info(`🔤 Character set: ${charset}, Collation: ${collation}`);
          }

          if (tableCount > 0) {
            log.success(`✅ Database import verification successful!`);
          } else {
            log.warn(`⚠️  Database appears to be empty after import`);
          }
        }
      } catch (verifyError) {
        log.warn(`⚠️  Could not verify import: ${verifyError.message}`);
      }
    }
  } catch (error) {
    logErrorWithSuggestions(error, "Database creation");
    throw error;
  }
};

// Update DB
const updateDB = async (env, dump, conn, taskId = "default") => {
  log.info(`====== Updating ${env} database ======`);
  const { DB_HOST, DB_NAME, DB_USER, DB_PASSWORD, sudo, SSH_PATH } =
    getEnv(env);
  const isCompressed = dump.endsWith(".gz");
  const baseSpinner = `Updating database "${DB_NAME}" at "${DB_HOST}" (${env})${
    isCompressed ? " (compressed)" : ""
  }`;

  debugLog(`Update DB operation started`, {
    env,
    DB_NAME,
    DB_HOST,
    dump,
    isCompressed,
  });

  if (isDryRun()) {
    log.info(
      `[DRY RUN] Would update database "${DB_NAME}" at "${DB_HOST}" (${env})`,
    );
    log.info(`[DRY RUN] Dump file: ${dump}`);
    log.info(`[DRY RUN] Compressed: ${isCompressed}`);
    return;
  }

  const proceed = async () => {
    if (env === "local" && isCompressed) {
      // Local compressed import - pipe directly using detected compression tool
      const compressionInfo = await getGZtool("local");

      // Try import methods with detected compression tool, then fallbacks
      const importMethods = [
        {
          name: `${compressionInfo.name} pipe`,
          cmd: `${compressionInfo.decompressCmd} "${dump}" | mysql -u${DB_USER} -h${DB_HOST} --default-character-set=utf8mb4 ${DB_NAME} --force`,
        },
        {
          name: "gzip -dc pipe",
          cmd: `gzip -dc "${dump}" | mysql -u${DB_USER} -h${DB_HOST} --default-character-set=utf8mb4 ${DB_NAME} --force`,
        },
      ];

      let importSuccess = false;
      for (const method of importMethods) {
        try {
          log.info(`Trying: ${method.name}`);
          await runLocal({
            cmd: method.cmd,
            spinner: `${baseSpinner} - ${method.name}`,
          });
          log.success(`${method.name} succeeded!`);
          importSuccess = true;
          break;
        } catch (error) {
          log.warn(`${method.name} failed: ${error.message}`);
        }
      }

      if (!importSuccess) {
        throw new Error("All local import methods failed");
      }
    } else if (env === "local") {
      // Local uncompressed import
      const cmd = `mysql -u${DB_USER} -h${DB_HOST} --default-character-set=utf8mb4 ${DB_NAME} --force < "${dump}"`;
      await runLocal({ cmd, spinner: baseSpinner });
    } else {
      // Remote import - ultra-simple compression detection
      if (isCompressed) {
        const compressionInfo =
          getGZtoolInfo(env, conn) || (await getGZtool(env, conn));

        // Try detected tool first, then fallbacks
        const importMethods = [
          {
            name: `${compressionInfo.name} pipe`,
            cmd: `${
              compressionInfo.decompressCmd
            } ${SSH_PATH}/${dump} | ${sudo}mysql -u${DB_USER} -h${DB_HOST}${askPass(
              env,
              DB_PASSWORD,
            )} --default-character-set=utf8mb4 ${DB_NAME} --force`,
          },
          {
            name: "gunzip pipe",
            cmd: `gunzip -c ${SSH_PATH}/${dump} | ${sudo}mysql -u${DB_USER} -h${DB_HOST}${askPass(
              env,
              DB_PASSWORD,
            )} --default-character-set=utf8mb4 ${DB_NAME} --force`,
          },
          {
            name: "zcat pipe",
            cmd: `zcat ${SSH_PATH}/${dump} | ${sudo}mysql -u${DB_USER} -h${DB_HOST}${askPass(
              env,
              DB_PASSWORD,
            )} --default-character-set=utf8mb4 ${DB_NAME} --force`,
          },
        ];

        let importSuccess = false;
        for (const method of importMethods) {
          try {
            await runRemote(
              {
                cmd: method.cmd,
                spinner: `Importing via ${method.name}`,
              },
              conn,
            );
            importSuccess = true;
            break;
          } catch (error) {
            log.warn(`${method.name} failed: ${error.message}`);
          }
        }

        if (!importSuccess) {
          throw new Error("All remote import methods failed");
        }
      } else {
        // Remote uncompressed import
        await runRemote(
          {
            cmd: `${sudo}mysql -u${DB_USER} -h${DB_HOST}${askPass(
              env,
              DB_PASSWORD,
            )} --default-character-set=utf8mb4 ${DB_NAME} --force < ${SSH_PATH}/${dump}`,
            spinner: baseSpinner,
          },
          conn,
        );
      }

      await removeRemoteFile(conn, `${SSH_PATH}/${dump}`);
    }
  };

  try {
    if (!isPrompted) {
      if (await checkDB(env, conn)) {
        const shouldProceed = await promptUser(
          `Database "${DB_NAME}" already exists at "${DB_HOST}" (${env}). Do you want to rewrite it?`,
          taskId,
        );
        if (!shouldProceed) {
          log.warn("DB update cancelled by user");
          return;
        }
      }
    }

    isPrompted = true;
    await proceed();

    // Verify import was successful
    try {
      const verification = await verifyImport(env, conn, 1);
      if (verification.success) {
        const { tableCount, charset, collation } = verification;
        log.info(`📊 Database has ${tableCount} tables after import`);
        if (charset && collation) {
          log.info(`🔤 Character set: ${charset}, Collation: ${collation}`);
        }

        if (tableCount > 0) {
          log.success(`✅ Database import verification successful!`);
        } else {
          log.warn(`⚠️  Database appears to be empty after import`);
        }
      }
    } catch (verifyError) {
      log.warn(`⚠️  Could not verify import: ${verifyError.message}`);
    }
  } catch (error) {
    logErrorWithSuggestions(error, "Database update");
    throw error;
  }
};

// Backup DB
const backupDB = async (
  env,
  save = false,
  dump,
  conn = null,
  compressed = true,
  taskId = "default",
) => {
  const { SSH_PATH } = getEnv(env);

  let currentConn = conn;
  let dumpName, dumpLocalPath;
  const extension = compressed ? ".sql.gz" : ".sql";

  debugLog(`Backup started`, { env, save, dump, compressed });

  if (env === "local") {
    if (save) {
      dumpName = dump ? dump : `dump_${env}-${getTimeStamp()}${extension}`;
      dumpLocalPath = `${cfg.path.migrations}/${dumpName}`;
    } else {
      dumpName = dump ? dump : `dump${extension}`;
      dumpLocalPath = dumpName;
    }
  } else {
    dumpName = dump ? dump : `dump_${env}-${getTimeStamp()}${extension}`;
    dumpLocalPath = `${cfg.path.migrations}/${dumpName}`;
    await createLocalDir(".migrations");
  }

  debugLog(`Backup file path`, { dumpName, dumpLocalPath });

  try {
    // Always validate database connection first
    if (env === "local") {
      const localExists = await checkDB(env, null);
      if (!localExists) {
        throw new Error(`Source database does not exist or is not accessible`);
      }
      await createDump(env, dumpLocalPath, null, compressed, save);
    } else {
      if (!conn) currentConn = await getPooledConnection(env);

      // Validate remote database and get version info in one query
      const { exists, versionInfo } = await checkDB(env, currentConn, {
        getVersionInfo: true,
      });
      if (!exists) {
        throw new Error(`Source database does not exist or is not accessible`);
      }

      let dumpFlags = buildDumpFlags(versionInfo);

      if (compressed) {
        // Ultra-simple compression detection for streaming
        const compressionInfo =
          getGZtoolInfo(env, currentConn) ||
          (await getGZtool(env, currentConn));

        const { DB_HOST, DB_NAME, DB_USER, DB_PASSWORD, sudo } = getEnv(env);
        const dumpCommand = getDumpCommand(versionInfo);

        // Verify dump command exists on remote server
        try {
          await runRemoteSilent(`which ${dumpCommand}`, currentConn);
          debugLog(`Verified ${dumpCommand} exists on remote server`);
        } catch (err) {
          // If mariadb-dump not found but this is MariaDB, try mysqldump as fallback
          if (versionInfo.isMariaDB && dumpCommand === "mariadb-dump") {
            log.warn(
              `⚠️  mariadb-dump not found, trying mysqldump as fallback`,
            );
            try {
              await runRemoteSilent(`which mysqldump`, currentConn);
              const fallbackCommand = "mysqldump";
              debugLog(`Using fallback: ${fallbackCommand}`);

              // For MariaDB using mysqldump, we need to adjust flags
              // Remove MariaDB-specific flags that mysqldump might not support
              dumpFlags = buildDumpFlags({ ...versionInfo, isMariaDB: false });

              const remoteCmd = `${sudo}${fallbackCommand} ${dumpFlags} -u${DB_USER}${askPass(
                env,
                DB_PASSWORD,
              )} -h${DB_HOST} ${DB_NAME} | ${compressionInfo.compressCmd}`;

              await streamRemoteToLocal(
                currentConn,
                remoteCmd,
                dumpLocalPath,
                `Streaming remote DB dump from ${env} (${compressionInfo.name}, using mysqldump fallback)`,
              );

              // Verify dump is not empty
              const stats = await fs.stat(dumpLocalPath);
              if (stats.size === 0) {
                throw new Error(
                  `Dump file is empty (0 bytes). Database may be empty or dump command failed.`,
                );
              }
              debugLog(`Dump file size: ${formatSize(stats.size)}`);
              return; // Exit early, dump completed with fallback
            } catch (fallbackErr) {
              throw new Error(
                `Neither mariadb-dump nor mysqldump found on remote server. Please install MySQL/MariaDB client tools.`,
              );
            }
          }
          throw new Error(
            `${dumpCommand} not found on remote server. Please install MySQL/MariaDB client tools.`,
          );
        }

        // Probe remote tool support for some flags (some remote mysqldump versions may not support them)
        if (dumpFlags.includes("--skip-column-statistics")) {
          try {
            await runRemoteSilent(
              `${dumpCommand} --skip-column-statistics --help`,
              currentConn,
            );
          } catch (err) {
            debugLog(
              `Remote does not support --skip-column-statistics, removing flag`,
              { env, err: err.message },
            );
            dumpFlags = dumpFlags
              .replace("--skip-column-statistics", "")
              .replace(/\s+/g, " ")
              .trim();
          }
        }

        const remoteCmd = `${sudo}${dumpCommand} ${dumpFlags} -u${DB_USER}${askPass(
          env,
          DB_PASSWORD,
        )} -h${DB_HOST} ${DB_NAME} | ${compressionInfo.compressCmd}`;

        await streamRemoteToLocal(
          currentConn,
          remoteCmd,
          dumpLocalPath,
          `Streaming remote DB dump from ${env} (${compressionInfo.name})`,
        );

        // Verify dump is not empty
        const stats = await fs.stat(dumpLocalPath);
        if (stats.size === 0) {
          throw new Error(
            `Dump file is empty (0 bytes). Database may be empty or dump command failed.`,
          );
        }
        debugLog(`Dump file size: ${formatSize(stats.size)}`);
      } else {
        // Uncompressed: stream raw dump
        const { DB_HOST, DB_NAME, DB_USER, DB_PASSWORD, sudo } = getEnv(env);
        const dumpCommand = getDumpCommand(versionInfo);

        // Probe and adjust flags for remote
        if (dumpFlags.includes("--skip-column-statistics")) {
          try {
            await runRemoteSilent(
              `${dumpCommand} --skip-column-statistics --help`,
              currentConn,
            );
          } catch (err) {
            debugLog(
              `Remote does not support --skip-column-statistics, removing flag`,
              { env, err: err.message },
            );
            dumpFlags = dumpFlags
              .replace("--skip-column-statistics", "")
              .replace(/\s+/g, " ")
              .trim();
          }
        }

        const remoteCmd = `${sudo}${dumpCommand} ${dumpFlags} -u${DB_USER}${askPass(
          env,
          DB_PASSWORD,
        )} -h${DB_HOST} ${DB_NAME}`;
        await streamRemoteToLocal(
          currentConn,
          remoteCmd,
          dumpLocalPath,
          `Streaming remote DB dump from ${env}`,
        );

        // Verify dump is not empty
        const stats = await fs.stat(dumpLocalPath);
        if (stats.size === 0) {
          throw new Error(
            `Dump file is empty (0 bytes). Database may be empty or dump command failed.`,
          );
        }
        debugLog(`Dump file size: ${formatSize(stats.size)}`);
      }
    }
  } catch (error) {
    // Let main task runner handle all error logging and notifications
    throw error;
  } finally {
    if (currentConn && !conn) await releaseConnection(env, currentConn);
  }
};

// Export DB to dump
const exportDB = async (
  srcEnv,
  targetEnv,
  compressed = true,
  taskId = "default",
) => {
  log.info(
    `====== Generating export DB dump from "${srcEnv}" to "${targetEnv}" ======`,
  );

  debugLog(`Export started`, { srcEnv, targetEnv, compressed });

  const extension = compressed ? ".sql.gz" : ".sql";
  const dumpName = `dump-export_${srcEnv}-to-${targetEnv}`;
  const uncompressedDump = `${cfg.path.migrations}/${dumpName}.sql`;
  const compressedDump = `${cfg.path.migrations}/${dumpName}.sql.gz`;
  const conn = srcEnv !== "local" ? await getPooledConnection(srcEnv) : null;

  // Get compression tool info
  const compressionInfo = await getGZtool("local");

  try {
    if (srcEnv === "local") {
      // Step 1: Create uncompressed dump
      await backupDB(srcEnv, true, `${dumpName}.sql`, null, false, "default");
      // Step 2: Update URLs
      await updateUrls(uncompressedDump, srcEnv, targetEnv);
      if (compressed) {
        // Step 3: Compress using gz tool first, fallback to zlib
        spinner.start(`Compressing SQL dump to ${compressedDump}`);
        try {
          // Try using gz tool with spawn and streams
          const compressProcess = spawn(compressionInfo.compressCmd, [], {
            stdio: ["pipe", "pipe", "inherit"],
          });

          // Pipe input file through compression to output file
          const inputStream = fs.createReadStream(uncompressedDump);
          const outputStream = fs.createWriteStream(compressedDump);

          inputStream.pipe(compressProcess.stdin);
          compressProcess.stdout.pipe(outputStream);

          // Wait for completion
          await new Promise((resolve, reject) => {
            outputStream.on("finish", resolve);
            outputStream.on("error", reject);
            compressProcess.on("error", reject);
            compressProcess.on("exit", (code) => {
              if (code !== 0 && code !== null) {
                reject(
                  new Error(`${compressionInfo.name} exited with code ${code}`),
                );
              }
            });
          });
        } catch (gzError) {
          log.warn(
            `⚠️  ${compressionInfo.name} compression failed, using zlib: ${gzError.message}`,
          );
          // Fallback to zlib compression
          try {
            await pipeline(
              fs.createReadStream(uncompressedDump),
              zlib.createGzip(ZLIB_OPTIONS),
              fs.createWriteStream(compressedDump),
            );
          } catch (compressErr) {
            log.error(`Compression failed: ${compressErr.message}`);
            throw compressErr;
          }
        } finally {
          spinner.stop();
        }
        // Step 4: Remove uncompressed file
        await fs.unlink(uncompressedDump);
      }
    } else {
      // Remote logic
      await backupDB(
        srcEnv,
        true,
        `${dumpName}${extension}`,
        conn,
        compressed,
        taskId,
      );
      await updateUrls(
        `${cfg.path.migrations}/${dumpName}${extension}`,
        srcEnv,
        targetEnv,
      );
    }
  } catch (error) {
    logErrorWithSuggestions(error, "Database export");
    throw error;
  } finally {
    if (conn) await releaseConnection(srcEnv, conn);
  }
};

// Migrate DB between environments
const migrateDB = async (
  srcEnv,
  targetEnv,
  noBackup = false,
  compressed = true,
  taskId = "default",
) => {
  log.info(`====== Migrating "${srcEnv}" to "${targetEnv}" ======`);

  debugLog(`Migration started`, { srcEnv, targetEnv, noBackup, compressed });

  if (isDryRun()) {
    log.info(
      `[DRY RUN] Would migrate database from "${srcEnv}" to "${targetEnv}"`,
    );
    log.info(
      `[DRY RUN] Source: ${getEnv(srcEnv).DB_NAME} @ ${getEnv(srcEnv).DB_HOST}`,
    );
    log.info(
      `[DRY RUN] Target: ${getEnv(targetEnv).DB_NAME} @ ${
        getEnv(targetEnv).DB_HOST
      }`,
    );
    log.info(`[DRY RUN] Backup before migration: ${!noBackup}`);
    log.info(`[DRY RUN] Compression: ${compressed}`);
    return;
  }

  const { DB_HOST: srcHost, DB_NAME: srcName } = getEnv(srcEnv);
  const {
    DB_HOST: targetHost,
    DB_NAME: targetName,
    SSH_PATH: targetPath,
  } = getEnv(targetEnv);
  let srcConn = srcEnv === "local" ? null : await getPooledConnection(srcEnv);
  let targetConn =
    targetEnv === "local" ? null : await getPooledConnection(targetEnv);
  const extension = compressed ? ".sql.gz" : ".sql";
  const dumpName = `dump-migrate_${srcEnv}-to-${targetEnv}`;
  const uncompressedDump = `${cfg.path.migrations}/${dumpName}.sql`;
  const compressedDump = `${cfg.path.migrations}/${dumpName}.sql.gz`;

  // Get compression tool info
  const compressionInfo = await getGZtool("local");

  const proceed = async () => {
    // Backup target DB first
    if (!noBackup) {
      await backupDB(targetEnv, true, false, targetConn, compressed, taskId);
    } else {
      log.info("Skipping target database backup (--nobackup flag specified)");
    }

    if (srcEnv === "local") {
      // Step 1: Create uncompressed dump
      await backupDB(srcEnv, true, `${dumpName}.sql`, null, false, taskId);
      // Step 2: Update URLs
      await updateUrls(uncompressedDump, srcEnv, targetEnv);

      if (compressed) {
        // Step 3: Compress using gz tool first, fallback to zlib
        spinner.start(`Compressing SQL dump to ${compressedDump}`);
        try {
          // Try using gz tool with spawn and streams
          const compressProcess = spawn(compressionInfo.compressCmd, [], {
            stdio: ["pipe", "pipe", "inherit"],
          });

          // Pipe input file through compression to output file
          const inputStream = fs.createReadStream(uncompressedDump);
          const outputStream = fs.createWriteStream(compressedDump);

          inputStream.pipe(compressProcess.stdin);
          compressProcess.stdout.pipe(outputStream);

          // Wait for completion
          await new Promise((resolve, reject) => {
            outputStream.on("finish", resolve);
            outputStream.on("error", reject);
            compressProcess.on("error", reject);
            compressProcess.on("exit", (code) => {
              if (code !== 0 && code !== null) {
                reject(
                  new Error(`${compressionInfo.name} exited with code ${code}`),
                );
              }
            });
          });
        } catch (gzError) {
          log.warn(
            `⚠️  ${compressionInfo.name} compression failed, using zlib: ${gzError.message}`,
          );
          // Fallback to zlib compression
          try {
            await pipeline(
              fs.createReadStream(uncompressedDump),
              zlib.createGzip(ZLIB_OPTIONS),
              fs.createWriteStream(compressedDump),
            );
          } catch (compressErr) {
            log.error(`Compression failed: ${compressErr.message}`);
            throw compressErr;
          }
        } finally {
          spinner.stop();
        }
        // Step 4: Remove uncompressed file
        await fs.unlink(uncompressedDump);
      }

      // Step 5: Update target DB
      const dumpToUse = compressed ? compressedDump : uncompressedDump;
      if (targetEnv === "local") {
        await createDB(targetEnv, dumpToUse, null, true, compressed, taskId);
      } else {
        await uploadFile(
          targetConn,
          dumpToUse,
          `${targetPath}/${dumpName}${compressed ? ".sql.gz" : ".sql"}`,
        );
        await updateDB(
          targetEnv,
          `${dumpName}${compressed ? ".sql.gz" : ".sql"}`,
          targetConn,
          taskId,
        );
      }
    } else {
      await backupDB(
        srcEnv,
        true,
        `${dumpName}${extension}`,
        srcConn,
        compressed,
        taskId,
      );
      await updateUrls(
        `${cfg.path.migrations}/${dumpName}${extension}`,
        srcEnv,
        targetEnv,
      );
      if (targetEnv === "local") {
        await createDB(
          targetEnv,
          `${cfg.path.migrations}/${dumpName}${extension}`,
          null,
          true,
          compressed,
          taskId,
        );
      } else {
        await uploadFile(
          targetConn,
          `${cfg.path.migrations}/${dumpName}${extension}`,
          `${targetPath}/${dumpName}${extension}`,
        );
        await updateDB(
          targetEnv,
          `${dumpName}${extension}`,
          targetConn,
          taskId,
        );
      }
    }
  };

  try {
    // Check source database first
    const srcExists = await checkDB(srcEnv, srcConn);
    if (!srcExists) {
      throw new Error(`Source database "${srcName}" not found at "${srcHost}"`);
    }

    // Check target database - if this fails due to credentials, don't proceed
    let targetExists;
    try {
      targetExists = await checkDB(targetEnv, targetConn);
    } catch (error) {
      // If we can't even check the target database, throw immediately
      throw error;
    }

    if (!targetExists) {
      log.info(
        `Target DB "${targetName}" does not exist at "${targetHost}". Creating it...`,
      );
      // Create the target database structure (without data)
      const { DB_HOST, DB_NAME, DB_USER, DB_PASSWORD, sudo } =
        getEnv(targetEnv);
      const createCmd = `${sudo}mysql -u${DB_USER} -h${DB_HOST}${askPass(
        targetEnv,
        DB_PASSWORD,
      )} -e "CREATE DATABASE IF NOT EXISTS ${DB_NAME} CHARACTER SET ${
        cfg.db.charset
      } COLLATE ${cfg.db.collate}"`;

      const runQuery = targetEnv === "local" ? runLocal : runRemote;
      await runQuery(
        {
          cmd: createCmd,
          spinner: `Creating target database "${DB_NAME}"`,
        },
        targetConn,
      );
    } else {
      const shouldProceed = await promptUser(
        `Target DB "${targetName}" already exists at "${targetHost}". Do you want to rewrite it?`,
        taskId,
      );
      if (!shouldProceed) {
        log.warn("DB migration cancelled by user");
        return;
      }
    }

    isPrompted = true;
    await proceed();
  } catch (error) {
    logErrorWithSuggestions(error, "Database migration");
    throw error;
  } finally {
    if (srcConn) await releaseConnection(srcEnv, srcConn);
    if (targetConn) await releaseConnection(targetEnv, targetConn);
  }
};

// Delete DB
const deleteDB = async (
  env,
  noBackup = false,
  compressed = true,
  taskId = "default",
) => {
  const { DB_HOST, DB_NAME, DB_USER, DB_PASSWORD, sudo } = getEnv(env);

  // Detect DB type to use appropriate command
  let mysqlCmd = "mysql";
  let conn = env !== "local" ? await getPooledConnection(env) : null;
  try {
    const dbInfo = await getDbVersion(env, conn);
    mysqlCmd = getMysqlCommand(dbInfo);
    debugLog(`Using ${mysqlCmd} command for deletion`);
  } catch (error) {
    debugLog(`Could not detect DB version for deletion: ${error.message}`);
  }

  const cmd = `${sudo}${mysqlCmd} -u${DB_USER} -h${DB_HOST}${askPass(
    env,
    DB_PASSWORD,
  )} -e"DROP DATABASE IF EXISTS ${DB_NAME};"`;
  const spinnerMsg = `Deleting database "${DB_NAME}" at "${DB_HOST}" (${env})`;
  const promptMsg = `Database "${DB_NAME}" at "${DB_HOST}" (${env}) will be deleted. \n  Are you sure?`;

  debugLog(`Delete operation initiated for ${env}`, {
    DB_NAME,
    DB_HOST,
    noBackup,
  });

  const proceed = async () => {
    if (isDryRun()) {
      log.info(
        `[DRY RUN] Would delete database "${DB_NAME}" at "${DB_HOST}" (${env})`,
      );
      log.info(`[DRY RUN] Command: ${cmd}`);
      return;
    }

    let conn = null;
    try {
      if (env === "local") {
        await runLocal({ cmd, spinner: spinnerMsg });
      } else {
        conn = await getPooledConnection(env);
        await runRemote({ cmd, spinner: spinnerMsg }, conn);
      }
    } catch (error) {
      logErrorWithSuggestions(error, "Database deletion");
      throw error;
    } finally {
      if (conn) await releaseConnection(env, conn);
    }
  };

  try {
    let conn = null;
    if (env !== "local") {
      conn = await getPooledConnection(env);
    }

    const exists = await checkDB(env, conn);
    if (!exists) {
      log.error(`Database "${DB_NAME}" does not exist at "${DB_HOST}"`);
      if (conn) await releaseConnection(env, conn);
      return;
    }

    const shouldProceed = await promptUser(promptMsg, taskId);
    if (!shouldProceed) {
      log.warn("DB deletion cancelled by user");
      if (conn) await releaseConnection(env, conn);
      return;
    }

    if (!noBackup) {
      await backupDB(env, true, null, conn, compressed, taskId);
    } else {
      log.info("Skipping backup before deletion (--nobackup flag specified)");
    }
    await proceed();

    if (conn) await releaseConnection(env, conn);
  } catch (error) {
    const errorMsg = `Database deletion failed: ${error.message}`;
    log.error(errorMsg);
    throw error;
  }
};

// Exported tasks
export const createDbTask = async () => {
  const taskId = "db:create";
  startTaskTimer(taskId);

  try {
    const args = getArgs();
    const target = args.target || "local";
    const noBackup = args.nobackup || false;
    const compressed = !args.nocompress;
    const dumpFile = compressed ? "dump.sql.gz" : "dump.sql";

    if (args.target) {
      await checkEnv([target]);
      await validateArgs(args);
    }

    await createDB(target, dumpFile, null, noBackup, compressed, taskId);

    const duration = stopTaskTimer(taskId);
    log.success(`Database create task completed in ${formatTime(duration)}`);
  } catch (error) {
    const duration = stopTaskTimer(taskId);
    log.error(
      `Database create task failed after ${formatTime(duration)}: ${
        error.message
      }`,
    );
    throw error;
  } finally {
    await closeAllConnections();
  }
};

export const updateDbTask = async () => {
  const taskId = "db:update";
  startTaskTimer(taskId);

  try {
    const args = getArgs();
    const target = args.target || "local";
    const compressed = !args.nocompress;
    const defaultDump = compressed ? "dump.sql.gz" : "dump.sql";
    const dumpFile = args.dump || defaultDump;

    await updateDB(target, dumpFile, null, taskId);

    const duration = stopTaskTimer(taskId);
    log.success(`Database update task completed in ${formatTime(duration)}`);
  } catch (error) {
    const duration = stopTaskTimer(taskId);
    log.error(
      `Database update task failed after ${formatTime(duration)}: ${
        error.message
      }`,
    );
    throw error;
  } finally {
    await closeAllConnections();
  }
};

export const backupDbTask = async () => {
  const taskId = "db:backup";
  startTaskTimer(taskId);

  try {
    const args = getArgs();
    const from = args.from || "local";
    const compressed = !args.nocompress;
    let save = args.save || false;

    if (args.from) {
      await checkEnv([from]);
      await validateArgs(args);
      save = true;
    }

    await backupDB(from, save, null, null, compressed, taskId);

    const duration = stopTaskTimer(taskId);
    log.success(`Database backup task completed in ${formatTime(duration)}`);
  } catch (error) {
    const duration = stopTaskTimer(taskId);
    log.error(
      `Database backup task failed after ${formatTime(duration)}: ${
        error.message
      }`,
    );
    throw error;
  } finally {
    await closeAllConnections();
  }
};

export const migrateDbTask = async () => {
  const taskId = "db:migrate";
  startTaskTimer(taskId);

  try {
    const args = getArgs();
    const from = args.from || "local";
    const to = args.to;
    const noBackup = args.nobackup || false;
    const compressed = !args.nocompress;

    await validateArgs(args, ["to"]);
    await checkEnv([from, to]);
    await migrateDB(from, to, noBackup, compressed, taskId);

    const duration = stopTaskTimer(taskId);
    log.success(`Database migrate task completed in ${formatTime(duration)}`);
  } catch (error) {
    const duration = stopTaskTimer(taskId);
    log.error(
      `Database migrate task failed after ${formatTime(duration)}: ${
        error.message
      }`,
    );
    throw error;
  } finally {
    await closeAllConnections();
  }
};

export const exportDbTask = async () => {
  const taskId = "db:export";
  startTaskTimer(taskId);

  try {
    const args = getArgs();
    const from = args.from || "local";
    const to = args.to;
    const compressed = !args.nocompress;

    await validateArgs(args, ["to"]);
    await checkEnv([from, to]);
    await exportDB(from, to, compressed, taskId);

    const duration = stopTaskTimer(taskId);
    log.success(`Database export task completed in ${formatTime(duration)}`);
  } catch (error) {
    const duration = stopTaskTimer(taskId);
    log.error(
      `Database export task failed after ${formatTime(duration)}: ${
        error.message
      }`,
    );
    throw error;
  } finally {
    await closeAllConnections();
  }
};

export const deleteDbTask = async () => {
  const taskId = "db:delete";
  startTaskTimer(taskId);

  try {
    const args = getArgs();
    const env = args.env || "local";
    const noBackup = args.nobackup || false;
    const compressed = !args.nocompress;

    await checkEnv([env]);
    await validateArgs(args);
    await deleteDB(env, noBackup, compressed, taskId);

    const duration = stopTaskTimer(taskId);
    log.success(`Database delete task completed in ${formatTime(duration)}`);
  } catch (error) {
    const duration = stopTaskTimer(taskId);
    log.error(
      `Database delete task failed after ${formatTime(duration)}: ${
        error.message
      }`,
    );
    throw error;
  } finally {
    await closeAllConnections();
  }
};

export const rollbackDbTask = async () => {
  const taskId = "db:rollback";
  startTaskTimer(taskId);

  try {
    const args = getArgs();
    const targetEnv = args.to;

    await validateArgs(args, ["to"]);
    await checkEnv([targetEnv]);
    await rollbackDB(targetEnv, null, taskId);

    const duration = stopTaskTimer(taskId);
    log.success(`Database rollback task completed in ${formatTime(duration)}`);
  } catch (error) {
    const duration = stopTaskTimer(taskId);
    log.error(
      `Database rollback task failed after ${formatTime(duration)}: ${
        error.message
      }`,
    );
    throw error;
  } finally {
    await closeAllConnections();
  }
};
