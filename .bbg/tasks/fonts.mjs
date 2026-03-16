import cfg from "../config.mjs";
import path from "path";
import fs from "fs-extra";
import ttf2woff2 from "ttf2woff2";
import {
  globesExist,
  batchCopyFiles,
  batchProcessFiles,
  createTaskResult,
  TASK_RESULT,
  writeDebugLog,
} from "../utils/common.mjs";
import fastGlob from "fast-glob";

// Helper function to convert TTF/OTF to WOFF2
async function convertToWoff2(inputPath, outputPath) {
  try {
    const input = await fs.readFile(inputPath);
    const output = ttf2woff2(input);
    await fs.writeFile(outputPath, output);
    return true;
  } catch (error) {
    writeDebugLog(`Failed to convert ${inputPath} to WOFF2: ${error.message}`);
    return false;
  }
}

// Helper function to check if file should be converted to WOFF2
function shouldConvertToWoff2(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return [".ttf", ".otf"].includes(ext);
}

// Helper function to update font preload links in header.php
async function updateFontPreloads(processedFonts) {
  try {
    const headerPath = path.join(cfg.path.build.theme, "header.php");

    if (!(await fs.pathExists(headerPath))) {
      writeDebugLog(
        "Fonts",
        "Header.php not found, skipping font preload update"
      );
      return { updated: false, reason: "header.php not found" };
    }

    const headerContent = await fs.readFile(headerPath, "utf8");
    const startMarker = "<!-- startFontsPreload -->";
    const endMarker = "<!-- endFontsPreload -->";

    const startIndex = headerContent.indexOf(startMarker);
    const endIndex = headerContent.indexOf(endMarker);

    if (startIndex === -1 || endIndex === -1) {
      writeDebugLog("Fonts", "Font preload markers not found in header.php");
      return { updated: false, reason: "preload markers not found" };
    }

    // Generate preload links for processed fonts
    const preloadLinks = processedFonts
      .filter((font) => font.endsWith(".woff2"))
      .sort() // Sort fonts for consistent ordering
      .map((font) => {
        const fontName = path.basename(font);
        return `  <link rel="preload" as="font" type="font/woff2" href="<?php assets('fonts/${fontName}');?>" crossorigin>`;
      })
      .join("\n");

    // Extract current preload section
    const currentPreloadStart = startIndex + startMarker.length;
    const currentPreloadEnd = endIndex;
    const currentPreloadSection = headerContent
      .substring(currentPreloadStart, currentPreloadEnd)
      .trim();

    // Build new preload section
    const newPreloadSection = preloadLinks.trim();

    // Check if the preload section has actually changed
    if (currentPreloadSection === newPreloadSection) {
      writeDebugLog(
        "Fonts",
        `Font preload links unchanged in header.php (${processedFonts.length} fonts already present)`
      );
      return {
        updated: false,
        reason: "no changes needed",
        fontsCount: processedFonts.length,
      };
    }

    // Build new content with updated preload section
    const beforeMarker = headerContent.substring(0, currentPreloadStart);
    const afterMarker = headerContent.substring(currentPreloadEnd);
    const newContent = `${beforeMarker}\n${preloadLinks}\n  ${afterMarker}`;

    await fs.writeFile(headerPath, newContent, "utf8");
    writeDebugLog(
      "Fonts",
      `Updated font preload links in header.php for ${processedFonts.length} fonts`
    );
    return {
      updated: true,
      reason: "preload links updated",
      fontsCount: processedFonts.length,
    };
  } catch (error) {
    writeDebugLog("Fonts", `Failed to update font preloads: ${error.message}`);
    return { updated: false, reason: `error: ${error.message}` };
  }
}

export async function fontsTask(env = "development") {
  if (!globesExist(cfg.path.src.fonts)) {
    return null;
  }

  try {
    // Get all font files
    const files = await fastGlob(cfg.path.src.fonts, {
      onlyFiles: true,
      dot: true,
    });

    // Ensure destination directory exists
    await fs.ensureDir(cfg.path.build.fonts);

    if (env === "development") {
      // Development mode: Copy WOFF2 fonts and convert TTF/OTF to WOFF2
      const processedFonts = []; // Track processed font files
      let convertedCount = 0;

      // Separate files by type for efficient processing
      const woff2Files = files.filter(
        (file) => path.extname(file).toLowerCase() === ".woff2"
      );
      const convertibleFiles = files.filter((file) =>
        shouldConvertToWoff2(file)
      );

      // First, copy existing WOFF2 files efficiently
      if (woff2Files.length > 0) {
        const copyResults = await batchCopyFiles({
          files: woff2Files,
          srcBase: cfg.path.srcBase,
          destBase: cfg.path.build.fonts,
          env,
          getRelativePath: (file) => path.basename(file), // Flatten structure - use filename only
          getDestPath: (fileName) => path.join(cfg.path.build.fonts, fileName),
          taskName: "Fonts",
        });

        // Track copied WOFF2 files
        woff2Files.forEach((file) => {
          processedFonts.push(path.basename(file));
        });
      }

      // Then, convert TTF/OTF files to WOFF2
      let conversionResults = {
        processed: 0,
        skipped: 0,
        total: 0,
        errors: [],
      };
      if (convertibleFiles.length > 0) {
        conversionResults = await batchProcessFiles({
          files: convertibleFiles,
          srcBase: cfg.path.srcBase,
          destBase: cfg.path.build.fonts,
          env,
          getRelativePath: (file) => path.basename(file), // Flatten structure - use filename only
          getDestPath: (fileName) => path.join(cfg.path.build.fonts, fileName),
          processFile: async (srcPath, destPath, fileName) => {
            const woff2FileName =
              path.basename(srcPath, path.extname(srcPath)) + ".woff2";
            const woff2Path = path.join(cfg.path.build.fonts, woff2FileName);

            const converted = await convertToWoff2(srcPath, woff2Path);
            if (converted) {
              convertedCount++;
              processedFonts.push(woff2FileName); // Add to processed fonts
            } else {
              // Conversion failed - throw error to be caught by batchProcessFiles
              throw new Error(`Failed to convert ${fileName} to WOFF2`);
            }
          },
          taskName: "Fonts",
        });
      }

      // Combine results from both operations
      const totalProcessed = woff2Files.length + conversionResults.processed;
      const totalSkipped = conversionResults.skipped;
      const totalFiles = files.length;
      const totalErrors = conversionResults.errors;

      return createTaskResult(
        totalErrors.length > 0 ? TASK_RESULT.ERROR : TASK_RESULT.SUCCESS,
        totalErrors.length > 0
          ? `Font processing failed: ${totalErrors.length} conversion error(s), ${totalProcessed} processed successfully`
          : `Processed ${totalProcessed} file(s) (${convertedCount} converted to WOFF2)`,
        totalErrors.length > 0 ? { errors: totalErrors } : null,
        {
          processed: totalProcessed,
          skipped: totalSkipped,
          total: totalFiles,
          converted: convertedCount,
          convertedType: "WOFF2",
          failed: totalErrors.length,
          totalFound: files.length,
        }
      );
    } else {
      // Production mode: Convert TTF/OTF to WOFF2 and copy WOFF2 + non-convertible fonts
      const processedFonts = []; // Track all processed font files for preload updates
      let convertedCount = 0;

      // Separate files by type for efficient processing
      const woff2Files = files.filter(
        (file) => path.extname(file).toLowerCase() === ".woff2"
      );
      const convertibleFiles = files.filter((file) =>
        shouldConvertToWoff2(file)
      );
      const otherFiles = files.filter(
        (file) =>
          !shouldConvertToWoff2(file) &&
          path.extname(file).toLowerCase() !== ".woff2"
      );

      // First, copy existing WOFF2 and other web font files efficiently
      const copyFiles = [...woff2Files, ...otherFiles];
      if (copyFiles.length > 0) {
        const copyResults = await batchCopyFiles({
          files: copyFiles,
          srcBase: cfg.path.srcBase,
          destBase: cfg.path.build.fonts,
          env,
          getRelativePath: (file) => path.basename(file), // Flatten structure - use filename only
          getDestPath: (fileName) => path.join(cfg.path.build.fonts, fileName),
          taskName: "Fonts",
        });

        // Track copied files
        copyFiles.forEach((file) => {
          processedFonts.push(path.basename(file));
        });
      }

      // Then, convert TTF/OTF files to WOFF2
      let conversionResults = {
        processed: 0,
        skipped: 0,
        total: 0,
        errors: [],
      };
      if (convertibleFiles.length > 0) {
        conversionResults = await batchProcessFiles({
          files: convertibleFiles,
          srcBase: cfg.path.srcBase,
          destBase: cfg.path.build.fonts,
          env,
          getRelativePath: (file) => path.basename(file), // Flatten structure - use filename only
          getDestPath: (fileName) => path.join(cfg.path.build.fonts, fileName),
          processFile: async (srcPath, destPath, fileName) => {
            const woff2FileName =
              path.basename(srcPath, path.extname(srcPath)) + ".woff2";
            const woff2Path = path.join(cfg.path.build.fonts, woff2FileName);

            const converted = await convertToWoff2(srcPath, woff2Path);
            if (converted) {
              convertedCount++;
              processedFonts.push(woff2FileName); // Add to processed fonts
            } else {
              // Conversion failed - throw error to be caught by batchProcessFiles
              throw new Error(`Failed to convert ${fileName} to WOFF2`);
            }
          },
          taskName: "Fonts",
          useChangeDetection: false, // Don't use change detection in production mode
        });
      }

      // Combine results from both operations
      const totalProcessed = copyFiles.length + conversionResults.processed;
      const totalSkipped = conversionResults.skipped;
      const totalFiles = files.length;
      const totalErrors = conversionResults.errors;

      // Update font preload links in header.php if fonts were processed
      let preloadUpdateResult = {
        updated: false,
        reason: "no fonts processed",
      };
      if (processedFonts.length > 0) {
        writeDebugLog(
          "Fonts",
          `Attempting to update font preload links for ${processedFonts.length} fonts`
        );
        preloadUpdateResult = await updateFontPreloads(processedFonts);

        if (preloadUpdateResult.updated) {
          writeDebugLog(
            "Fonts",
            `Successfully updated font preload links in header.php`
          );
        } else {
          writeDebugLog(
            "Fonts",
            `Font preload update skipped: ${preloadUpdateResult.reason}`
          );
        }
      } else {
        writeDebugLog("Fonts", "No fonts processed, skipping preload update");
      }

      return createTaskResult(
        totalErrors.length > 0 ? TASK_RESULT.ERROR : TASK_RESULT.SUCCESS,
        totalErrors.length > 0
          ? `Font processing failed: ${totalErrors.length} conversion error(s), ${totalProcessed} processed successfully`
          : `Processed ${totalProcessed} file(s) in parallel (${convertedCount} converted to WOFF2)${
              preloadUpdateResult.updated ? ", preload links updated" : ""
            }`,
        totalErrors.length > 0 ? { errors: totalErrors } : null,
        {
          processed: totalProcessed,
          skipped: totalSkipped,
          total: totalFiles,
          converted: convertedCount,
          convertedType: "WOFF2",
          failed: totalErrors.length,
          concurrency: copyFiles.length + conversionResults.concurrency || 0,
          preloadUpdated: preloadUpdateResult.updated,
          preloadReason: preloadUpdateResult.reason,
        }
      );
    }
  } catch (error) {
    return createTaskResult(
      TASK_RESULT.ERROR,
      `Fonts task failed: ${error.message}`,
      { stack: error.stack, originalError: error }
    );
  }
}
