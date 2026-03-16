import cfg from "../config.mjs";
import fs from "fs-extra";
import {
  runRemote,
  createRemoteDir,
  removeRemoteFile,
  removeRemoteFiles,
  uploadFile,
  getRemoteFile,
  getRemoteFiles,
  sshConnect,
  sshDisconnect,
  checkIfRemoteExists,
  checkIfFtpExists,
  checkRsync,
  syncRemoteWithRsynс,
  syncRemoteWithSFTP,
  uploadFilesWithSFTP,
  ftpConnect,
  streamRemoteToLocal,
  checkRemoteDiskSpace,
  getRemoteDirectorySize,
} from "../utils/remote.mjs";
import { createLocalDir, pack } from "../utils/local.mjs";
import {
  getEnv,
  checkEnv,
  getArgs,
  validateArgs,
  log,
  promptUser,
  getGZtool,
  getGZtoolInfo,
  spinner,
  formatSize,
  getTimeStamp,
  isRootPath,
  formatTime,
  startTaskTimer,
  stopTaskTimer,
} from "../utils/common.mjs";
import {
  getPooledConnection,
  releaseConnection,
  closeAllConnections,
} from "../utils/pool.mjs";
import path from "path";

// SECURITY FIX: Strict path validation to prevent system damage
const validateTargetPath = (targetPath, env) => {
  const dangerousPaths = [
    "/",
    "/home",
    "/usr",
    "/var",
    "/etc",
    "/bin",
    "/sbin",
    "/root",
    "/boot",
    "/lib",
    "/lib64",
    "/opt",
    "/srv",
    "/sys",
    "/proc",
  ];

  // Normalize path
  const normalizedPath = targetPath.replace(/\/+/g, "/").replace(/\/$/, "");

  // Check for dangerous system paths
  if (dangerousPaths.includes(normalizedPath)) {
    throw new Error(
      `CRITICAL SECURITY: Refusing to operate on system directory: ${targetPath}`
    );
  }

  // Must contain project-specific indicators (universal for any project)
  const safeIndicators = [
    cfg.siteName,
    "public_html",
    "www",
    "htdocs",
    "web",
    "staging",
    "production",
    "domains",
    "sites",
  ];
  const hasSafeIndicator = safeIndicators.some((indicator) =>
    normalizedPath.includes(indicator)
  );

  if (!hasSafeIndicator) {
    throw new Error(
      `CRITICAL SECURITY: Path doesn't contain expected project indicators: ${targetPath}`
    );
  }

  // Smart depth check: require at least 2 levels for web paths, 3 for others
  const pathParts = normalizedPath.split("/").filter((p) => p.length > 0);
  const isWebPath = ["public_html", "www", "htdocs", "web"].some((p) =>
    normalizedPath.includes(p)
  );
  const minDepth = isWebPath ? 2 : 3;

  if (pathParts.length < minDepth) {
    throw new Error(
      `CRITICAL SECURITY: Path too shallow for safety: ${targetPath} (depth: ${pathParts.length}, required: ${minDepth})`
    );
  }

  // Additional check: cannot contain certain dangerous patterns
  const dangerousPatterns = ["/..", "/../", "/./", "/tmp/", "/dev/"];
  if (dangerousPatterns.some((pattern) => normalizedPath.includes(pattern))) {
    throw new Error(
      `CRITICAL SECURITY: Path contains dangerous patterns: ${targetPath}`
    );
  }

  log.info(`✅ Path validation passed: ${normalizedPath}`);
  return normalizedPath;
};

// SECURITY FIX: Shell command sanitization
const escapeShellPath = (path) => {
  return path.replace(/(["\s'$`\\;|&<>()])/g, "\\$1");
};

// SECURITY FIX: Validate archive names to prevent path traversal
const validateArchiveName = (archiveName) => {
  // Must not contain path traversal or dangerous characters
  // Allow periods for file extensions but prevent path traversal patterns
  if (/[\/\\;|&<>$`]|\.\./.test(archiveName)) {
    throw new Error(
      `CRITICAL SECURITY: Invalid characters in archive name: ${archiveName}`
    );
  }

  // Must have expected extension
  if (!archiveName.match(/\.(tar\.gz|tar|tgz)$/)) {
    throw new Error(
      `CRITICAL SECURITY: Archive must have valid extension: ${archiveName}`
    );
  }

  return archiveName;
};

// Helper function for robust FTP operations with retry logic
const withFtpRetry = async (operation, client, env, maxRetries = 3) => {
  let attempts = 0;
  let currentClient = client;

  while (attempts < maxRetries) {
    try {
      return await operation(currentClient);
    } catch (error) {
      attempts++;

      if (
        error.code === "ECONNRESET" ||
        error.message.includes("Client is closed") ||
        currentClient.closed
      ) {
        if (attempts < maxRetries) {
          log.warn(
            `FTP operation failed (attempt ${attempts}/${maxRetries}), reconnecting...`
          );
          await new Promise((resolve) => setTimeout(resolve, 2000 * attempts)); // Exponential backoff

          try {
            const { client: newClient } = await ftpConnect(env, null, {
              timeout: 120000,
            });
            currentClient = newClient;
            // Update the original client reference
            Object.assign(client, newClient);
          } catch (reconnectError) {
            log.error(`Failed to reconnect: ${reconnectError.message}`);
            if (attempts === maxRetries) throw error;
          }
        } else {
          throw error;
        }
      } else {
        throw error; // Non-connection errors should fail immediately
      }
    }
  }
};

const preparePath = (env, src) => {
  const { SSH_PATH } = getEnv(env);
  const basePath = env === "local" ? cfg.path.base : SSH_PATH;

  // If src is empty or equal to cfg.path.base, return basePath
  if (!src || src === cfg.path.base) {
    return basePath;
  }

  // For local environment, if src is already a full path, return it as is
  if (
    env === "local" &&
    (src === cfg.path.base || src.startsWith(`${cfg.path.base}/`))
  ) {
    return src;
  }

  // Format the src path
  let formattedSrc = src;
  if (src.startsWith(cfg.path.base)) {
    formattedSrc = src.slice(cfg.path.base.length);
  }

  // Remove leading and trailing slashes
  formattedSrc = formattedSrc.replace(/^\/+|\/+$/g, "");

  // Join basePath and formattedSrc using forward slashes
  return `${basePath}/${formattedSrc}`.replace(/\/+/g, "/");
};

const prepareFtpPath = (env, src) => {
  const ftpConfig = getEnv(env);

  // Note: FTP configuration validation is now handled in ftpConnect()
  const { FTP_PATH } = ftpConfig;
  const basePath = FTP_PATH || "/"; // Default to root if FTP_PATH not set

  // If src is empty or equal to cfg.path.base, return basePath
  if (!src || src === cfg.path.base) {
    return basePath;
  }

  // Format the src path
  let formattedSrc = src;
  if (src.startsWith(cfg.path.base)) {
    formattedSrc = src.slice(cfg.path.base.length);
  }

  // Remove leading and trailing slashes
  formattedSrc = formattedSrc.replace(/^\/+|\/+$/g, "");

  // If formattedSrc is empty after processing, return basePath
  if (!formattedSrc) {
    return basePath;
  }

  // Join basePath and formattedSrc using forward slashes
  // Ensure basePath doesn't end with slash to avoid double slashes
  const cleanBasePath = basePath.replace(/\/+$/, "");
  const finalPath = `${cleanBasePath}/${formattedSrc}`.replace(/\/+/g, "/");

  // Ensure path starts with / for FTP
  return finalPath.startsWith("/") ? finalPath : `/${finalPath}`;
};

async function updateChmod(conn, targetPath, sudo, SSH_PATH, HTACCESS_MODIFY) {
  let cmd = `${sudo}find ${targetPath} -type f -print0 | xargs -0 chmod 644; ${sudo}find ${targetPath} -type d -print0 | xargs -0 chmod 755;`;
  let msg = "Updating chmod.";

  if (HTACCESS_MODIFY) {
    msg += "Rewriting rules in .htaccess";
    cmd += `${sudo}sed -i 's,RewriteBase /,RewriteBase /${cfg.siteName}/,g' ${SSH_PATH}/.htaccess;`;
    cmd += `${sudo}sed -i 's,RewriteRule . /index.php,RewriteRule . /${cfg.siteName}/index.php,g' ${SSH_PATH}/.htaccess`;
  }

  await runRemote(
    {
      cwd: SSH_PATH,
      cmd,
      spinner: msg,
    },
    conn
  );
}

// Unified backup function with streaming and FTP support
const backup = async (
  env,
  src,
  compress = false,
  useStreaming = true,
  useFTP = false
) => {
  log.info(`====== Creating ${env} backup ======`);
  const { SSH_PATH, sudo } = getEnv(env);

  const srcPath = preparePath(env, src);
  const timestamp = getTimeStamp();
  const archiveName = compress
    ? `${cfg.siteName}-${env}_${timestamp}.tar.gz`
    : `${cfg.siteName}-${env}_${timestamp}.tar`;
  const localTargetFolder = compress
    ? cfg.path.backup
    : `${cfg.path.backup}/${env}_${timestamp}`;
  const localArchivePath = `${localTargetFolder}/${archiveName}`;

  const localBackup = async () => {
    if (compress) {
      await pack(srcPath, localArchivePath, null);
    } else {
      await fs.copy(srcPath, localTargetFolder, { dereference: true });
    }
  };

  // Streaming method for remote compressed backups
  const streamRemoteArchive = async (conn) => {
    const compressionInfo =
      getGZtoolInfo(env, conn) || (await getGZtool(env, conn));

    // Common tar exclusions
    const baseExcludes = `--exclude=${archiveName} --exclude="*.tmp" --exclude=".DS_Store"`;
    const tarCmd = `${sudo}tar --hard-dereference --no-xattrs --no-acls --no-selinux --numeric-owner -C ${srcPath} ${baseExcludes} --xform s:'^./':: -cf - .`;

    let streamCmd;
    let finalArchivePath = localArchivePath;

    if (compress) {
      // Stream tar output through compression tool
      streamCmd = `cd ${SSH_PATH} && ${tarCmd} | ${compressionInfo.compressCmd}`;
    } else {
      // Stream uncompressed tar
      streamCmd = `cd ${SSH_PATH} && ${tarCmd}`;
      finalArchivePath = localArchivePath.replace(".gz", "");
    }

    // Stream directly to local file
    await streamRemoteToLocal(
      conn,
      streamCmd,
      finalArchivePath,
      `Streaming ${compress ? "compressed " : ""}archive from ${srcPath} (${
        compressionInfo.name
      })`
    );
  };

  // Traditional method for remote backups (fallback or when streaming disabled)
  const createRemoteArchive = async (conn) => {
    const compressionInfo =
      getGZtoolInfo(env, conn) || (await getGZtool(env, conn));

    const uncompressedTar = `${archiveName.replace(/\.gz$/, "")}`;
    const remoteUncompressedTar = `${SSH_PATH}/${uncompressedTar}`;
    const remoteArchivePath = `${SSH_PATH}/${archiveName}`;

    // Remove any existing tar files
    await runRemote(
      {
        cmd: `${sudo}rm -f ${remoteArchivePath} ${remoteUncompressedTar}`,
        spinner: "Cleaning up existing archive files",
      },
      conn
    );

    const tarCreateCmd = `${sudo}cd ${SSH_PATH} && ${sudo}tar --hard-dereference --no-xattrs --no-acls --no-selinux --numeric-owner -C ${srcPath} --exclude=${archiveName} --xform s:'^./':: -cf ${remoteUncompressedTar} .`;

    // Create uncompressed tar with retries
    const maxRetries = 3;
    let tarSuccess = false;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await runRemote(
          {
            cmd: tarCreateCmd,
            spinner: `Creating uncompressed tar of ${srcPath} (Attempt ${attempt})`,
          },
          conn
        );
        tarSuccess = true;
        break;
      } catch (error) {
        log.error(`Tar creation attempt ${attempt} failed: ${error.message}`);
        if (attempt < maxRetries) {
          log.info(`Retrying in 3 seconds...`);
          await new Promise((resolve) => setTimeout(resolve, 3000));
        }
      }
    }
    if (!tarSuccess) throw new Error("Maximum tar creation attempts reached");

    // Compress with detected tool if needed
    if (compress) {
      const finalCompressCmd = `${sudo}${compressionInfo.compressCmd} -f ${remoteUncompressedTar}`;
      await runRemote(
        {
          cmd: finalCompressCmd,
          spinner: `Compressing archive with ${compressionInfo.name}`,
        },
        conn
      );
    }

    // Download the archive
    const downloadPath = compress ? remoteArchivePath : remoteUncompressedTar;
    await getRemoteFile(conn, downloadPath, localArchivePath);

    // Clean up remote file
    await removeRemoteFile(conn, downloadPath);
  };

  // FTP backup method for downloading files via FTP
  const ftpBackup = async () => {
    const srcPath = prepareFtpPath(env, src);
    let client;
    let downloadedFiles = 0;
    let downloadedSize = 0;

    try {
      const { client: ftpClient } = await ftpConnect(env, null, {
        timeout: 120000,
      }); // Increase timeout to 2 minutes
      client = ftpClient;

      // Set up connection monitoring
      client.ftp.socket.on("error", (err) => {
        console.warn("FTP socket error:", err.message);
      });

      client.ftp.socket.on("close", () => {
        console.warn("FTP connection closed");
      });

      await createLocalDir(localTargetFolder);

      if (compress) {
        // For compressed FTP backup, download files and create local archive
        const tempFolder = `${localTargetFolder}/${env}-backup_${timestamp}`;
        await createLocalDir(tempFolder);

        // Start download with simple progress counting
        spinner.start("Downloading files...");
        const fileCount = { current: 0 };
        await downloadFtpRecursive(
          client,
          srcPath,
          tempFolder,
          0,
          () => {
            downloadedFiles++;
            if (downloadedFiles % 10 === 0 || downloadedFiles === 1) {
              // Update every 10 files to reduce overhead
              spinner.update(
                `Downloaded ${downloadedFiles} files (${formatSize(
                  downloadedSize
                )})`
              );
            }
          },
          (size) => {
            downloadedSize += size;
          },
          fileCount
        );

        spinner.stop();
        log.info(
          `Downloaded ${downloadedFiles} files (${formatSize(downloadedSize)})`
        );

        spinner.start("Creating compressed archive...");
        await pack(tempFolder, localArchivePath, null);
        spinner.stop();

        // Clean up temp folder
        await fs.remove(tempFolder);
        log.info("✅ Compressed FTP backup completed");
      } else {
        // For uncompressed backup, download directly to target folder
        spinner.start("Downloading files...");
        const fileCount = { current: 0 };
        await downloadFtpRecursive(
          client,
          srcPath,
          localTargetFolder,
          0,
          () => {
            downloadedFiles++;
            if (downloadedFiles % 10 === 0 || downloadedFiles === 1) {
              // Update every 10 files to reduce overhead
              spinner.update(
                `Downloaded ${downloadedFiles} files (${formatSize(
                  downloadedSize
                )})`
              );
            }
          },
          (size) => {
            downloadedSize += size;
          },
          fileCount
        );
        spinner.stop();
        log.info(
          `Downloaded ${downloadedFiles} files (${formatSize(downloadedSize)})`
        );
        log.info("✅ Uncompressed FTP backup completed");
      }
    } catch (error) {
      spinner.stop();
      const errorMsg = `FTP backup failed: ${error.message}`;
      log.error(errorMsg);
      throw error;
    } finally {
      if (client) {
        client.close();
      }
    }
  };

  // Helper function to download FTP directory recursively with retry logic
  const downloadFtpRecursive = async (
    client,
    remotePath,
    localPath,
    depth = 0,
    onFileComplete = null,
    onSizeUpdate = null,
    fileCount = { current: 0 }
  ) => {
    const maxDepth = 20; // Prevent infinite recursion

    if (depth > maxDepth) {
      log.warn(`Maximum recursion depth reached for path: ${remotePath}`);
      return;
    }

    try {
      // Ensure local directory exists
      await fs.ensureDir(localPath);

      // List remote directory contents with retry
      let list;
      list = await withFtpRetry(
        async (c) => await c.list(remotePath),
        client,
        env
      );

      for (const item of list) {
        const remoteItemPath = `${remotePath}/${item.name}`.replace(
          /\/+/g,
          "/"
        );
        const localItemPath = path.join(localPath, item.name);

        if (item.isDirectory) {
          // Recursively download subdirectory
          await downloadFtpRecursive(
            client,
            remoteItemPath,
            localItemPath,
            depth + 1,
            onFileComplete,
            onSizeUpdate,
            fileCount
          );
        } else {
          // Download file with progress and retry logic using the helper
          try {
            await withFtpRetry(
              async (c) => await c.downloadTo(localItemPath, remoteItemPath),
              client,
              env
            );

            // Update progress counters
            if (onFileComplete) onFileComplete();
            if (onSizeUpdate) onSizeUpdate(item.size || 0);

            // Add small delay to prevent overwhelming the server
            fileCount.current++;
            if (fileCount.current % 5 === 0) {
              await new Promise((resolve) => setTimeout(resolve, 100)); // 100ms pause every 5 files
            }
          } catch (downloadError) {
            log.warn(
              `Failed to download ${remoteItemPath}: ${downloadError.message}`
            );
          }
        }
      }
    } catch (error) {
      if (
        error.code === 550 ||
        error.message.includes("No such file") ||
        error.message.includes("not found")
      ) {
        log.warn(`FTP path not found: ${remotePath}`);
      } else {
        console.error(`Error accessing FTP path ${remotePath}:`, error);
      }
    }
  };

  // Remote backup method for SSH connections
  const remoteBackup = async () => {
    const conn = await sshConnect(env);

    try {
      await createLocalDir(localTargetFolder);

      if (!compress) {
        // For uncompressed backup, decide between streaming or file-by-file
        if (useStreaming) {
          try {
            await streamRemoteArchive(conn);
            log.info("✅ Uncompressed backup completed using streaming method");
          } catch (streamError) {
            log.warn(`Streaming method failed: ${streamError.message}`);
            log.info("Falling back to file-by-file method...");
            await getRemoteFiles(conn, srcPath, localTargetFolder);
            log.info("✅ Backup completed using file-by-file method");
          }
        } else {
          // Direct file-by-file copy
          await getRemoteFiles(conn, srcPath, localTargetFolder);
          log.info("✅ Backup completed using file-by-file method");
        }
      } else {
        // For compressed backup, decide between streaming or traditional archive method
        if (useStreaming) {
          try {
            await streamRemoteArchive(conn);
            log.info("✅ Compressed backup completed using streaming method");
          } catch (streamError) {
            log.warn(`Streaming method failed: ${streamError.message}`);
            log.info("Falling back to traditional archive method...");
            await createRemoteArchive(conn);
            log.info("✅ Backup completed using traditional archive method");
          }
        } else {
          // Use traditional create→download→delete method
          log.info("Using traditional archive method (streaming disabled)");
          await createRemoteArchive(conn);
          log.info("✅ Backup completed using traditional archive method");
        }
      }
    } finally {
      await sshDisconnect(conn);
    }
  };

  // Main backup logic
  try {
    if (env === "local") {
      await localBackup();
      log.info("✅ Local backup completed");
    } else if (useFTP) {
      await ftpBackup();
    } else {
      await remoteBackup();
    }
  } catch (error) {
    const errorMsg = `Backup failed: ${error.message}`;
    log.error(errorMsg);
    throw error;
  }
};

// Deploy to remote with SFTP
const deploySFTP = async (env, src, compress = false) => {
  log.info(`====== Deploying to ${env} ======`);
  const { sudo, SSH_PATH, HTACCESS_MODIFY } = getEnv(env);

  // Prevent overwriting root/home directories
  if (isRootPath(SSH_PATH)) {
    log.error(
      `Invalid path for remote target: ${SSH_PATH} - appears to be a root/home directory`
    );
    return;
  }

  const archiveName = `${cfg.siteName}-deploy.tar.gz`;
  const srcPath = preparePath("local", src);
  const targetPath = preparePath(env, src);
  const localArchivePath = `${cfg.path.backup}/${archiveName}`;
  const remoteArchivePath = `${targetPath}/${archiveName}`;
  const envFileSrc = `.env.${env}`;
  const excludedFiles = [".git", "node_modules"];

  let conn;

  async function startDeploy() {
    try {
      if (compress) {
        // SECURITY: Validate paths before any destructive operations
        const validatedTargetPath = validateTargetPath(targetPath, env);
        const validatedArchiveName = validateArchiveName(archiveName);
        const escapedTargetPath = escapeShellPath(validatedTargetPath);
        const escapedArchiveName = escapeShellPath(validatedArchiveName);

        // Create & upload the archive
        await pack(srcPath, localArchivePath, null);
        await uploadFile(conn, localArchivePath, remoteArchivePath);

        // SECURITY FIX: Safe removal with extensive validation
        try {
          // Double-check we're in the right directory before deletion
          const targetExists = await checkIfRemoteExists(
            conn,
            validatedTargetPath
          );
          if (!targetExists) {
            throw new Error(
              `Target path does not exist: ${validatedTargetPath}`
            );
          }

          // SECURITY: Use safer deletion method with explicit path validation
          const safeDeleteCmd = `${sudo}cd "${escapedTargetPath}" && ${sudo}find . -mindepth 1 -maxdepth 1 -not -name "${escapedArchiveName}" -print0 | ${sudo}xargs -0 rm -rf`;

          await runRemote(
            {
              cwd: SSH_PATH,
              cmd: safeDeleteCmd,
              spinner: `Safely removing files in ${validatedTargetPath} except "${validatedArchiveName}"`,
              fallback: async () => {
                log.info(`Shell command failed, falling back to SFTP method.`);
                await removeRemoteFiles(conn, validatedTargetPath, [
                  validatedArchiveName,
                ]);
              },
            },
            conn
          );
        } catch (error) {
          log.error("Error during deployment cleanup:", error.message);
          throw error; // Don't continue if cleanup fails
        }

        // SECURITY: Validate archive before extraction
        await runRemote(
          {
            cwd: SSH_PATH,
            cmd: `${sudo}tar -tf ${escapeShellPath(
              remoteArchivePath
            )} > /dev/null`,
            spinner: `Validating archive integrity`,
          },
          conn
        );

        // Unpack & remove the archive
        await runRemote(
          {
            cwd: SSH_PATH,
            cmd: `${sudo}tar -xf ${escapeShellPath(
              remoteArchivePath
            )} -C ${escapedTargetPath}; ${sudo}rm -rf ${escapeShellPath(
              remoteArchivePath
            )}`,
            spinner: `Unpacking ${validatedArchiveName} (autoremove after success)`,
          },
          conn
        );
      } else {
        // SECURITY: Validate target path for non-compressed deployments too
        const validatedTargetPath = validateTargetPath(targetPath, env);
        await uploadFilesWithSFTP(
          conn,
          srcPath,
          validatedTargetPath,
          excludedFiles
        );
      }

      // Copy env for full app upload
      if (src === cfg.path.base || src === "") {
        await uploadFile(conn, envFileSrc, `${SSH_PATH}/.env`);
      }

      // Update chmod & modify htaccess if needed
      await updateChmod(conn, targetPath, sudo, SSH_PATH, HTACCESS_MODIFY);
    } catch (error) {
      const errorMsg = `SFTP deployment failed: ${error.message}`;
      log.error(errorMsg);
      throw error;
    }
  }

  try {
    const srcExists = await fs.pathExists(srcPath);

    if (!srcExists) {
      throw new Error("Source path does not exist");
    }

    conn = await sshConnect(env);
    const exists = await checkIfRemoteExists(conn, targetPath);

    if (exists) {
      const shouldProceed = await promptUser(
        `Everything on existing path will be overwritten: "${targetPath}" \n  Are you sure?`,
        "deploy"
      );
      if (!shouldProceed) {
        log.warn("Deployment cancelled by user");
        return;
      }
    } else {
      await createRemoteDir(conn, targetPath);
    }
    await startDeploy();
  } catch (error) {
    const errorMsg = `SFTP deployment failed: ${error.message}`;
    log.error(errorMsg);
    throw error;
  } finally {
    if (conn) {
      await sshDisconnect(conn);
    }
  }
};

// FTP to remote with FTP
const deployFTP = async (env, src, compress = false) => {
  log.info(`====== FTP Deploy to ${env} ======`);
  const excludedFiles = [".git", "node_modules"];
  const srcPath = preparePath("local", src);
  const targetPath = prepareFtpPath(env, src);

  // Progress tracking
  let totalFiles = 0;
  let uploadedFiles = 0;
  let totalSize = 0;
  let uploadedSize = 0;
  let client;

  // Count total files and calculate total size
  const countFiles = async (dir, excluded = []) => {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    let count = 0;
    let size = 0;

    for (const entry of entries) {
      if (excluded.includes(entry.name)) continue;
      const entryPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        const { count: subCount, size: subSize } = await countFiles(
          entryPath,
          excluded
        );
        count += subCount;
        size += subSize;
      } else {
        count++;
        const stats = await fs.stat(entryPath);
        size += stats.size;
      }
    }
    return { count, size };
  };

  async function startDeploy() {
    try {
      // Count total files and size for progress tracking
      spinner.start("Analyzing files to upload...");
      const { count, size } = await countFiles(srcPath, excludedFiles);
      totalFiles = count;
      totalSize = size;
      spinner.stop();

      log.info(
        `Found ${totalFiles} files to upload (${formatSize(totalSize)})`
      );

      // Start upload with progress
      spinner.start(
        `Uploading files: 0/${totalFiles} (0%) - 0/${formatSize(totalSize)}`
      );
      await upload(srcPath, targetPath, excludedFiles);

      spinner.stop();
      log.info(
        `FTP upload complete. ${uploadedFiles}/${totalFiles} files uploaded (${formatSize(
          uploadedSize
        )})`
      );
    } catch (error) {
      const errorMsg = `FTP deployment failed: ${error.message}`;
      log.error(errorMsg);
      throw error;
    }
  }

  // Recursively upload directory to FTP, skipping excluded files/dirs
  async function upload(localDir, remoteDir, excluded = []) {
    await client.ensureDir(remoteDir);

    const entries = await fs.readdir(localDir, { withFileTypes: true });

    for (const entry of entries) {
      if (excluded.includes(entry.name)) continue;
      const localPath = path.join(localDir, entry.name);
      const remotePath = remoteDir + "/" + entry.name;

      if (entry.isDirectory()) {
        await upload(localPath, remotePath, excluded);
      } else {
        // Get file size before upload
        const stats = await fs.stat(localPath);
        const fileSize = stats.size;

        // Upload file
        await client.uploadFrom(localPath, remotePath);

        // Update counters after successful upload
        uploadedFiles++;
        uploadedSize += fileSize;

        // Update progress - simple counter like deploySFTP
        const progress = Math.round((uploadedFiles / totalFiles) * 100);
        spinner.update(
          `Uploading files: ${uploadedFiles}/${totalFiles} (${progress}%) - ${formatSize(
            uploadedSize
          )}/${formatSize(totalSize)}`
        );
      }
    }
  }

  try {
    const srcExists = await fs.pathExists(srcPath);

    if (!srcExists) {
      throw new Error("Source path does not exist");
    }

    const { client: ftpClient } = await ftpConnect(env, null, {
      timeout: 120000,
    });
    client = ftpClient;

    const exists = await checkIfFtpExists(client, targetPath);

    if (exists) {
      const shouldProceed = await promptUser(
        `Everything on existing path will be overwritten: "${targetPath}" \n  Are you sure?`,
        "deploy"
      );
      if (!shouldProceed) {
        log.warn("Deployment cancelled by user");
        return;
      }
    } else {
      await client.ensureDir(targetPath);
    }

    await startDeploy();
  } catch (error) {
    if (client) {
      client.trackProgress(); // Stop progress tracking on error
    }
    const errorMsg = `FTP deployment failed: ${error.message}`;
    log.error(errorMsg);
    throw error;
  } finally {
    if (client) {
      client.close();
    }
  }
};

// Sync between environments
const sync = async (srcEnv, targetEnv, src) => {
  const args = getArgs();
  const isDryRun = args.dryRun || false;

  if (isDryRun) {
    log.info(`====== DRY RUN: Sync ${targetEnv} with ${srcEnv} ======`);
    log.info(
      "🔍 DRY RUN MODE: No actual changes will be made, only simulation"
    );
  } else {
    log.info(`====== Sync ${targetEnv} with ${srcEnv} ======`);
  }

  const srcConfig = getEnv(srcEnv);
  const targetConfig = getEnv(targetEnv);
  const srcPath = preparePath(srcEnv, src);
  const targetPath = preparePath(targetEnv, src);
  const excludedFiles = [".env", ".git", "node_modules"];

  // Prevent overwriting root/home directories (only for remote targets)
  if (targetEnv !== "local" && isRootPath(targetConfig.SSH_PATH)) {
    log.error(
      `Invalid path for remote target: ${targetConfig.SSH_PATH} - appears to be a root/home directory`
    );
    process.exit(1);
  }

  const syncInsideRemote = async (env, srcPath, targetPath) => {
    const { sudo, HTACCESS_MODIFY } = getEnv(env);
    let conn;

    try {
      if (isDryRun) {
        log.info(
          `🔍 DRY RUN: Would connect to remote server for same-server sync`
        );

        // Check which sync strategy would be used
        const tempConn = await sshConnect(env);
        const rsyncAvailable = await checkRsync(tempConn);
        await sshDisconnect(tempConn);

        if (rsyncAvailable) {
          log.info(
            `🔍 DRY RUN: Sync strategy: rsync (preferred - faster, more efficient)`
          );
          log.info(
            `🔍 DRY RUN: Would use rsync command: rsync -avz --delete --exclude ".env" --exclude ".git" --exclude "node_modules"`
          );
        } else {
          log.info(
            `🔍 DRY RUN: Sync strategy: SFTP (fallback - rsync not available)`
          );
          log.info(
            `🔍 DRY RUN: Would use SFTP file-by-file transfer with progress tracking`
          );
        }

        log.info(`🔍 DRY RUN: Would sync from "${srcPath}" to "${targetPath}"`);
        log.info(
          `🔍 DRY RUN: Would exclude files: ${excludedFiles.join(", ")}`
        );
        log.info(
          `🔍 DRY RUN: Would prompt user for confirmation before overwriting existing files`
        );

        if (src === cfg.path.base || src === "") {
          log.info(`🔍 DRY RUN: Would copy environment file .env.${targetEnv}`);
          log.info(`🔍 DRY RUN: Would update file permissions (chmod 644/755)`);
          if (HTACCESS_MODIFY) {
            log.info(
              `🔍 DRY RUN: Would modify .htaccess for subdirectory setup`
            );
            log.info(
              `🔍 DRY RUN: - Would update RewriteBase to /${cfg.siteName}/`
            );
            log.info(
              `🔍 DRY RUN: - Would update RewriteRule to /${cfg.siteName}/index.php`
            );
          }
        }
        return;
      }

      conn = await sshConnect(env);

      if (
        (await checkIfRemoteExists(conn, targetPath)) &&
        !(await promptUser(
          `It will rewrite all files & folders at existing path: \n "${targetPath}" \n  Are you sure?`,
          "sync"
        ))
      ) {
        log.warn("Sync cancelled by user");
        return;
      }

      // Sync with rsync/sftp
      if (
        !(await syncRemoteWithRsynс(conn, srcPath, targetPath, excludedFiles))
      ) {
        log.warn("rsync not available. Falling back to SFTP");
        await syncRemoteWithSFTP(conn, srcPath, targetPath, excludedFiles);
      }

      // Copy env, update chmod & modify .htaccess for full app sync
      if (src === cfg.path.base || src === "") {
        const envFileSrc = `.env.${targetEnv}`;
        await uploadFile(conn, envFileSrc, `${targetConfig.SSH_PATH}/.env`);

        let cmd = `${sudo}find ${targetPath} -type f -print0 | xargs -0 chmod 644; ${sudo}find ${targetPath} -type d -print0 | xargs -0 chmod 755;`;
        let msg = "Updating chmod.";

        if (HTACCESS_MODIFY) {
          msg += "Rewriting rules in .htaccess";
          cmd += `${sudo}sed -i 's,RewriteBase /,RewriteBase /${cfg.siteName}/,g' ${targetConfig.SSH_PATH}/.htaccess;`;
          cmd += `${sudo}sed -i 's,RewriteRule . /index.php,RewriteRule . /${cfg.siteName}/index.php,g' ${targetConfig.SSH_PATH}/.htaccess`;
        }

        await runRemote(
          { cwd: targetConfig.SSH_PATH, cmd, spinner: msg },
          conn
        );
      }
    } catch (error) {
      const errorMsg = `Remote sync failed: ${error.message}`;
      log.error(errorMsg);
      throw error;
    } finally {
      if (conn) {
        await sshDisconnect(conn);
      }
    }
  };

  const syncFromRemoteToLocal = async () => {
    let conn;

    try {
      if (isDryRun) {
        log.info(
          `🔍 DRY RUN: Would connect to remote source "${srcConfig.SSH_HOST}"`
        );
        log.info(
          `🔍 DRY RUN: Would download from "${srcPath}" to "${targetPath}"`
        );
        log.info(
          `🔍 DRY RUN: Would exclude files: ${excludedFiles.join(", ")}`
        );
        log.info(
          `🔍 DRY RUN: Would prompt for confirmation before overwriting existing local files`
        );
        return;
      }

      conn = await sshConnect(srcEnv);

      if (await fs.pathExists(targetPath)) {
        const shouldProceed = await promptUser(
          `It will rewrite all files & folders at existing path: \n "${targetPath}" \n Are you sure?`,
          "sync"
        );
        if (!shouldProceed) {
          log.info("Sync cancelled by user");
          return;
        }
      } else {
        await createLocalDir(targetPath);
      }

      // Sync files from remote to local
      await getRemoteFiles(conn, srcPath, targetPath, true);
    } catch (error) {
      const errorMsg = `Remote to local sync failed: ${error.message}`;
      log.error(errorMsg);
      throw error;
    } finally {
      if (conn) {
        await sshDisconnect(conn);
      }
    }
  };

  // Sync between different remote servers (staging → production)
  const syncBetweenRemotes = async () => {
    let srcConn = null;
    let targetConn = null;
    const timestamp = getTimeStamp();
    const tempDir = `${cfg.path.migrations}/temp-sync-${timestamp}`;

    try {
      if (isDryRun) {
        log.info(`🔍 DRY RUN: Would sync between different remote servers`);
        log.info(`🔍 DRY RUN: Source: ${srcConfig.SSH_HOST} (${srcEnv})`);
        log.info(`🔍 DRY RUN: Target: ${targetConfig.SSH_HOST} (${targetEnv})`);
        log.info(`🔍 DRY RUN: Strategy: Download to temp → Upload to target`);
        log.info(`🔍 DRY RUN: Temp directory: ${tempDir}`);
        log.info(`🔍 DRY RUN: Would check disk space on both servers`);
        log.info(
          `🔍 DRY RUN: Would exclude files: ${excludedFiles.join(", ")}`
        );
        log.info(`🔍 DRY RUN: Phase 1/2: Download from ${srcPath} to temp`);
        log.info(`🔍 DRY RUN: Phase 2/2: Upload from temp to ${targetPath}`);

        if (src === cfg.path.base || src === "") {
          log.info(`🔍 DRY RUN: Would copy environment file .env.${targetEnv}`);
          log.info(`🔍 DRY RUN: Would update file permissions (chmod 644/755)`);
          if (targetConfig.HTACCESS_MODIFY) {
            log.info(
              `🔍 DRY RUN: Would modify .htaccess for subdirectory setup`
            );
          }
        }
        return;
      }

      log.info(`📡 Establishing connections to both servers...`);

      // Get pooled connections for both servers
      srcConn = await getPooledConnection(srcEnv);
      targetConn = await getPooledConnection(targetEnv);

      log.success(`✅ Connected to both servers`);

      // Estimate source directory size for space check
      log.info(`📊 Estimating source directory size...`);
      const estimatedSize = await getRemoteDirectorySize(srcConn, srcPath);

      if (estimatedSize > 0) {
        log.info(`📦 Estimated size: ${formatSize(estimatedSize)}`);

        // Check if target has enough space
        const spaceCheck = await checkRemoteDiskSpace(
          targetConn,
          estimatedSize,
          targetEnv
        );

        if (!spaceCheck.sufficient) {
          throw new Error(spaceCheck.message);
        }

        if (spaceCheck.warning) {
          log.warn(`⚠️  ${spaceCheck.message}`);
        }
      }

      // Check if target exists and prompt user
      if (await checkIfRemoteExists(targetConn, targetPath)) {
        const shouldProceed = await promptUser(
          `It will rewrite all files & folders at existing path: \n "${targetPath}" on ${targetConfig.SSH_HOST} \n Are you sure?`,
          "sync"
        );
        if (!shouldProceed) {
          log.warn("Sync cancelled by user");
          return;
        }
      }

      // Create temporary local directory
      await createLocalDir(tempDir);
      log.info(`📁 Created temporary directory: ${tempDir}`);

      // Phase 1: Download from source to temp
      log.info(
        `\n📥 Phase 1/2: Downloading from ${srcEnv} (${srcConfig.SSH_HOST})`
      );
      await getRemoteFiles(srcConn, srcPath, tempDir, true);
      log.success(`✅ Phase 1 complete: Downloaded to temporary storage`);

      // Phase 2: Upload from temp to target
      log.info(
        `\n📤 Phase 2/2: Uploading to ${targetEnv} (${targetConfig.SSH_HOST})`
      );
      await uploadFilesWithSFTP(targetConn, tempDir, targetPath, excludedFiles);
      log.success(`✅ Phase 2 complete: Uploaded to target server`);

      // Handle .env file and permissions if full app sync
      if (src === cfg.path.base || src === "") {
        log.info(`\n⚙️  Finalizing full app sync...`);

        const envFileSrc = `.env.${targetEnv}`;
        await uploadFile(
          targetConn,
          envFileSrc,
          `${targetConfig.SSH_PATH}/.env`
        );
        log.info(`✅ Copied .env.${targetEnv} file`);

        await updateChmod(
          targetConn,
          targetPath,
          targetConfig.sudo,
          targetConfig.SSH_PATH,
          targetConfig.HTACCESS_MODIFY
        );
        log.success(`✅ Updated permissions and configuration`);
      }

      // Cleanup temp directory
      log.info(`🧹 Cleaning up temporary files...`);
      await fs.remove(tempDir);
      log.success(`✅ Temporary directory removed`);
    } catch (error) {
      const errorMsg = `Remote-to-remote sync failed: ${error.message}`;
      log.error(errorMsg);
      throw error;
    } finally {
      // Release both connections back to pool
      await releaseConnection(srcEnv, srcConn);
      await releaseConnection(targetEnv, targetConn);

      // Ensure temp cleanup even on error
      try {
        if (await fs.pathExists(tempDir)) {
          await fs.remove(tempDir);
          log.info(`🧹 Cleaned up temporary directory after error`);
        }
      } catch (cleanupError) {
        log.warn(`Failed to cleanup temp directory: ${cleanupError.message}`);
      }
    }
  };

  // Sync inside remote server
  if (srcEnv !== "local" && srcConfig.SSH_HOST === targetConfig.SSH_HOST) {
    if (isDryRun) {
      log.info(`🔍 DRY RUN: Detected same-server sync (${srcConfig.SSH_HOST})`);
    }
    await syncInsideRemote(srcEnv, srcPath, targetPath);
  }
  // Sync from remote to local
  else if (srcEnv !== "local" && targetEnv === "local") {
    await syncFromRemoteToLocal();
  }
  // Sync from local to remote
  else if (srcEnv === "local" && targetEnv !== "local") {
    if (isDryRun) {
      log.info(
        `🔍 DRY RUN: Would sync from local to remote - recommend using deploy task instead`
      );
    } else {
      log.warn("Syncing from local to remote is not handled by this function.");
      log.info("Please use the deploy function for this operation.");
    }
  }
  // Sync between remote servers
  else if (
    srcEnv !== "local" &&
    targetEnv !== "local" &&
    srcConfig.SSH_HOST !== targetConfig.SSH_HOST
  ) {
    await syncBetweenRemotes();
  } else {
    log.error("Invalid sync operation");
  }

  if (isDryRun) {
    log.success(
      `🔍 DRY RUN COMPLETED: File sync simulation from "${srcEnv}" to "${targetEnv}"`
    );
    log.info(
      "No actual changes were made. Use without --dry-run to execute the sync."
    );
  }
};

// Export tasks
export const backupTask = async () => {
  const taskId = "backup";
  startTaskTimer(taskId);

  try {
    const args = getArgs();
    const from = args.from || "local";
    const src = args.src || "";
    const compress = !args.nocompress;
    const useStreaming = !args.nostream;
    const useFTP = args.ftp || false;

    await checkEnv([from]);
    await backup(from, src, compress, useStreaming, useFTP);

    const duration = stopTaskTimer(taskId);
    log.success(`Backup task completed in ${formatTime(duration)}`);
  } catch (error) {
    const duration = stopTaskTimer(taskId);
    log.error(
      `Backup task failed after ${formatTime(duration)}: ${error.message}`
    );
    throw error;
  }
};

export const deployTask = async () => {
  const taskId = "deploy";
  startTaskTimer(taskId);

  try {
    const args = getArgs();
    const to = args.to;
    const src = args.src || cfg.path.base;
    const compress = !args.nocompress;
    const useFTP = args.ftp || false;

    await checkEnv([to]);

    // Validate that the deployment path is safe
    const { SSH_PATH } = getEnv(to);
    if (isRootPath(SSH_PATH)) {
      throw new Error(
        `Deployment path "${SSH_PATH}" appears to be a root directory and is not safe for deployment. Please specify a proper project staging folder.`
      );
    }

    await validateArgs(args, ["to"]);
    if (useFTP) {
      await deployFTP(to, src, compress);
    } else {
      await deploySFTP(to, src, compress);
    }

    const duration = stopTaskTimer(taskId);
    log.success(`Deploy task completed in ${formatTime(duration)}`);
  } catch (error) {
    const duration = stopTaskTimer(taskId);
    log.error(
      `Deploy task failed after ${formatTime(duration)}: ${error.message}`
    );
    throw error;
  }
};

export const syncTask = async () => {
  const taskId = "sync";
  startTaskTimer(taskId);

  try {
    const args = getArgs();
    const from = args.from;
    const to = args.to;
    const src = args.src || cfg.path.base;

    await checkEnv([from, to]);

    // Validate that deployment paths are safe
    if (from !== "local") {
      const { SSH_PATH: fromPath } = getEnv(from);
      if (isRootPath(fromPath)) {
        throw new Error(
          `Source path "${fromPath}" appears to be a root directory and is not safe. Please specify a proper project folder.`
        );
      }
    }

    if (to !== "local") {
      const { SSH_PATH: toPath } = getEnv(to);
      if (isRootPath(toPath)) {
        throw new Error(
          `Destination path "${toPath}" appears to be a root directory and is not safe. Please specify a proper project folder.`
        );
      }
    }

    await validateArgs(args, ["from", "to"]);
    await sync(from, to, src);

    const duration = stopTaskTimer(taskId);
    log.success(`Sync task completed in ${formatTime(duration)}`);
  } catch (error) {
    const duration = stopTaskTimer(taskId);
    log.error(
      `Sync task failed after ${formatTime(duration)}: ${error.message}`
    );
    throw error;
  } finally {
    // Cleanup all pooled connections
    await closeAllConnections();
  }
};
