// .gulp/utils/remote.mjs
import {
  getEnv,
  formatTime,
  formatSize,
  logError,
  spinner,
  getGZtool,
  getGZtoolInfo,
} from "./common.mjs";
import pQueue from "p-queue";
import { promisify } from "util";
import fs from "fs-extra";
import path from "path";
import { Client } from "ssh2";
import { cpus } from "os";
import ftp from "basic-ftp";

const concurrency = cpus().length;

// Connect to SSH with automatic compression tool detection
export async function sshConnect(env, cb, options = {}) {
  const { SSH_HOST, SSH_PORT, SSH_USERNAME, SSH_KEYNAME, SSH_PASS } =
    getEnv(env);
  const conn = new Client();
  const connectConfig = {
    host: SSH_HOST,
    port: SSH_PORT,
    username: SSH_USERNAME,
    privateKey: SSH_KEYNAME
      ? fs.readFileSync(
          path.resolve(process.env.USERPROFILE, ".ssh", SSH_KEYNAME)
        )
      : undefined,
    password: SSH_PASS,
    compress: true,
    readyTimeout: 60000,
    keepaliveInterval: 30000,
    keepaliveCountMax: 5,
  };

  return new Promise(async (resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("Connection timeout"));
    }, 60000);

    function handleError(err) {
      cleanup();
      logError("SSH Connection Error", err);
      spinner.stop(`Failed to establish SSH connection: ${err.message}`);
      reject(err);
    }

    async function handleReady() {
      cleanup();
      spinner.stop();

      // Automatically detect compression tools after successful connection
      if (env !== "local" && !options.skipCompression) {
        try {
          const cached = getGZtoolInfo(env, conn);
          if (!cached) {
            await getGZtool(env, conn);
          }
        } catch (compressionError) {
          console.warn(
            `Warning: Compression detection failed: ${compressionError.message}`
          );
        }
      }

      if (typeof cb === "function") cb();
      resolve(conn);
    }

    function cleanup() {
      clearTimeout(timeout);
      conn.removeListener("ready", handleReady);
      conn.removeListener("error", handleError);
    }

    spinner.start(`Connecting to ${SSH_HOST}`);

    conn
      .once("ready", handleReady)
      .once("error", handleError)
      .connect(connectConfig);

    conn.on("error", (err) => {
      logError("SSH Error after connection", err);
    });
  });
}

// Disconnect from SSH
export async function sshDisconnect(conn, cb) {
  if (!conn) {
    if (typeof cb === "function") cb();
    return;
  }

  return new Promise((resolve, reject) => {
    spinner.start("Closing SSH connection: " + conn.config.host);

    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("SSH disconnection timed out"));
    }, 10000); // 10 seconds timeout

    const handleClose = () => {
      cleanup();
      spinner.stop();
      if (typeof cb === "function") cb();
      resolve();
    };

    const handleError = (err) => {
      cleanup();
      spinner.stop(`Error closing SSH connection: ${err.message}`);
      reject(err);
    };

    const cleanup = () => {
      clearTimeout(timeout);
      conn.removeListener("close", handleClose);
      conn.removeListener("error", handleError);
    };

    // Check if the connection is already closed
    if (conn.closed) {
      cleanup();
      handleClose();
      return;
    }

    conn.once("close", handleClose).once("error", handleError);

    // Try to end the connection, but don't throw if it fails
    try {
      conn.end();
    } catch (err) {
      handleError(err);
    }
  });
}

// Connect to FTP with spinner and configuration validation
export async function ftpConnect(env, cb, options = {}) {
  const creds = getEnv(env);

  // Validate required FTP configuration
  const requiredKeys = ["FTP_HOST", "FTP_USERNAME", "FTP_PASSWORD"];
  const missingKeys = requiredKeys.filter((key) => !creds[key]);

  if (missingKeys.length > 0) {
    const errorMsg = `Missing required FTP configuration for environment '${env}': ${missingKeys.join(
      ", "
    )}`;
    spinner.stop(errorMsg);
    throw new Error(errorMsg);
  }

  const client = new ftp.Client();

  // Use environment timeout or default
  const timeoutMs = creds.FTP_TIMEOUT
    ? parseInt(creds.FTP_TIMEOUT, 10)
    : options.timeout || 60000;

  // Set up verbose logging for debugging
  client.ftp.verbose = false; // Set to true for debugging if needed

  // Set up error handlers for connection monitoring
  client.ftp.socket?.on("error", (err) => {
    console.warn("FTP socket error:", err.message);
  });

  client.ftp.socket?.on("timeout", () => {
    console.warn("FTP socket timeout");
  });

  return new Promise(async (resolve, reject) => {
    let timeout;
    let finished = false;

    function cleanup() {
      if (timeout) clearTimeout(timeout);
      finished = true;
    }

    function handleError(err) {
      cleanup();
      spinner.stop(
        `Failed to establish FTP connection to ${creds.FTP_HOST}: ${err.message}`
      );
      reject(err);
    }

    function handleReady() {
      cleanup();
      spinner.stop();
      if (typeof cb === "function") cb();
      resolve({ client, creds });
    }

    spinner.start(`Connecting to FTP: ${creds.FTP_HOST}`);

    timeout = setTimeout(() => {
      if (!finished) {
        client.close();
        handleError(new Error("FTP connection timeout"));
      }
    }, timeoutMs);

    try {
      await client.access({
        host: creds.FTP_HOST,
        user: creds.FTP_USERNAME,
        password: creds.FTP_PASSWORD,
        port: creds.FTP_PORT ? parseInt(creds.FTP_PORT, 10) : 21,
        timeout: timeoutMs,
        secure: creds.FTP_SECURE,
        // Add connection stability options
        keepAlive: creds.FTP_KEEPALIVE === "true" || true,
        // Disable IPv6 to avoid dual-stack connection issues
        ipv6: false,
        // Set keep-alive interval
        keepAliveInterval: 30000, // 30 seconds
        // Prevent passive mode issues
        pasv: true,
        // Add retry options
        connTimeout: timeoutMs,
        pasvTimeout: timeoutMs,
        keepalive: true,
      });
      if (!finished) handleReady();
    } catch (err) {
      if (!finished) handleError(err);
    }
  });
}

// Run remote command
export async function runRemote(runner, conn, disconnectOnComplete = false) {
  return new Promise((resolve, reject) => {
    spinner.start(runner.spinner);
    conn.exec(runner.cmd, { cwd: runner.cwd || "." }, (err, stream) => {
      if (err) {
        spinner.stop(`Error: ${err.message}`);
        if (runner.fallback) runner.fallback(err);
        reject(err);
        return;
      }

      let stdout = "";
      let stderr = "";

      stream.on("data", (data) => {
        stdout += data.toString();
      });
      stream.stderr.on("data", (data) => {
        stderr += data.toString();
      });

      stream.on("close", async (code) => {
        spinner.stop();
        if (code !== 0) {
          // Clean up MySQL error messages
          let errorMsg = stderr.trim() || "Remote command execution failed";

          // Remove MySQL warnings and simplify error messages
          if (errorMsg.includes("mysql-client:")) {
            const lines = errorMsg.split("\n");
            const errorLine =
              lines.find((line) => line.includes("ERROR")) ||
              lines[lines.length - 1];
            errorMsg = errorLine.replace(/^.*ERROR \d+.*?: /, "MySQL Error: ");
          }

          const error = new Error(errorMsg);
          if (runner.fallback) await runner.fallback(error);
          reject(error);
        } else {
          if (runner.callback) await runner.callback(stdout.trim());
          resolve(stdout.trim());
        }
        if (disconnectOnComplete) {
          conn.end();
        }
      });
    });
  });
}

// Execute command without spinner
export async function runRemoteSilent(cmd, conn) {
  return new Promise((resolve, reject) => {
    if (!conn) {
      reject(new Error("Connection required for runRemoteSilent"));
      return;
    }

    conn.exec(cmd, (err, stream) => {
      if (err) {
        reject(err);
        return;
      }

      let stdout = "";
      let stderr = "";

      stream.on("data", (data) => {
        stdout += data.toString();
      });
      stream.stderr.on("data", (data) => {
        stderr += data.toString();
      });

      stream.on("close", (code) => {
        if (code !== 0) {
          // Clean up MySQL error messages for silent commands too
          let errorMsg = stderr.trim() || "Command failed";

          if (errorMsg.includes("mysql-client:")) {
            const lines = errorMsg.split("\n");
            const errorLine =
              lines.find((line) => line.includes("ERROR")) ||
              lines[lines.length - 1];
            errorMsg = errorLine.replace(/^.*ERROR \d+.*?: /, "MySQL Error: ");
          }

          reject(new Error(errorMsg));
        } else {
          resolve(stdout.trim());
        }
      });
    });
  });
}

// Helper function to get file size from remote command (useful for progress tracking)
export async function getRemoteFileSize(conn, filePath) {
  try {
    const result = await runRemoteSilent(
      `stat -c%s "${filePath}" 2>/dev/null || wc -c < "${filePath}"`,
      conn
    );
    return parseInt(result.trim(), 10);
  } catch (error) {
    return null; // Size unknown
  }
}

// Check available disk space on remote server
export async function checkRemoteDiskSpace(conn, requiredBytes, env) {
  try {
    const result = await runRemoteSilent(
      "df -B1 . | tail -1 | awk '{print $4}'",
      conn
    );
    const availableBytes = parseInt(result);

    if (isNaN(availableBytes)) {
      return {
        sufficient: true,
        warning: true,
        message: `Could not determine disk space on ${env}`,
      };
    }

    const requiredWithBuffer = requiredBytes * 2.1; // 110% buffer for extraction

    if (availableBytes < requiredWithBuffer) {
      return {
        sufficient: false,
        available: availableBytes,
        required: requiredWithBuffer,
        message: `Insufficient disk space: ${formatSize(
          availableBytes
        )} available, ${formatSize(requiredWithBuffer)} required`,
      };
    }

    return { sufficient: true, available: availableBytes };
  } catch (error) {
    return {
      sufficient: true,
      warning: true,
      message: `Could not check disk space: ${error.message}`,
    };
  }
}

// Get remote directory size in bytes
export async function getRemoteDirectorySize(conn, remotePath) {
  try {
    const result = await runRemoteSilent(
      `du -sb "${remotePath}" | cut -f1`,
      conn
    );
    const sizeBytes = parseInt(result);
    return isNaN(sizeBytes) ? 0 : sizeBytes;
  } catch (error) {
    return 0; // Return 0 to allow proceeding without size estimate
  }
}

// ===========================================================================================
// FILE SYSTEM FUNCTIONS
// ===========================================================================================

// Check if remote file exists
export async function checkIfRemoteExists(conn, dest) {
  return new Promise((resolve, reject) => {
    spinner.start(`Checking if "${dest}" exists`);

    conn.sftp((err, sftp) => {
      if (err) {
        spinner.stop(`Failed to start SFTP session: ${err.message}`);
        return reject(err);
      }

      sftp.lstat(dest, (err, stats) => {
        if (err) {
          if (err.code === 2 || err.code === "ENOENT") {
            spinner.stop();
            resolve(false);
          } else {
            spinner.stop(err);
            reject(err);
          }
        } else {
          spinner.stop();
          resolve(true);
        }
      });
    });
  });
}

// Check if FTP path exists (equivalent to checkIfRemoteExists for SSH)
export async function checkIfFtpExists(client, dest) {
  spinner.start(`Checking if "${dest}" exists`);

  try {
    await client.list(dest);
    spinner.stop();
    return true;
  } catch (err) {
    spinner.stop();
    // FTP error codes: 550 = file/directory not found
    if (
      err.code === 550 ||
      err.message.includes("No such file") ||
      err.message.includes("not found")
    ) {
      return false;
    } else {
      // Re-throw unexpected errors
      throw err;
    }
  }
}

// Create remote dir
export async function createRemoteDir(conn, remoteDirPath, cb) {
  const msg = `Creating remote directory ${remoteDirPath}`;
  return new Promise((resolve, reject) => {
    spinner.start(msg);

    conn.sftp(async (err, sftp) => {
      if (err) {
        spinner.stop(`${msg}. Failed to start SFTP session: ${err.message}`);
        return reject(err);
      }

      const mkdirRecursive = async (path) => {
        const parts = path.split("/").filter((p) => !!p);
        let current = "";
        for (let part of parts) {
          current += "/" + part;

          try {
            await new Promise((resolve, reject) => {
              sftp.stat(current, (err, stats) => {
                if (err || !stats.isDirectory()) {
                  sftp.mkdir(current, (err) => {
                    if (err) {
                      reject(err);
                    } else {
                      resolve();
                    }
                  });
                } else {
                  resolve();
                }
              });
            });
          } catch (err) {
            spinner.stop(
              `${msg}. Failed to create directory ${current}: \n   ${err.message}`
            );
            throw err;
          }
        }
      };

      try {
        await mkdirRecursive(remoteDirPath);
        spinner.stop();
        if (cb && typeof cb === "function") cb();
        resolve();
      } catch (err) {
        reject(err);
      }
    });
  });
}

// ===========================================================================================
// FILE TRANSFER FUNCTIONS
// ===========================================================================================

// Download remote file
export async function getRemoteFile(conn, src, target, cb, fb) {
  const startTime = Date.now();
  const msg = `Downloading ${src}`;
  spinner.start(msg);

  try {
    const sftp = await promisify(conn.sftp.bind(conn))();
    // Try fastGet first for optimal speed
    await new Promise((resolve, reject) => {
      sftp.fastGet(
        src,
        target,
        {
          step: (downloaded, chunk, total) => {
            const percentage = ((downloaded / total) * 100).toFixed(2);
            spinner.update(`${msg}: ${percentage}%`);
          },
        },
        (err) => {
          if (err) return reject(err);
          resolve();
        }
      );
    });
    const stats = await promisify(sftp.stat.bind(sftp))(src);
    const endTime = Date.now();
    const speed = stats.size / ((endTime - startTime) / 1000);
    spinner.update(`${msg}.
  Average speed: ${formatSize(speed)}/s`);
    spinner.stop();
    if (typeof cb === "function") cb();
  } catch (err) {
    // If fastGet fails, fallback to stream method
    try {
      const sftp = await promisify(conn.sftp.bind(conn))();
      const stats = await promisify(sftp.stat.bind(sftp))(src);
      const totalSize = stats.size;
      let downloadedBytes = 0;
      let lastLoggedPercentage = 0;
      const readStream = sftp.createReadStream(src, {
        highWaterMark: 1024 * 1024, // 1MB buffer for better performance
      });
      const writeStream = fs.createWriteStream(target);
      readStream.on("data", (chunk) => {
        downloadedBytes += chunk.length;
        const percentage = ((downloadedBytes / totalSize) * 100).toFixed(2);
        if (percentage - lastLoggedPercentage >= 1 || percentage === "100.00") {
          spinner.update(`${msg}: ${percentage}%`);
          lastLoggedPercentage = parseFloat(percentage);
        }
      });
      await new Promise((resolve, reject) => {
        readStream.on("error", reject);
        writeStream.on("error", reject);
        writeStream.on("finish", resolve);
        readStream.pipe(writeStream);
      });
      const endTime = Date.now();
      const speed = totalSize / ((endTime - startTime) / 1000);
      spinner.update(`${msg}.
  Average speed: ${formatSize(speed)}/s`);
      spinner.stop();
      if (typeof cb === "function") cb();
    } catch (fallbackErr) {
      const timeElapsed = formatTime(Date.now() - startTime);
      spinner.stop(`Failed after ${timeElapsed}: ${fallbackErr.message}`);
      logError("File Transfer Error", fallbackErr);
      if (typeof fb === "function") fb(fallbackErr);
      throw fallbackErr;
    }
  }
}

// Download multiple remote files at once and optionally sync (delete non-existing files/folders in target)
export async function getRemoteFiles(conn, src, target, sync = false, cb, fb) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    const msg = `Downloading files from ${src}`;
    spinner.start(msg);
    const queue = new pQueue({ concurrency });
    let totalFiles = 0;
    let totalFolders = 0;
    let totalDownloadedSize = 0;
    let totalDeletedFiles = 0;
    let totalDeletedFolders = 0;
    const syncedPaths = new Set();

    conn.sftp(async (err, sftp) => {
      if (err) {
        const timeElapsed = formatTime(Date.now() - startTime);
        spinner.stop(
          `Failed to start SFTP session after ${timeElapsed}: ${err.message}`
        );
        if (typeof fb === "function") fb(err);
        return reject(err);
      }

      const readdir = promisify(sftp.readdir).bind(sftp);
      const stat = promisify(sftp.stat).bind(sftp);
      const dirCache = new Set();

      async function ensureLocalDir(dir) {
        if (!dirCache.has(dir)) {
          await fs.ensureDir(dir);
          dirCache.add(dir);
          totalFolders++;
        }
      }

      async function downloadFile(remotePath, localPath) {
        await ensureLocalDir(path.dirname(localPath));
        return new Promise((resolveFile, rejectFile) => {
          const readStream = sftp.createReadStream(remotePath, {
            highWaterMark: 128 * 1024, // Increased buffer size
          });
          const writeStream = fs.createWriteStream(localPath);
          readStream.on("error", (err) => {
            writeStream.destroy();
            rejectFile(err);
          });
          writeStream.on("error", (err) => {
            readStream.destroy();
            rejectFile(err);
          });
          writeStream.on("finish", () => {
            resolveFile();
          });
          readStream.pipe(writeStream);
        });
      }

      async function processDirectory(remoteDir, localDir) {
        let files;
        try {
          files = await readdir(remoteDir);
        } catch (err) {
          spinner.stop(
            `${msg}. \nError reading directory ${remoteDir}: ${err.message}`
          );
          return;
        }

        const promises = files.map(async (file) => {
          const remoteFilePath = path.posix.join(remoteDir, file.filename);
          const localFilePath = path.join(localDir, file.filename);

          try {
            const stats = await stat(remoteFilePath);
            if (stats.isDirectory()) {
              syncedPaths.add(localFilePath);
              await ensureLocalDir(localFilePath);
              return processDirectory(remoteFilePath, localFilePath);
            } else {
              return queue.add(async () => {
                await downloadFile(remoteFilePath, localFilePath);
                syncedPaths.add(localFilePath);
                totalFiles++;
                totalDownloadedSize += stats.size;
                if ((totalFiles + totalFolders) % 10 === 0) {
                  spinner.update(
                    `${msg}. \n  Processed ${totalFolders} folders and ${totalFiles} files (${formatSize(
                      totalDownloadedSize
                    )})`
                  );
                }
              });
            }
          } catch (err) {
            console.error(`Error processing ${remoteFilePath}: ${err.message}`);
          }
        });

        await Promise.all(promises);
      }

      async function deleteNonExistingItems(dir) {
        const items = await fs.readdir(dir);

        for (const item of items) {
          const localPath = path.join(dir, item);

          if (!syncedPaths.has(localPath)) {
            const stat = await fs.stat(localPath);

            if (stat.isDirectory()) {
              await deleteNonExistingItems(localPath);
              await fs.rmdir(localPath);
              totalDeletedFolders++;
            } else {
              await fs.unlink(localPath);
              totalDeletedFiles++;
            }
          } else if ((await fs.stat(localPath)).isDirectory()) {
            await deleteNonExistingItems(localPath);
          }
        }
      }

      try {
        await processDirectory(src, target);
        await queue.onIdle();

        if (sync) {
          await deleteNonExistingItems(target);
        }

        const endTime = Date.now();
        const totalSeconds = (endTime - startTime) / 1000;
        const bytesPerSecond = totalDownloadedSize / totalSeconds;
        let statusMsg = `${msg}. \n  Processed ${totalFolders} folders and ${totalFiles} files (${formatSize(
          totalDownloadedSize
        )}). Average speed: ${formatSize(bytesPerSecond)}/s`;

        if (sync) {
          statusMsg += `. \n  Deleted ${totalDeletedFiles} files and ${totalDeletedFolders} folders`;
        }

        spinner.update(statusMsg);
        spinner.stop();
        if (typeof cb === "function") cb();
        resolve();
      } catch (err) {
        const timeElapsed = formatTime(Date.now() - startTime);
        spinner.stop(
          `${msg}. Failed to download files after ${timeElapsed}: ${err.message}`
        );
        if (typeof fb === "function") fb(err);
        reject(err);
      } finally {
        sftp.end();
      }
    });
  });
}

// Upload file
export async function uploadFile(conn, src, target, cb, fb) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    const msg = `Uploading ${src} to ${target}`;
    spinner.start(msg);

    fs.stat(src, (err, stats) => {
      if (err) {
        spinner.stop(`${msg}. Failed to retrieve file stats`);
        logError("File Stat Error", err);
        if (typeof fb === "function") fb(err);
        return reject(err);
      }
      const totalSize = stats.size;
      let transferredBytes = 0;
      conn.sftp((err, sftp) => {
        if (err) {
          spinner.stop(`${msg}. Failed to start SFTP session`);
          logError("SFTP Session Error", err);
          if (typeof fb === "function") fb(err);
          return reject(err);
        }
        const options = {
          step: (totalTransferred, chunk, total) => {
            transferredBytes = totalTransferred;
            const percentage = ((transferredBytes / totalSize) * 100).toFixed(
              2
            );
            spinner.update(`${msg}: ${percentage}%`);
          },
        };
        sftp.fastPut(src, target, options, (err) => {
          const endTime = Date.now();
          const timeElapsed = formatTime(endTime - startTime);
          if (err) {
            spinner.stop(`${msg}. Upload failed after ${timeElapsed}`);
            logError("Upload Error", err);
            if (typeof fb === "function") fb(err);
            reject(err);
          } else {
            spinner.stop();
            if (typeof cb === "function") cb();
            resolve();
          }
        });
      });
    });
  });
}

// Upload multiple files and folders with SFTP
export async function uploadFilesWithSFTP(
  conn,
  localSrc,
  remoteDest,
  excludedFiles = [],
  cb,
  fb
) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    let totalFiles = 0;
    let totalFolders = 0;
    let totalUploadedSize = 0;
    let totalDeletedFiles = 0;
    let totalDeletedFolders = 0;

    const msg = `Uploading files from ${localSrc} to ${remoteDest}`;
    spinner.start(msg);

    conn.sftp(async (err, sftp) => {
      if (err) {
        spinner.stop(`Failed to start SFTP session: ${err.message}`);
        if (typeof fb === "function") fb(err);
        return reject(err);
      }

      const readdir = promisify(fs.readdir);
      const lstat = promisify(fs.lstat);
      const remoteReaddir = promisify(sftp.readdir).bind(sftp);
      const remoteStat = promisify(sftp.stat).bind(sftp);
      const remoteMkdir = promisify(sftp.mkdir).bind(sftp);
      const remoteUnlink = promisify(sftp.unlink).bind(sftp);
      const remoteRmdir = promisify(sftp.rmdir).bind(sftp);

      const queue = new pQueue({ concurrency });

      const createdDirs = new Set();
      const uploadedPaths = new Set();

      async function ensureRemoteDir(dir) {
        if (createdDirs.has(dir)) return;

        const parts = dir.split("/").filter((p) => p);
        let currentDir = "";
        for (const part of parts) {
          currentDir += "/" + part;
          if (createdDirs.has(currentDir)) continue;

          try {
            await remoteStat(currentDir);
          } catch (error) {
            if (error.code === 2) {
              // ENOENT
              try {
                await remoteMkdir(currentDir);
                totalFolders++;
              } catch (mkdirError) {
                if (mkdirError.code !== 4) {
                  // Ignore "already exists" error
                  throw mkdirError;
                }
              }
            } else {
              throw error;
            }
          }
          createdDirs.add(currentDir);
        }
      }

      async function uploadFile(localSrcPath, remoteDestPath) {
        await ensureRemoteDir(path.posix.dirname(remoteDestPath));
        return new Promise((resolveFile, rejectFile) => {
          const readStream = fs.createReadStream(localSrcPath);
          const writeStream = sftp.createWriteStream(remoteDestPath);

          readStream.on("error", (err) => {
            writeStream.destroy();
            rejectFile(err);
          });

          writeStream.on("error", (err) => {
            readStream.destroy();
            rejectFile(err);
          });

          writeStream.on("close", resolveFile);

          readStream.pipe(writeStream);
        });
      }

      async function processDirectory(localSourceDir, remoteTargetDir) {
        try {
          const files = await readdir(localSourceDir);

          const tasks = files.map(async (file) => {
            if (excludedFiles.includes(file)) return;

            const localSourcePath = path.join(localSourceDir, file);
            const remoteTargetPath = path.posix.join(remoteTargetDir, file);

            try {
              const stats = await lstat(localSourcePath);
              if (stats.isDirectory()) {
                await ensureRemoteDir(remoteTargetPath);
                totalFolders++;
                uploadedPaths.add(remoteTargetPath);
                return processDirectory(localSourcePath, remoteTargetPath);
              } else {
                return queue.add(async () => {
                  await uploadFile(localSourcePath, remoteTargetPath);
                  totalFiles++;
                  totalUploadedSize += stats.size;
                  uploadedPaths.add(remoteTargetPath);
                  if (totalFiles % 50 === 0) {
                    spinner.update(
                      `${msg}. \n  Processed ${totalFolders} folders, ${totalFiles} files (${formatSize(
                        totalUploadedSize
                      )})`
                    );
                  }
                });
              }
            } catch (itemError) {
              console.error(`Error processing ${localSourcePath}:`, itemError);
            }
          });

          await Promise.all(tasks);
        } catch (error) {
          console.error(`Error processing directory ${localSourceDir}:`, error);
        }
      }

      async function deleteExtraItems(remoteDir) {
        const deletionQueue = new pQueue({ concurrency }); // Adjust concurrency as needed
        const dirsToDelete = [];

        spinner.update(
          `${msg}. \n  Scanning for extra files and folders to delete...`
        );

        let totalItemsToDelete = 0;
        let deletedItems = 0;

        async function processItem(remotePath, isDir) {
          if (!uploadedPaths.has(remotePath)) {
            totalItemsToDelete++;
            if (isDir) {
              dirsToDelete.push(remotePath);
            } else {
              await deletionQueue.add(async () => {
                try {
                  await remoteUnlink(remotePath);
                  totalDeletedFiles++;
                  deletedItems++;
                  updateDeleteProgress();
                } catch (deleteError) {
                  console.error(
                    `Error deleting file ${remotePath}:`,
                    deleteError
                  );
                }
              });
            }
          }
        }

        function updateDeleteProgress() {
          const progress = ((deletedItems / totalItemsToDelete) * 100).toFixed(
            2
          );
          spinner.update(
            `${msg}.\n  Deleting extra items: ${progress}% (${deletedItems}/${totalItemsToDelete})`
          );
        }

        async function traverseAndDelete(dir) {
          try {
            const files = await remoteReaddir(dir);

            const processTasks = files.map(async (file) => {
              const itemPath = path.posix.join(dir, file.filename);
              const isDir = file.attrs.isDirectory();
              await processItem(itemPath, isDir);

              if (isDir) {
                await traverseAndDelete(itemPath);
              }
            });

            await Promise.all(processTasks);
          } catch (error) {
            console.error(
              `Error processing directory for deletion ${dir}:`,
              error
            );
          }
        }

        await traverseAndDelete(remoteDir);
        await deletionQueue.onIdle();

        // Delete directories in reverse order (deepest first)
        for (const dir of dirsToDelete.reverse()) {
          try {
            await remoteRmdir(dir);
            totalDeletedFolders++;
            deletedItems++;
            updateDeleteProgress();
          } catch (rmdirError) {
            console.error(`Error deleting directory ${dir}:`, rmdirError);
          }
        }

        spinner.update(
          `${msg}.\n  Deleted ${totalDeletedFolders} folders and ${totalDeletedFiles} files`
        );
      }

      try {
        const srcStats = await lstat(localSrc);
        if (!srcStats.isDirectory()) {
          throw new Error(`Source path ${localSrc} is not a directory`);
        }

        await ensureRemoteDir(remoteDest);
        await processDirectory(localSrc, remoteDest);
        await queue.onIdle();

        // Delete extra items in target
        await deleteExtraItems(remoteDest);

        const endTime = Date.now();
        const timeElapsed = (endTime - startTime) / 1000; // in seconds
        const averageSpeed = totalUploadedSize / timeElapsed; // bytes per second

        spinner.update(
          `${msg}.\n  Processed ${totalFiles} files, ${totalFolders} folders (${formatSize(
            totalUploadedSize
          )}).\n` +
            `  Deleted ${totalDeletedFolders} folders, ${totalDeletedFiles} files.\n` +
            `  Average speed: ${formatSize(averageSpeed)}/s`
        );
        spinner.stop();
        if (typeof cb === "function") cb();
        resolve();
      } catch (err) {
        const timeElapsed = formatTime(Date.now() - startTime);
        spinner.stop(
          `${msg}. Failed to upload files after ${timeElapsed}: ${err.message}`
        );
        if (typeof fb === "function") fb(err);
        reject(err);
      } finally {
        sftp.end();
      }
    });
  });
}

// Stream remote command stdout to a local file
export async function streamRemoteToLocal(
  conn,
  remoteCmd,
  localPath,
  spinnerMsg = "Streaming remote data..."
) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    let bytesStreamed = 0;
    let lastUpdateTime = startTime;
    let lastBytesStreamed = 0;

    spinner.start(spinnerMsg);

    conn.exec(remoteCmd, (err, stream) => {
      if (err) {
        spinner.stop(`Error: ${err.message}`);
        return reject(err);
      }

      const writeStream = fs.createWriteStream(localPath);

      // Update progress every 500ms to avoid too frequent updates
      const progressInterval = setInterval(() => {
        const currentTime = Date.now();
        const timeDiff = (currentTime - lastUpdateTime) / 1000; // seconds
        const bytesDiff = bytesStreamed - lastBytesStreamed;
        const rate = timeDiff > 0 ? bytesDiff / timeDiff : 0;

        spinner.update(
          `${spinnerMsg} (${formatSize(bytesStreamed)} streamed, ${formatSize(
            rate
          )}/s)`
        );

        lastUpdateTime = currentTime;
        lastBytesStreamed = bytesStreamed;
      }, 500);

      stream.on("data", (data) => {
        bytesStreamed += data.length;
        writeStream.write(data);
      });

      // Capture stderr for error reporting
      let stderrData = "";
      stream.stderr.on("data", (data) => {
        stderrData += data.toString();
      });

      stream.on("close", (code) => {
        clearInterval(progressInterval);
        writeStream.end();

        const endTime = Date.now();
        const totalTime = (endTime - startTime) / 1000;
        const avgRate = totalTime > 0 ? bytesStreamed / totalTime : 0;

        if (code !== 0) {
          spinner.stop(`Remote command exited with code ${code}`);
          if (stderrData) {
            console.error("Command stderr:", stderrData);
          }
          return reject(
            new Error(
              `Remote command exited with code ${code}${
                stderrData ? ": " + stderrData : ""
              }`
            )
          );
        }

        // Warn if command succeeded but had stderr output (like warnings)
        if (stderrData && stderrData.trim() && bytesStreamed === 0) {
          console.warn("Command warning:", stderrData.trim());
        }

        // Final progress update
        spinner.update(
          `${spinnerMsg} completed. Total: ${formatSize(
            bytesStreamed
          )}, Average: ${formatSize(avgRate)}/s`
        );
        spinner.stop();
        resolve();
      });

      stream.on("error", (err) => {
        clearInterval(progressInterval);
        writeStream.end();
        spinner.stop(`Stream error: ${err.message}`);
        reject(err);
      });
    });
  });
}

// Remove remote file (safe version)
export async function removeRemoteFile(conn, remotePath, cb, fb) {
  const msg = `Removing ${remotePath}`;
  return new Promise((resolve) => {
    spinner.start(msg);
    conn.sftp((err, sftp) => {
      if (err) {
        spinner.stop(`${msg}. Failed to start SFTP session: ${err.message}`);
        console.log(`Failed to start SFTP session: ${err.message}`);
        if (fb && typeof fb === "function") fb();
        return resolve();
      }
      sftp.unlink(remotePath, (err) => {
        if (err) {
          if (err.code === "ENOENT") {
            spinner.stop();
            console.warn(`File ${remotePath} does not exist. No action taken.`);
          } else {
            spinner.stop(
              `${msg}. Failed to remove file ${remotePath}: ${err.message}`
            );
          }
          if (fb && typeof fb === "function") fb();
        } else {
          spinner.stop();
          if (cb && typeof cb === "function") cb();
        }
        resolve();
      });
    });
  });
}

// Remove remote files inside folder except folder and files in exceptions
export async function removeRemoteFiles(conn, remoteFolder, exceptions = []) {
  const msg = `Removing files in ${remoteFolder} (except ${exceptions.join(
    ", "
  )})`;

  try {
    spinner.start(msg);
    const sftp = await promisify(conn.sftp.bind(conn))();

    async function removeRecursively(path) {
      let files;
      try {
        files = await promisify(sftp.readdir.bind(sftp))(path);
      } catch (error) {
        console.error(`Error reading directory ${path}: ${error.message}`);
        return; // Skip this directory if we can't read it
      }

      for (const file of files) {
        const filePath = `${path}/${file.filename}`;
        if (exceptions.includes(file.filename)) continue;

        try {
          if (file.attrs.isDirectory()) {
            await removeRecursively(filePath);
            await promisify(sftp.rmdir.bind(sftp))(filePath);
          } else {
            await promisify(sftp.unlink.bind(sftp))(filePath);
          }
        } catch (error) {
          console.error(`Error removing ${filePath}: ${error.message}`);
        }
      }
    }

    await removeRecursively(remoteFolder);
    spinner.update(`${msg}. Completed successfully.`);
    spinner.stop();
  } catch (error) {
    spinner.stop(`${msg}. Failed: ${error.message}`);
    throw error;
  }
}

// ===========================================================================================
// SYNC FUNCTIONS
// ===========================================================================================

// Helper function to check rsync availability
export async function checkRsync(conn) {
  try {
    await runRemote(
      {
        cmd: "which rsync",
        spinner: "Checking rsync availability",
      },
      conn
    );
    return true;
  } catch (error) {
    return false;
  }
}

// Sync remote files and folders using rsync
export async function syncRemoteWithRsynс(
  conn,
  srcPath,
  targetPath,
  excludedFiles = []
) {
  try {
    const rsyncAvailable = await checkRsync(conn);
    if (!rsyncAvailable) {
      return false;
    }

    const excludeParams = excludedFiles
      .map((file) => `--exclude "${file}"`)
      .join(" ");
    const rsyncCommand = `rsync -avz --delete ${excludeParams} "${srcPath}/" "${targetPath}/"`;

    await runRemote(
      {
        cmd: `${conn.sudo ? "sudo " : ""}${rsyncCommand}`,
        spinner: `Using rsync to update ${targetPath} from ${srcPath}`,
      },
      conn
    );
    return true;
  } catch (error) {
    spinner.stop("Error during rsync:", error.message);
    return false;
  }
}

// Sync remote files and folders using sftp
export async function syncRemoteWithSFTP(
  conn,
  src,
  target,
  excludedFiles = [],
  cb,
  fb
) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    const msg = `Syncing files from ${src} to ${target}`;
    spinner.start(msg);
    let totalFiles = 0;
    let totalFolders = 0;
    let totalCopiedSize = 0;
    let totalDeletedFiles = 0;
    let totalDeletedFolders = 0;

    conn.sftp(async (err, sftp) => {
      if (err) {
        spinner.stop(`Failed to start SFTP session: ${err.message}`);
        if (typeof fb === "function") fb(err);
        return reject(err);
      }

      const readdir = promisify(sftp.readdir).bind(sftp);
      const stat = promisify(sftp.stat).bind(sftp);
      const mkdir = promisify(sftp.mkdir).bind(sftp);
      const unlink = promisify(sftp.unlink).bind(sftp);
      const rmdir = promisify(sftp.rmdir).bind(sftp);

      const queue = new pQueue({ concurrency });

      const createdDirs = new Set();
      const syncedPaths = new Set();

      async function ensureRemoteDir(dir) {
        if (createdDirs.has(dir)) return;

        const parts = dir.split("/").filter((p) => p);
        let currentDir = "";
        for (const part of parts) {
          currentDir += "/" + part;
          if (createdDirs.has(currentDir)) continue;

          try {
            await stat(currentDir);
          } catch (error) {
            if (error.code === 2) {
              // ENOENT
              try {
                await mkdir(currentDir);
                totalFolders++;
              } catch (mkdirError) {
                if (mkdirError.code !== 4) {
                  // Ignore "already exists" error
                  throw mkdirError;
                }
              }
            } else {
              throw error;
            }
          }
          createdDirs.add(currentDir);
        }
      }

      async function copyFile(remoteSrcPath, remoteDestPath) {
        await ensureRemoteDir(path.posix.dirname(remoteDestPath));
        return new Promise((resolveFile, rejectFile) => {
          const readStream = sftp.createReadStream(remoteSrcPath);
          const writeStream = sftp.createWriteStream(remoteDestPath);

          readStream.on("error", (err) => {
            writeStream.destroy();
            rejectFile(err);
          });

          writeStream.on("error", (err) => {
            readStream.destroy();
            rejectFile(err);
          });

          writeStream.on("close", resolveFile);

          readStream.pipe(writeStream);
        });
      }

      async function processDirectory(remoteSourceDir, remoteTargetDir) {
        try {
          const files = await readdir(remoteSourceDir);

          const tasks = files.map(async (file) => {
            if (excludedFiles.includes(file.filename)) return;

            const remoteSourcePath = path.posix.join(
              remoteSourceDir,
              file.filename
            );
            const remoteTargetPath = path.posix.join(
              remoteTargetDir,
              file.filename
            );

            try {
              const stats = await stat(remoteSourcePath);
              if (stats.isDirectory()) {
                await ensureRemoteDir(remoteTargetPath);
                totalFolders++;
                syncedPaths.add(remoteTargetPath);
                return processDirectory(remoteSourcePath, remoteTargetPath);
              } else {
                return queue.add(async () => {
                  await copyFile(remoteSourcePath, remoteTargetPath);
                  totalFiles++;
                  totalCopiedSize += stats.size;
                  syncedPaths.add(remoteTargetPath);
                  if (totalFiles % 50 === 0) {
                    spinner.update(
                      `${msg}. \nCopied ${totalFolders} folders, ${totalFiles} files (${formatSize(
                        totalCopiedSize
                      )})`
                    );
                  }
                });
              }
            } catch (itemError) {
              console.error(`Error processing ${remoteSourcePath}:`, itemError);
            }
          });

          await Promise.all(tasks);
        } catch (error) {
          console.error(
            `Error processing directory ${remoteSourceDir}:`,
            error
          );
        }
      }

      async function deleteExtraItems(remoteDir) {
        try {
          const files = await readdir(remoteDir);

          for (const file of files) {
            const remotePath = path.posix.join(remoteDir, file.filename);
            if (!syncedPaths.has(remotePath)) {
              try {
                const stats = await stat(remotePath);
                if (stats.isDirectory()) {
                  await deleteExtraItems(remotePath);
                  await rmdir(remotePath);
                  totalDeletedFolders++;
                } else {
                  await unlink(remotePath);
                  totalDeletedFiles++;
                }
              } catch (deleteError) {
                console.error(`Error deleting ${remotePath}:`, deleteError);
              }
            }
          }
        } catch (error) {
          console.error(
            `Error processing directory for deletion ${remoteDir}:`,
            error
          );
        }
      }

      try {
        const srcStats = await stat(src);
        if (!srcStats.isDirectory()) {
          throw new Error(`Source path ${src} is not a directory`);
        }

        await ensureRemoteDir(target);
        await processDirectory(src, target);
        await queue.onIdle();

        // Delete extra items in target
        await deleteExtraItems(target);

        spinner.update(
          `${msg}. \nCopied ${totalFiles} files, ${totalFolders} folders (${formatSize(
            totalCopiedSize
          )}). Deleted ${totalDeletedFiles} files, ${totalDeletedFolders} folders.`
        );
        spinner.stop();
        if (typeof cb === "function") cb();
        resolve();
      } catch (err) {
        const timeElapsed = formatTime(Date.now() - startTime);
        spinner.stop(
          `${msg}. Failed to sync files after ${timeElapsed}: ${err.message}`
        );
        if (typeof fb === "function") fb(err);
        reject(err);
      } finally {
        sftp.end();
      }
    });
  });
}
