import lighthouse from "lighthouse";
import * as chromeLauncher from "chrome-launcher";
import fs from "fs-extra";
import path from "path";
import { fileURLToPath } from "url";
import cfg from "../config.mjs";
import {
  log,
  createTaskResult,
  TASK_RESULT,
  getArgs,
  writeDebugLog,
} from "../utils/common.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Embedded Lighthouse configs (moved from .bbg/configs/*)
const LH_CONFIG_DESKTOP = {
  extends: "lighthouse:default",
  settings: {
    formFactor: "desktop",
    throttlingMethod: "simulate",
    throttling: {
      rttMs: 40,
      throughputKbps: 10240,
      cpuSlowdownMultiplier: 1,
    },
    onlyCategories: ["performance"],
  },
};

const LH_CONFIG_MOBILE = {
  extends: "lighthouse:default",
  settings: {
    formFactor: "mobile",
    throttlingMethod: "simulate",
    throttling: {
      rttMs: 150,
      throughputKbps: 1600,
      cpuSlowdownMultiplier: 4,
    },
    onlyCategories: ["performance"],
  },
};

function createRunId(date = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(
    date.getDate()
  )}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

function auditHasActionableItems(audit) {
  return Array.isArray(audit?.details?.items) && audit.details.items.length > 0;
}

function getItemUrl(item) {
  if (!item || typeof item !== "object") return null;
  if (typeof item.url === "string" && item.url) return item.url;
  if (typeof item.source?.url === "string" && item.source.url)
    return item.source.url;
  return null;
}

function itemHasSavingsSignals(item) {
  if (!item || typeof item !== "object") return false;

  const keys = [
    "wastedBytes",
    "wastedMs",
    "estimatedSavingsBytes",
    "estimatedSavingsMs",
    "savingsMs",
    "cacheLifetimeMs",
    "cacheHitProbability",
  ];

  return keys.some(
    (k) =>
      typeof item[k] === "number" && Number.isFinite(item[k]) && item[k] > 0
  );
}

function auditIsActionableForAi(audit) {
  if (!auditHasActionableItems(audit)) return false;

  // Opportunities are actionable by definition; their per-item fields vary widely.
  if (audit.details?.type === "opportunity") return true;

  // For informative + diagnostics, require at least one item that has a URL and a savings/waste signal.
  return audit.details.items.some(
    (item) => !!getItemUrl(item) && itemHasSavingsSignals(item)
  );
}

const SUPPRESSED_AUDIT_IDS = new Set([
  // Local runs often use http:// and do not reflect production protocol setup.
  "uses-http2",
  "uses-https",
  "is-on-https",
  "redirects-http",
]);

const IMAGE_SELECTOR_AUDIT_IDS = new Set([
  // Image audits where mapping back to markup is valuable.
  "uses-responsive-images",
  "offscreen-images",
  "modern-image-formats",
  "uses-optimized-images",
  "uses-webp-images",
  "uses-avif-images",
]);

function getFirstFiniteNumber(obj, keys) {
  for (const key of keys) {
    const val = obj?.[key];
    if (typeof val === "number" && Number.isFinite(val) && val > 0) return val;
  }
  return null;
}

function getDimensionPair(item, widthKeys, heightKeys) {
  const width = getFirstFiniteNumber(item, widthKeys);
  const height = getFirstFiniteNumber(item, heightKeys);
  if (width === null || height === null) return null;

  // Lighthouse often gives integer pixel sizes; keep it lean and normalize.
  return {
    width: Math.round(width),
    height: Math.round(height),
  };
}

function parseWxHFromUrl(url) {
  if (typeof url !== "string" || !url) return null;

  // Strip query/hash to keep matching simple.
  const clean = url.split("#")[0].split("?")[0];
  const file = clean.split("/").pop() || clean;

  // WordPress commonly encodes delivered image pixels in the filename: `name-768x583.webp`.
  const match = file.match(/(?:-|_)(\d{2,5})x(\d{2,5})(?=\.[a-z0-9]+$)/i);
  if (!match) return null;

  const width = Number(match[1]);
  const height = Number(match[2]);
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  )
    return null;

  return { width, height };
}

function parseAndValidateHttpUrl(u) {
  // Accept only absolute http/https URLs. Returns normalized string or null on failure.
  if (typeof u !== "string" || !u) return null;
  try {
    const parsed = new URL(u);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:")
      return null;
    return parsed.toString();
  } catch (err) {
    return null;
  }
}

function pruneAuditItem(item, auditId) {
  if (!item || typeof item !== "object") return item;

  const out = {};

  const url = getItemUrl(item);
  if (url) out.url = url;

  // For this audit, protocol is the point.
  if (auditId === "uses-http2" && typeof item.protocol === "string") {
    out.protocol = item.protocol;
  }

  if (IMAGE_SELECTOR_AUDIT_IDS.has(auditId)) {
    const selector =
      typeof item.node?.selector === "string" ? item.node.selector : null;
    if (selector) out.nodeSelector = selector;
  }

  if (auditId === "uses-responsive-images") {
    // Lighthouse uses a few different field names depending on version.
    // We only emit compact sizes (e.g. "296x225") when both parts exist.
    const expected =
      getDimensionPair(
        item,
        ["displayedWidth", "displayedWidthPx", "displayedImageWidth"],
        ["displayedHeight", "displayedHeightPx", "displayedImageHeight"]
      ) || getDimensionPair(item?.node?.boundingRect, ["width"], ["height"]);

    const actual =
      getDimensionPair(
        item,
        ["actualWidth", "naturalWidth", "imageWidth", "resourceWidth"],
        ["actualHeight", "naturalHeight", "imageHeight", "resourceHeight"]
      ) || parseWxHFromUrl(url);

    if (expected) out.expected_size = `${expected.width}x${expected.height}`;
    if (actual) out.actual_size = `${actual.width}x${actual.height}`;
  }

  const numericKeys = [
    "wastedBytes",
    "wastedMs",
    "totalBytes",
    "estimatedSavingsBytes",
    "estimatedSavingsMs",
    "savingsMs",
    "cacheLifetimeMs",
    "cacheHitProbability",
  ].filter((key) => {
    if (
      auditId === "uses-responsive-images" &&
      (key === "wastedBytes" || key === "totalBytes")
    )
      return false;
    return true;
  });
  for (const key of numericKeys) {
    if (typeof item[key] === "number") out[key] = item[key];
  }

  return out;
}

function pruneAudit(audit) {
  const items = Array.isArray(audit?.details?.items)
    ? audit.details.items.map((item) => pruneAuditItem(item, audit.id))
    : undefined;

  return {
    id: audit.id,
    title: audit.title || null,
    score: audit.score,
    displayValue: audit.displayValue || null,
    details: {
      type: audit.details?.type || null,
      overallSavingsMs: audit.details?.overallSavingsMs,
      overallSavingsBytes: audit.details?.overallSavingsBytes,
      items,
    },
  };
}

function buildAiJsonReport({
  lhr,
  performanceScore,
  device,
  targetUrl,
  runId,
}) {
  const audits = lhr?.audits || {};

  const metricIds = [
    "first-contentful-paint",
    "largest-contentful-paint",
    "total-blocking-time",
    "cumulative-layout-shift",
    "speed-index",
  ];

  const metrics = {};
  for (const metricId of metricIds) {
    const metricAudit = audits[metricId];
    if (!metricAudit?.title) continue;
    metrics[metricId] = {
      title: metricAudit.title,
      value: metricAudit.displayValue || null,
    };
  }

  const auditEntries = Object.entries(audits);

  const insights = auditEntries
    .filter(([id]) => String(id).endsWith("-insight"))
    .filter(([id]) => !SUPPRESSED_AUDIT_IDS.has(id))
    .filter(
      ([, audit]) =>
        audit.score !== null && audit.score < 1 && auditIsActionableForAi(audit)
    )
    .map(([id, audit]) => pruneAudit({ id, ...audit }));

  const opportunities = auditEntries
    .filter(([id]) => !SUPPRESSED_AUDIT_IDS.has(id))
    .filter(
      ([, audit]) =>
        audit.details?.type === "opportunity" &&
        audit.score !== null &&
        audit.score < 1 &&
        auditIsActionableForAi(audit)
    )
    .sort(
      ([, a], [, b]) =>
        (b.details?.overallSavingsMs || 0) - (a.details?.overallSavingsMs || 0)
    )
    .map(([id, audit]) => pruneAudit({ id, ...audit }));

  const diagnostics = auditEntries
    .filter(([, audit]) => audit.details?.type !== "opportunity")
    .filter(([id]) => !SUPPRESSED_AUDIT_IDS.has(id))
    .filter(([id]) => !String(id).endsWith("-insight"))
    .filter(([, audit]) => auditIsActionableForAi(audit))
    .filter(
      ([, audit]) =>
        audit.scoreDisplayMode === "informative" ||
        (audit.score !== null && audit.score < 1)
    )
    .map(([id, audit]) => pruneAudit({ id, ...audit }));

  return {
    schemaVersion: "bbg.lighthouse.ai-report.v8",
    runId,
    device,
    requestedUrl: targetUrl,
    scores: {
      performance: Math.round(performanceScore),
    },
    metrics,
    insights,
    opportunities,
    diagnostics,
  };
}

/**
 * Run Lighthouse performance audit
 * @param {Object} args - Command line arguments
 * @returns {Promise<Object>} Task result
 */
export async function lighthouseTask(args = {}) {
  const isDebug = getArgs().debug || false;
  const shouldOpen = getArgs().open || false;
  const startTime = Date.now();

  try {
    // Ensure reports directory exists
    const reportsDir = path.resolve(".reports");
    await fs.ensureDir(reportsDir);

    // Get target URL: prefer CLI override (--url) and validate it, otherwise fall back to config
    const urlArg = getArgs().url || null;
    let targetUrl = null;

    if (urlArg) {
      const normalized = parseAndValidateHttpUrl(String(urlArg));
      if (!normalized) {
        return createTaskResult(
          TASK_RESULT.ERROR,
          `Invalid --url: must be an absolute http(s) URL (received: ${urlArg})`,
          { url: urlArg }
        );
      }
      targetUrl = normalized;
    } else {
      targetUrl = cfg.url?.local || null;
      if (!targetUrl) {
        return createTaskResult(
          TASK_RESULT.ERROR,
          "No local URL found in config.json",
          { configPath: "config.json" }
        );
      }
    }

    log.info(`Running Lighthouse audit on ${targetUrl}...`);

    if (isDebug) {
      writeDebugLog("Lighthouse", `Starting audit for ${targetUrl}`);
    }

    // Decide which devices to run: default -> desktop + mobile
    const devicesArg = getArgs().device || getArgs().devices || null;
    let devices = ["desktop", "mobile"];
    if (devicesArg) {
      devices = String(devicesArg)
        .split(",")
        .map((d) => d.trim().toLowerCase())
        .filter(Boolean);
    }

    const runId = createRunId();

    // Launch Chrome once and reuse for all audits
    const chrome = await chromeLauncher.launch({
      chromeFlags: ["--headless", "--disable-gpu", "--no-sandbox"],
    });

    if (isDebug) {
      writeDebugLog("Lighthouse", `Chrome launched on port ${chrome.port}`);
    }

    const results = [];
    // CLI: --min=<n> - when provided the task will fail if any device score < n
    const minRaw = getArgs().min || null;
    const minThreshold = minRaw ? Number(minRaw) : null;
    // Optional lightweight summary format: --summary=json (only write JSON summary when requested)
    // Summary: presence of --summary will write a lightweight JSON summary
    // Support both boolean flag (--summary) and explicit value (--summary=json)
    const summaryArg = getArgs().summary || getArgs().summaryFormat || null;
    let summaryFormat = null;
    if (summaryArg === true) {
      summaryFormat = "json";
    } else if (summaryArg) {
      summaryFormat = String(summaryArg).toLowerCase();
    }

    for (const device of devices) {
      log.info(`Running Lighthouse audit for ${device}...`);

      // Device-specific options
      const options = {
        logLevel: isDebug ? "info" : "error",
        // generate HTML only - JSON reports are intentionally omitted to reduce noise
        output: ["html"],
        port: chrome.port,
        onlyCategories: ["performance"],
        formFactor: device === "mobile" ? "mobile" : "desktop",
        screenEmulation:
          device === "mobile"
            ? {
                mobile: true,
                width: 360,
                height: 800,
                deviceScaleFactor: 2,
                disabled: false,
              }
            : {
                mobile: false,
                width: 1920,
                height: 1080,
                deviceScaleFactor: 1,
                disabled: false,
              },
        throttling:
          device === "mobile"
            ? {
                rttMs: 150,
                throughputKbps: 1600,
                cpuSlowdownMultiplier: 4,
                requestLatencyMs: 150,
                downloadThroughputKbps: 1600,
                uploadThroughputKbps: 768,
              }
            : {
                rttMs: 40,
                throughputKbps: 10240,
                cpuSlowdownMultiplier: 1,
                requestLatencyMs: 0,
                downloadThroughputKbps: 0,
                uploadThroughputKbps: 0,
              },
      };

      // Use embedded per-device configs (moved into this file)
      let configModule = null;
      if (device === "desktop") {
        configModule = LH_CONFIG_DESKTOP;
        if (isDebug)
          writeDebugLog("Lighthouse", "Using embedded desktop config");
      } else if (device === "mobile") {
        configModule = LH_CONFIG_MOBILE;
        if (isDebug)
          writeDebugLog("Lighthouse", "Using embedded mobile config");
      }

      // Run Lighthouse audit for this device (pass config if present)
      const runnerResult = configModule
        ? await lighthouse(targetUrl, options, configModule)
        : await lighthouse(targetUrl, options);

      if (!runnerResult || !runnerResult.report) {
        // If one device run fails, keep trying the rest but record error
        results.push({ device, success: false, error: "No results returned" });
        continue;
      }

      // Generate compact report filename with shared run id
      const reportFilename = `lh-${device}-${runId}`; // e.g. lh-desktop-20251207-140712
      const htmlPath = path.join(reportsDir, `${reportFilename}.html`);
      const jsonPath = path.join(reportsDir, `${reportFilename}.json`);

      // Save HTML (runnerResult.report may be a string or array - we keep the HTML only)
      const htmlContent = Array.isArray(runnerResult.report)
        ? runnerResult.report[0]
        : runnerResult.report;
      await fs.writeFile(htmlPath, htmlContent);

      // Extract performance score and generate text report
      const performanceScore =
        (runnerResult.lhr?.categories?.performance?.score || 0) * 100;
      const audits = runnerResult.lhr?.audits || {};
      const aiJsonReport = buildAiJsonReport({
        lhr: runnerResult.lhr,
        performanceScore,
        device,
        targetUrl,
        runId,
      });
      await fs.writeFile(jsonPath, JSON.stringify(aiJsonReport, null, 2));

      const keyMetrics = {
        "First Contentful Paint":
          audits["first-contentful-paint"]?.displayValue,
        "Largest Contentful Paint":
          audits["largest-contentful-paint"]?.displayValue,
        "Total Blocking Time": audits["total-blocking-time"]?.displayValue,
        "Cumulative Layout Shift":
          audits["cumulative-layout-shift"]?.displayValue,
        "Speed Index": audits["speed-index"]?.displayValue,
      };

      if (isDebug) {
        writeDebugLog("Lighthouse", `HTML report saved: ${htmlPath}`);
        writeDebugLog("Lighthouse", `AI JSON report saved: ${jsonPath}`);
        writeDebugLog("Lighthouse", `Performance score: ${performanceScore}`);
        writeDebugLog(
          "Lighthouse",
          `Metrics: ${JSON.stringify(keyMetrics, null, 2)}`
        );
      }

      // Keep results (no JSON path anymore)
      results.push({
        device,
        success: true,
        score: Math.round(performanceScore),
        htmlPath,
        jsonPath,
        metrics: keyMetrics,
      });
    }

    // Close Chrome (wrap in try-catch to handle Windows cleanup issues)
    try {
      await chrome.kill();
    } catch (cleanupError) {
      if (isDebug) {
        writeDebugLog(
          "Lighthouse",
          `Chrome cleanup warning: ${cleanupError.message}`
        );
      }
      // Continue - cleanup error doesn't affect results
    }

    const duration = Date.now() - startTime;

    // Write a short summary TXT file (human + simple parsing) and optionally enforce minimum score
    try {
      const summaryLines = [];
      summaryLines.push(`URL: ${targetUrl}`);
      summaryLines.push(`DurationMs: ${duration}`);
      summaryLines.push("Results:");
      results.forEach((r) => {
        if (!r.success) {
          summaryLines.push(
            `  - ${r.device}: FAILED (${r.error || "unknown error"})`
          );
          return;
        }
        summaryLines.push(`  - ${r.device}: ${r.score}/100`);
        summaryLines.push(`    html: ${r.htmlPath}`);
        summaryLines.push(`    json: ${r.jsonPath}`);
      });

      const summaryFilename = `lh-summary-${runId}.txt`;
      const summaryPath = path.join(reportsDir, summaryFilename);
      await fs.writeFile(summaryPath, summaryLines.join("\n"));
      log.info(`Summary written: ${summaryPath}`);

      // Optionally write a light JSON summary when requested (useful for CI tooling)
      let summaryJsonPath = null;
      if (summaryFormat === "json") {
        try {
          const minimal = {
            timestamp: new Date().toISOString(),
            runId,
            url: targetUrl,
            durationMs: duration,
            results: results.map((r) =>
              r.success
                ? {
                    device: r.device,
                    score: r.score,
                    html: r.htmlPath,
                    json: r.jsonPath,
                  }
                : { device: r.device, success: false, error: r.error }
            ),
          };
          summaryJsonPath = path.join(reportsDir, `lh-summary-${runId}.json`);
          await fs.writeFile(summaryJsonPath, JSON.stringify(minimal, null, 2));
          log.info(`JSON summary written: ${summaryJsonPath}`);
        } catch (jerr) {
          if (isDebug)
            writeDebugLog(
              "Lighthouse",
              `Failed to write JSON summary: ${jerr.message}`
            );
        }
      }

      // If a --min threshold is provided, enforce it (fail when any device is below)
      if (minThreshold !== null && !Number.isNaN(minThreshold)) {
        const failedDevices = results.filter(
          (r) => r.success && (r.score === null || r.score < minThreshold)
        );
        if (failedDevices.length > 0) {
          const failedList = failedDevices
            .map((d) => `${d.device}:${d.score}`)
            .join(", ");
          log.error(
            `Minimum threshold check failed - devices under ${minThreshold}: ${failedList}`
          );
          return createTaskResult(
            TASK_RESULT.ERROR,
            `Minimum threshold failure: ${failedList}`,
            null,
            {
              summaryPath,
              summaryJsonPath,
              failedDevices,
            }
          );
        }
      }
    } catch (err) {
      if (isDebug)
        writeDebugLog("Lighthouse", `Failed to write summary: ${err.message}`);
      // Non-fatal - continue
    }

    // Optionally open a single report at the end (combined if both devices requested)
    if (shouldOpen) {
      try {
        const { default: open } = await import("open");
        const firstSuccess = results.find((r) => r.success);
        const toOpen = firstSuccess?.htmlPath;
        if (toOpen) {
          await open(toOpen);
          log.info(`Report opened in browser: ${toOpen}`);
        } else {
          log.warn("No report to open (all devices failed).");
        }
      } catch (oerr) {
        if (isDebug)
          writeDebugLog("Lighthouse", `Failed to open report: ${oerr.message}`);
      }
    }

    // Display results for each device
    console.log("");
    results.forEach((r) => {
      if (!r.success) {
        log.warn(`Lighthouse (${r.device}) failed: ${r.error}`);
        return;
      }

      log.success(
        `Performance Score (${r.device}): ${Math.round(r.score)}/100`
      );
      console.log("");
      console.log(`Key Metrics (${r.device}):`);
      Object.entries(r.metrics).forEach(([name, value]) => {
        console.log(`  ${name}: ${value}`);
      });
      console.log("");
      log.info(`HTML report: ${r.htmlPath}`);
      log.info(`AI JSON report: ${r.jsonPath}`);
    });

    return createTaskResult(
      TASK_RESULT.SUCCESS,
      `Lighthouse audits completed in ${Math.round(duration / 1000)}s`,
      null,
      {
        duration,
        results,
      }
    );
  } catch (error) {
    if (isDebug) {
      writeDebugLog("Lighthouse", `Error: ${error.message}`);
      writeDebugLog("Lighthouse", `Stack: ${error.stack}`);
    }

    return createTaskResult(
      TASK_RESULT.ERROR,
      `Lighthouse task failed: ${error.message}`,
      {
        stack: error.stack,
        originalError: error,
      }
    );
  }
}
