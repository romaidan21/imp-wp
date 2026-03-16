import cfg from '../config.mjs';
import fs from 'fs-extra';
import { globesExist, log, getArgs, createTaskResult, TASK_RESULT, writeDebugLog } from '../utils/common.mjs';
import * as sass from 'sass';
import { transform, browserslistToTargets } from 'lightningcss';
import browserslist from 'browserslist';
import path from 'path';
import fastGlob from 'fast-glob';

export async function cssTask(env = 'development') {
  const isDebug = getArgs().debug || false;
  const startTime = Date.now();
  const isDevelopment = env === 'development';
  const isProduction = env === 'production';
  // Get browserslist targets for Lightning CSS
  const targets = browserslistToTargets(browserslist());

  if (isDebug) {
    writeDebugLog(`CSS task started for environment: ${env}`);
    writeDebugLog(`Started CSS task - Environment: ${env}, Pattern: ${cfg.path.src.css}`);
  }

  if (!globesExist(cfg.path.src.css)) {
    return null;
  }

  // Get the SCSS base directory from config
  const scssBaseDir = cfg.path.src.css.replace('/**/*.scss', '');
  const envFile = path.join(scssBaseDir, 'global', '_env.scss');
  const envContent = `$env: "${env}";`;


  try {
    // Write environment content
    await fs.ensureFile(envFile);
    await fs.writeFile(envFile, envContent);

    if (isDebug) {
      writeDebugLog(`Updated environment file: ${envFile} with env: ${env}`);
      writeDebugLog(`Updated environment file: ${envFile} with content: ${envContent}`);
    }

    // Get all SCSS files matching the pattern
    const files = await fastGlob(cfg.path.src.css, {
      onlyFiles: true,
      dot: true
    });

    // Filter out partials (files starting with _) - let Sass handle imports naturally
    const mainFiles = files.filter(filePath => {
      const fileName = path.basename(filePath);
      const relativePath = path.relative(cfg.path.srcBase, filePath);

      // Skip partial files (starting with _)
      if (fileName.startsWith('_')) return false;

      // Only compile files that are in the root scss directory
      const pathParts = relativePath.split(path.sep);
      return pathParts.length === 2 && pathParts[0] === 'scss';
    });

    if (isDebug) {
      writeDebugLog(`Found ${files.length} SCSS files total, ${mainFiles.length} main files to compile`);
      writeDebugLog(`Main SCSS files to compile: ${JSON.stringify(mainFiles.map(f => path.relative(cfg.path.srcBase, f)), null, 2)}`);
    }

    if (mainFiles.length === 0) {
      if (isDebug) {
        writeDebugLog('No main SCSS files to process after filtering');
      }
      return;
    }

    // Ensure destination directory exists
    await fs.ensureDir(cfg.path.build.css);

    // Pre-create all unique directories to reduce filesystem calls
    const uniqueDirs = new Set();
    const fileMappings = mainFiles.map(filePath => {
      const relativePath = path.relative(cfg.path.srcBase, filePath);
      const parsedPath = path.parse(relativePath);
      const cssFileName = parsedPath.name + '.css';
      const destPath = path.join(cfg.path.build.css, cssFileName);
      const sourceMapPath = destPath + '.map';

      uniqueDirs.add(path.dirname(destPath));
      return { filePath, relativePath, destPath, sourceMapPath, cssFileName };
    });

    await Promise.all([...uniqueDirs].map(dir => fs.ensureDir(dir)));

    if (isDebug) {
      writeDebugLog(`Created ${uniqueDirs.size} unique directories for CSS output`);
      writeDebugLog(`Created directories: ${JSON.stringify([...uniqueDirs], null, 2)}`);
    }

    const processPromises = fileMappings.map(async ({ filePath, relativePath, destPath, sourceMapPath, cssFileName }) => {
      try {
        if (isDebug) {
          writeDebugLog(`Processing SCSS: ${relativePath}`);
          writeDebugLog(`About to compile: ${filePath} with load paths: ${JSON.stringify([
            'node_modules',
            path.resolve(scssBaseDir),
            path.resolve(cfg.path.srcBase),
            path.resolve(path.dirname(filePath))
          ])}`);
        }

        // Compile SCSS to CSS using Sass with automatic load path resolution
        const sassResult = sass.compile(filePath, {
          loadPaths: [
            'node_modules',
            path.resolve(scssBaseDir),
            path.resolve(cfg.path.srcBase),
            path.resolve(path.dirname(filePath))
          ],
          sourceMap: isDevelopment,
          sourceMapIncludeSources: isDevelopment,
          style: 'expanded'
        });

        if (isDebug) {
          writeDebugLog(`Sass compilation completed for: ${relativePath}`);
          writeDebugLog(`Sass compiled: ${filePath} -> ${sassResult.css.length} chars CSS`);
        }

        // Process CSS with Lightning CSS
        const lightningResult = transform({
          filename: destPath,
          code: Buffer.from(sassResult.css),
          minify: isProduction,
          sourceMap: isDevelopment,
          inputSourceMap: isDevelopment && sassResult.sourceMap ? JSON.stringify(sassResult.sourceMap) : undefined,
          targets,
          drafts: {
            customMedia: true,
            nesting: true
          }
        });

        if (isDebug) {
          writeDebugLog(`Lightning CSS processing completed for: ${relativePath}`);
          writeDebugLog(`Lightning CSS processed: ${lightningResult.code.length} chars, warnings: ${lightningResult.warnings?.length || 0}`);
        }

        // Write CSS file with source map comment if in development
        if (isDevelopment) {
          const cssWithSourceMap = lightningResult.code + `\n/*# sourceMappingURL=${path.basename(sourceMapPath)} */`;
          await fs.writeFile(destPath, cssWithSourceMap, 'utf8');
        } else {
          await fs.writeFile(destPath, lightningResult.code, 'utf8');
        }

        // Write source map if in development
        if (isDevelopment && lightningResult.map) {
          await fs.writeFile(sourceMapPath, lightningResult.map.toString(), 'utf8');
          if (isDebug) {
            writeDebugLog(`Source map written: ${sourceMapPath}`);
          }
        }

        if (isDebug) {
          writeDebugLog(`Compiled: ${relativePath} -> ${cssFileName}`);
          writeDebugLog(`Compiled CSS: ${filePath} -> ${destPath} (${lightningResult.code.length} chars)`);
        }

        return { processed: true, file: relativePath, outputFile: cssFileName };
      } catch (error) {
        const relativePath = path.relative(cfg.path.srcBase, filePath);

        // Always log critical compilation errors to console
        console.error(`❌ SCSS Error in ${relativePath}:`);
        console.error(error.toString());

        if (isDebug) {
          writeDebugLog(`Error compiling ${relativePath}: ${error.message}`);
          writeDebugLog(`Full error details: ${JSON.stringify(error, null, 2)}`);
        }

        // Return structured error for BBG to handle
        return {
          processed: false,
          file: relativePath,
          error: true,
          outputFile: cssFileName,
          errorDetails: {
            message: `SCSS compilation failed: ${relativePath}`,
            formatted: error.toString(), // Better error formatting
            originalError: error
          }
        };
      }
    });

    // Wait for all files to be processed
    const results = await Promise.all(processPromises);

    // Count successful compilations
    const successfulCompilations = results.filter(result => result.processed);
    const failedCompilations = results.filter(result => result.error);

    if (failedCompilations.length > 0) {
      // Always show a summary of failed files in console
      console.error(`\n❌ CSS compilation failed for ${failedCompilations.length} file(s):`);
      failedCompilations.forEach(failure => {
        console.error(`   • ${failure.file}`);
      });
      console.error(''); // Empty line for spacing

      // Log detailed errors for debugging
      if (isDebug) {
        failedCompilations.forEach(failure => {
          writeDebugLog(`Failed compilation: ${failure.file}`);
          writeDebugLog(`Error: ${failure.errorDetails?.formatted || 'Unknown error'}`);
        });
      }

      // Return error result for BBG to handle
      const firstError = failedCompilations[0].errorDetails;
      return createTaskResult(
        TASK_RESULT.ERROR,
        `CSS compilation completed with ${failedCompilations.length} error(s)`,
        {
          formatted: firstError?.formatted,
          message: firstError?.message,
          failedFiles: failedCompilations.map(f => f.file),
          allErrors: failedCompilations.map(f => ({
            file: f.file,
            error: f.errorDetails?.formatted || 'Unknown error'
          }))
        },
        {
          successful: successfulCompilations.length,
          failed: failedCompilations.length,
          total: results.length
        }
      );
    }

    if (isDebug) {
      const endTime = Date.now();
      const duration = endTime - startTime;
      writeDebugLog(`CSS task completed in ${duration}ms`);
      writeDebugLog(`Task completed - Duration: ${duration}ms, Compiled: ${successfulCompilations.length}, Failed: ${failedCompilations.length}, Environment: ${env}, Files: ${JSON.stringify(successfulCompilations.map(r => r.outputFile))}`);
    }

    return createTaskResult(
      TASK_RESULT.SUCCESS,
      `Compiled ${successfulCompilations.length} file(s)`,
      null,
      {
        compiled: successfulCompilations.length,
        files: successfulCompilations.map(r => r.outputFile)
      }
    );

  } catch (error) {
    // Always log critical task errors to console
    console.error(`❌ CSS Task Error: ${error.message}`);
    if (error.stack) {
      console.error(error.stack);
    }

    // Return error result for BBG to handle
    return createTaskResult(
      TASK_RESULT.ERROR,
      `CSS task failed: ${error.message}`,
      {
        stack: error.stack,
        originalError: error
      }
    );
  }
}