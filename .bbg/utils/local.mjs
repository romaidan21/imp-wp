import cfg from '../config.mjs';
import fs from 'fs-extra';
import path from 'path';
import { deleteAsync } from 'del';
import { spawn } from 'child_process';
import { formatSize, spinner, getGZtool, getTimeStamp, writeDebugLog } from './common.mjs';

// Spawn local shell command with enhanced real-time progress monitoring
export async function runLocal(runner, args) {
  return new Promise((resolve, reject) => {
    spinner.start(runner.spinner);
    const [cmd, ...cmdArgs] = runner.cmd.split(' ');
    const childProcess = spawn(cmd, cmdArgs, { shell: true });
    let stdout = '';
    let stderr = '';
    let totalBytes = 0;
    let processedFiles = 0;

    // Progress tracking variables
    const startTime = Date.now();
    const progressConfig = runner.progressConfig || {};
    const { expectedSize, expectedFiles, onProgress } = progressConfig;
    let lastProgressUpdate = 0;
    let lastPercentage = 0; // Track last percentage shown
    let stdoutBuffer = ''; // Buffer for processing partial lines from stdout
    let stderrBuffer = ''; // Buffer for processing partial lines from stderr

    childProcess.stdout.on('data', (data) => {
      stdout += data.toString();
      totalBytes += data.length;

      // Enhanced file counting for real-time progress
      if (runner.trackFiles) {
        stdoutBuffer += data.toString();
        const lines = stdoutBuffer.split('\n');

        // Keep the last partial line in buffer for next chunk
        stdoutBuffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          // Enhanced tar output parsing - count actual file operations
          if (trimmed && trimmed.length > 0) {
            // For tar verbose output, each processed file typically shows:
            // - Files being added/extracted (not directories ending with /)
            // - Skip tar metadata, warnings, and directory entries
            const isFile = !trimmed.endsWith('/') &&
              !trimmed.includes('tar:') &&
              !trimmed.includes('warning:') &&
              !trimmed.includes('Removing leading') &&
              !trimmed.startsWith('x ') === false && // Don't skip extraction lines
              !trimmed.match(/^\d+\s+blocks?/) && // Skip block count lines
              trimmed.length > 1;

            if (isFile) {
              processedFiles++;

              // Update progress only when percentage changes significantly
              if (onProgress && typeof onProgress === 'function' && expectedFiles > 0) {
                const currentPercent = Math.round((processedFiles / expectedFiles) * 100);
                if (currentPercent > lastPercentage || processedFiles === 1) {
                  lastPercentage = currentPercent;
                  const elapsed = (Date.now() - startTime) / 1000;
                  const progress = {
                    bytes: totalBytes,
                    files: processedFiles,
                    elapsed,
                    expectedSize,
                    expectedFiles
                  };
                  onProgress(progress);
                }
              }
            }
          }
        }
      }
    });

    childProcess.stderr.on('data', (data) => {
      stderr += data.toString();

      // Enhanced file counting for tar stderr output (Windows tar outputs to stderr)
      if (runner.trackFiles) {
        stderrBuffer += data.toString();
        const lines = stderrBuffer.split('\n');

        // Keep the last partial line in buffer for next chunk
        stderrBuffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          // Parse tar output - both stdout and stderr formats
          if (trimmed && trimmed.length > 0) {
            // Windows tar format: "a ./filename" or "x ./filename"
            // Unix tar format: just the filename
            let isFile = false;

            if (trimmed.startsWith('a ') || trimmed.startsWith('x ')) {
              // Windows/BSD tar format
              const filename = trimmed.substring(2).trim();
              isFile = filename &&
                !filename.endsWith('/') &&
                filename !== '.' &&
                !filename.includes('tar:') &&
                !filename.includes('warning:');
            } else {
              // Unix tar format or other output
              isFile = !trimmed.endsWith('/') &&
                !trimmed.includes('tar:') &&
                !trimmed.includes('warning:') &&
                !trimmed.includes('Removing leading') &&
                !trimmed.match(/^\d+\s+blocks?/) &&
                trimmed !== '.' &&
                trimmed.length > 1;
            }

            if (isFile) {
              processedFiles++;

              // Simple progress updates for extraction
              if (onProgress && typeof onProgress === 'function' &&
                (processedFiles % 10 === 0 || processedFiles === 1)) {
                const elapsed = (Date.now() - startTime) / 1000;
                const progress = {
                  bytes: totalBytes,
                  files: processedFiles,
                  elapsed,
                  expectedSize,
                  expectedFiles
                };
                onProgress(progress);
              }
            }
          }
        }
      }
    });

    childProcess.on('close', (code) => {
      spinner.stop();
      if (code !== 0) {
        const error = new Error(`Process exited with code ${code}\nSTDERR: ${stderr}\nSTDOUT: ${stdout}`);
        if (runner.fallback) runner.fallback(stderr);
        reject(error);
      } else {
        if (runner.callback) runner.callback(stdout, { totalBytes, processedFiles });
        resolve(stdout);
      }
    });

    childProcess.on('error', (error) => {
      spinner.stop(error.message);
      if (runner.fallback) runner.fallback(error.message);
      reject(error);
    });
  });
}

// Spawn local shell command without spinner
export async function runLocalSilent(cmd, options = { shell: true }) {

  return new Promise((resolve, reject) => {
    const childProcess = spawn(cmd, options);
    let stdout = '';
    let stderr = '';

    // Only capture output if stdio is not inherited
    const isStdioInherited = options.stdio === 'inherit';

    if (!isStdioInherited && childProcess.stdout) {
      childProcess.stdout.on('data', (data) => {
        stdout += data.toString();
      });
    }

    if (!isStdioInherited && childProcess.stderr) {
      childProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });
    }

    childProcess.on('close', (code) => {
      if (code !== 0) {
        const error = new Error(`Process exited with code ${code}`);
        reject(error);
      } else {
        // Return stdout if available, otherwise stderr (some tools output version to stderr)
        // For inherited stdio, return empty string as output is already shown to user
        resolve(isStdioInherited ? '' : (stdout || stderr));
      }
    });

    childProcess.on('error', (error) => {
      reject(error);
    });
  });
}

// Remove files with Windows-friendly retry logic
export async function removeLocal(paths, silent = false, cb) {
  // Handle parameter overloading - if second param is function, it's the old signature
  if (typeof silent === 'function') {
    cb = silent;
    silent = false;
  }

  return new Promise(async (resolve, reject) => {
    let formattedPaths = Array.isArray(paths) ? paths.join(', ') : paths;
    const msg = `Removing ${formattedPaths}`;
    spinner.start(msg);

    const maxRetries = 3;
    const retryDelay = 1000; // 1 second

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await deleteAsync(paths, {
          force: true,
          onlyFiles: false
        });

        if (silent) {
          // Stop spinner without showing completion messages
          if (spinner.loader) {
            spinner.loader.stop();
            spinner.loader = null;
            spinner.startTime = null;
          }
        } else {
          spinner.stop();
        }

        if (typeof cb === 'function') cb();
        resolve();
        return;
      } catch (error) {
        // Check if it's a Windows permission error
        if (error.code === 'EPERM' || error.code === 'EBUSY' || error.code === 'ENOTEMPTY') {
          if (attempt < maxRetries) {
            spinner.text = `${msg} (attempt ${attempt}/${maxRetries}, retrying in ${retryDelay/1000}s...)`;
            await new Promise(resolve => setTimeout(resolve, retryDelay));
            continue;
          } else {
            // Last attempt failed, try to clean up what we can
            try {
              // Try to remove individual files instead of directories
              await deleteAsync(paths, {
                force: true,
                onlyFiles: true // Only remove files, leave directories
              });
              spinner.stop(`${msg} (partially completed - some directories may remain due to file locks)`);
              if (typeof cb === 'function') cb();
              resolve();
              return;
            } catch (finalError) {
              spinner.stop(`${msg} Failed: ${error.message}`);
              // Don't reject on permission errors in production builds
              if (process.env.NODE_ENV === 'production') {
                console.warn(`Warning: Could not remove all files due to Windows file locks: ${error.message}`);
                if (typeof cb === 'function') cb();
                resolve();
                return;
              }
              reject(error);
              return;
            }
          }
        } else {
          // Non-permission error, fail immediately
          spinner.stop(`${msg} Failed: ${error.message}`);
          reject(error);
          return;
        }
      }
    }
  });
}

// Create local dir
export async function createLocalDir(dir, cb) {
  try {
    const dirExists = await fs.pathExists(dir);

    if (!dirExists) {
      spinner.start(`Creating ${dir} folder`);
      await fs.ensureDir(dir);
      await new Promise(resolve => setTimeout(resolve, 300));
      spinner.stop();
    }

    (typeof cb === 'function') && cb();
  } catch (error) {
    spinner.stop(error);
    process.exit(1);
  }
}

// Create archive using system tar + compression tools with stream progress
export async function pack(srcPath, destPath, cb) {
  const totalSize = await getDirSize(srcPath);
  const fileCount = await getFileCount(srcPath);
  const baseMsg = `Creating archive of ${srcPath}`;

  // Ensure the destination directory exists
  await fs.ensureDir(path.dirname(destPath));

  try {
    const isCompressed = destPath.endsWith('.gz') || destPath.endsWith('.tgz');

    // Use traditional compression
    writeDebugLog('Compress', `Using traditional compression for: ${srcPath} -> ${destPath}`);

    // Get the best available compression tool
    const compressionInfo = await getGZtool('local');

    // Build cross-platform tar command with verbose output for progress
    let cmd;
    const isWindows = process.platform === 'win32';

    if (isWindows) {
      // Windows tar with verbose output for progress
      if (isCompressed) {
        cmd = `tar -czvf "${destPath}" -C "${srcPath}" .`;
      } else {
        cmd = `tar -cvf "${destPath}" -C "${srcPath}" .`;
      }
    } else {
      // Unix/Linux/macOS tar (full GNU tar options)
      const tarArgs = [
        '--hard-dereference',
        '--no-xattrs',
        '--no-acls',
        '--no-selinux',
        '--numeric-owner',
        '-C', `"${srcPath}"`,
        '--exclude=.DS_Store',
        '--exclude=*.tmp',
        '--xform', 's:^./::'
      ];

      if (isCompressed) {
        if (compressionInfo.name === 'pigz') {
          // Use pigz for better multi-core compression with verbose tar
          const tarCmd = `tar ${tarArgs.join(' ')} -cvf -`;
          cmd = `${tarCmd} . | ${compressionInfo.compressCmd} > "${destPath}"`;
        } else {
          // Use gzip compression with verbose output
          tarArgs.unshift('-czvf', `"${destPath}"`);
          cmd = `tar ${tarArgs.join(' ')} .`;
        }
      } else {
        // No compression with verbose output
        tarArgs.unshift('-cvf', `"${destPath}"`);
        cmd = `tar ${tarArgs.join(' ')} .`;
      }
    }

    // Start with detailed progress message
    const startTime = Date.now();
    const progressMsg = `${baseMsg} (${fileCount} files, ${formatSize(totalSize)})`;

    await runLocal({
      cmd,
      spinner: progressMsg,
      trackFiles: true,
      progressConfig: {
        expectedSize: totalSize,
        expectedFiles: fileCount,
        onProgress: (progress) => {
          const { files, expectedFiles } = progress;
          const filePercent = expectedFiles > 0 ? Math.min(100, Math.round(files / expectedFiles * 100)) : 0;

          // Update only when percentage changes
          if (files > 0 && filePercent > 0) {
            spinner.update(`${progressMsg} - ${filePercent}%`);
          }
        }
      },
      callback: async (stdout, stats) => {
        // Calculate final stats
        const archiveStats = await fs.stat(destPath);
        const compressedSize = archiveStats.size;
        const ratio = totalSize > 0 ? ((1 - compressedSize / totalSize) * 100).toFixed(1) : '0';
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

        spinner.update(`${baseMsg} complete: ${formatSize(compressedSize)} (${ratio}% reduction) - ${stats.processedFiles}/${fileCount} files in ${elapsed}s`);
        if (typeof cb === 'function') await cb(stdout);
      },
      fallback: (error) => {
        throw new Error(`Archive creation failed: ${error}`);
      }
    });

  } catch (error) {
    spinner.stop(`Failed: ${error.message}`);
    throw error;
  }
}

// Unpack archive with automatic compression detection and stream progress
export async function unpack(localArchivePath, absoluteLocalDest, cb) {
  // Auto-detect compression based on file extension
  const isCompressed = localArchivePath.endsWith('.gz') || localArchivePath.endsWith('.tgz');

  // Get archive size for progress reference
  const archiveStats = await fs.stat(localArchivePath);
  const archiveSize = archiveStats.size;

  let cmd;
  if (isCompressed) {
    cmd = `tar -xzvf "${localArchivePath}" -C "${absoluteLocalDest}"`;
  } else {
    cmd = `tar -xvf "${localArchivePath}" -C "${absoluteLocalDest}"`;
  }

  const baseMsg = `Unpacking ${path.basename(localArchivePath)}`;
  const startTime = Date.now();

  try {
    await runLocal({
      cmd,
      spinner: `${baseMsg} (${formatSize(archiveSize)})`,
      trackFiles: true,
      progressConfig: {
        expectedSize: archiveSize,
        onProgress: (progress) => {
          const { files } = progress;

          if (files > 0) {
            spinner.update(`${baseMsg} - ${files} files extracted`);
          }
        }
      },
      callback: async (stdout, stats) => {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        const avgRate = elapsed > 0 ? (stats.processedFiles / elapsed).toFixed(1) : 0;

        spinner.update(`${baseMsg} complete: ${stats.processedFiles} files extracted in ${elapsed}s (${avgRate} files/s)`);
        if (typeof cb === 'function') await cb(stdout);
      },
      fallback: (error) => {
        throw new Error(`Unpack failed: ${error}`);
      }
    });
  } catch (error) {
    spinner.stop(`Failed: ${error.message}`);
    throw error;
  }
}

// Calculate the total size of a directory
export async function getDirSize(directory) {
  try {
    const files = await fs.promises.readdir(directory);
    const stats = await Promise.all(
      files.map(file => fs.promises.stat(path.join(directory, file)))
    );

    const sizes = await Promise.all(
      stats.map((stat, index) => {
        const filePath = path.join(directory, files[index]);
        return stat.isDirectory() ? getDirSize(filePath) : stat.size;
      })
    );

    return sizes.reduce((total, size) => total + size, 0);
  } catch (error) {
    console.error(`Error reading directory ${directory}:`, error);
    return 0;
  }
}

// Calculate the total number of files in a directory
async function getFileCount(directory) {
  try {
    const files = await fs.promises.readdir(directory);
    let count = 0;

    for (const file of files) {
      const filePath = path.join(directory, file);
      const stat = await fs.promises.stat(filePath);

      if (stat.isDirectory()) {
        count += await getFileCount(filePath);
      } else {
        count++;
      }
    }

    return count;
  } catch (error) {
    console.warn(`Warning: Could not count files in ${directory}:`, error.message);
    return 0;
  }
}

// Task to create the timestamp file
export function createTimestamp() {
  const timestamp = getTimeStamp();
  const cleanedTimestamp = timestamp.replace(/-/g, "");
  const filePath = `${cfg.path.build.theme}/.timestamp`;
  console.log(`Timestamp: ${cleanedTimestamp}`);

  fs.ensureFile(filePath, () => {
    fs.writeFileSync(filePath, cleanedTimestamp);
  });
}