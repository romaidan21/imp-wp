import cfg from '../config.mjs';
import fs from 'fs-extra';
import { globesExist, log, getArgs, createTaskResult, TASK_RESULT, writeDebugLog } from '../utils/common.mjs';
import { rspack } from '@rspack/core';
import browserslist from 'browserslist';
import path from 'path';

const minifyConfig = (env) => {
  const isDebug = getArgs().debug || false;

  return {
    ...(env === 'production' && {
      mangle: true,
      compress: {
        unused: true,
        dead_code: true,
        conditionals: true,
        evaluate: true,
        booleans: true,
        loops: true,
        keep_fargs: false,
        hoist_funs: true,
        keep_fnames: false,
        hoist_vars: true,
        if_return: true,
        join_vars: true,
        drop_debugger: true,
        side_effects: true,
        pure_getters: true,
        drop_console: false
      }
    })
  };
};

const createConfig = (env) => ({
  externals: {
    jquery: 'jQuery'
  },
  entry: cfg.jsEntries.reduce((acc, curr) => {
    acc[curr] = path.resolve(`./${cfg.path.srcBase}/js/${curr}.js`);
    return acc;
  }, {}),
  output: {
    path: path.resolve(cfg.path.build.js),
    filename: '[name].js',
    clean: env === 'production' ? true : false,
  },
  mode: env,
  devtool: env === 'production' ? false : 'inline-source-map',
  stats: 'errors-warnings',
  cache: env === 'production' ? false : true,
  module: {
    rules: [
      {
        test: /\.m?js$/,
        exclude: /(node_modules|bower_components)/,
        use: {
          loader: 'builtin:swc-loader',
          options: {
            jsc: {
              parser: {
                syntax: "ecmascript",
                jsx: false,
              },
              minify: minifyConfig(env),
            },
            env: {
              targets: browserslist().join(', '),
              mode: "usage",
              exclude: [
                "es.typed-array.set",
                "es.typed-array.*"
              ],
            },
          },
        }
      },
      {
        test: /\.(glsl|vs|fs|vert|frag)$/,
        exclude: /(node_modules|bower_components)/,
        type: 'asset/source'
      }
    ]
  }
});

async function compileJS(env = 'development') {
  const isDebug = getArgs().debug || false;
  const startTime = Date.now();
  const isProduction = env === 'production';

  if (isDebug) {
    writeDebugLog(`JS task started for environment: ${env}`);
    writeDebugLog(`Started JS task - Environment: ${env}, Pattern: ${cfg.path.src.js}`);
  }

  if (!globesExist(cfg.path.src.js)) {
    if (isDebug) {
      writeDebugLog(`No JS files found matching pattern: ${cfg.path.src.js}`);
    }
    return null; // Silently skip when no JS files to process
  }

  try {
    // Ensure destination directory exists
    await fs.ensureDir(cfg.path.build.js);

    // Get all JS entry files
    const entryFiles = await Promise.all(
      cfg.jsEntries.map(async (entry) => {
        const entryPath = path.resolve(`./${cfg.path.srcBase}/js/${entry}.js`);
        try {
          await fs.access(entryPath);
          return { name: entry, path: entryPath };
        } catch {
          if (isDebug) {
            writeDebugLog(`Entry file not found: ${entryPath}`);
          }
          return null;
        }
      })
    );

    const validEntries = entryFiles.filter(Boolean);

    if (validEntries.length === 0) {
      if (isDebug) {
        writeDebugLog('No valid JS entry files found');
      }
      return createTaskResult(TASK_RESULT.SUCCESS, 'No valid JS entry files found');
    }

    if (isDebug) {
      writeDebugLog(`Found ${validEntries.length} JS entry files to compile`);
      writeDebugLog(`JS entry files to compile: ${JSON.stringify(validEntries.map(e => e.name), null, 2)}`);
    }

    // Create Rspack configuration
    const rspackConfig = createConfig(env);

    if (isDebug) {
      writeDebugLog(`Rspack configuration created for environment: ${env}`);
      writeDebugLog(`Rspack config entries: ${JSON.stringify(Object.keys(rspackConfig.entry), null, 2)}`);
    }

    // Run Rspack compilation
    const compileResult = await new Promise((resolve, reject) => {
      rspack(rspackConfig, (err, stats) => {
        if (err) {
          resolve({
            status: TASK_RESULT.ERROR,
            message: `Rspack compilation error: ${err.message}`,
            details: {
              originalError: err,
              stack: err.stack
            }
          });
          return;
        }

        if (stats.hasErrors()) {
          const errors = stats.compilation.errors;
          resolve({
            status: TASK_RESULT.ERROR,
            message: `Rspack compilation failed with ${errors.length} error(s)`,
            details: {
              errors: errors.map(e => e.message),
              formatted: stats.toString({ colors: true })
            }
          });
          return;
        }

        if (stats.hasWarnings() && isDebug) {
          const warnings = stats.compilation.warnings;
          log.warn(`Rspack compilation completed with ${warnings.length} warning(s)`);
          writeDebugLog(`Rspack warnings: ${JSON.stringify(warnings.map(w => w.message), null, 2)}`);
        }

        if (isProduction) {
          console.log(stats.toString({
            colors: true,
            assets: false,
            modules: false,
            chunks: false,
            chunkModules: false,
            entrypoints: false,
            performance: false,
            timings: true,
            version: true,
            warnings: true,
            errors: true
          }));
        }

        if (isDebug) {
          writeDebugLog('Rspack compilation completed successfully');
          writeDebugLog(`Rspack compilation successful - Assets: ${JSON.stringify(Object.keys(stats.compilation.assets), null, 2)}`);
        }

        resolve({
          status: TASK_RESULT.SUCCESS,
          message: `JS compilation completed successfully`,
          data: {
            compiled: validEntries.map(e => e.name),
            stats: stats.toJson({ errors: false, warnings: false })
          }
        });
      });
    });

    // Return the result to BBG for unified handling
    if (compileResult.status === TASK_RESULT.ERROR) {
      return compileResult;
    }

    const compiledEntries = validEntries.map(entry => entry.name);

    if (isDebug) {
      const endTime = Date.now();
      const duration = endTime - startTime;
      writeDebugLog(`JS task completed in ${duration}ms`);
      writeDebugLog(`Task completed - Duration: ${duration}ms, Compiled: ${compiledEntries.length}, Environment: ${env}, Files: ${JSON.stringify(compiledEntries)}`);
    }

    return compileResult;

  } catch (error) {
    // Return error result for BBG to handle
    return createTaskResult(
      TASK_RESULT.ERROR,
      `JS task failed: ${error.message}`,
      {
        stack: error.stack,
        originalError: error
      }
    );
  }
}

export const jsTask = (env) => compileJS(env);
