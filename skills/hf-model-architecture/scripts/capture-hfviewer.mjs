#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCHEMA_VERSION = "1.0.0";
const DEFAULT_OPTIONS = Object.freeze({
  baseUrl: "https://hfviewer.com",
  deviceScaleFactor: 2,
  headless: true,
  height: 1152,
  level: "4",
  outDir: ".",
  padding: 24,
  timeoutSeconds: 120,
  width: 2048
});

export function normalizeModelId(input) {
  const trimmed = String(input || "").trim();
  if (trimmed === "") {
    throw new Error("A Hugging Face model id or URL is required.");
  }

  const pathValue = looksLikeUrl(trimmed) ? modelPathFromUrl(trimmed) : trimmed;
  const segments = pathValue
    .replace(/^\/+|\/+$/g, "")
    .split("/")
    .filter(Boolean)
    .map((segment) => decodeURIComponent(segment.trim()));

  if (segments.length < 2) {
    throw new Error(`Expected a Hugging Face model id like "owner/model", received "${input}".`);
  }

  const modelId = segments.slice(0, 2).join("/");
  if (!/^[^\s/]+\/[^\s/]+$/.test(modelId)) {
    throw new Error(`Invalid Hugging Face model id: "${modelId}".`);
  }

  return modelId;
}

export function parseLevelOption(value = DEFAULT_OPTIONS.level) {
  const raw = String(value || DEFAULT_OPTIONS.level).trim().toLowerCase();
  const aliases = {
    block: { requestedLevel: "block", hfviewerLevel: 0 },
    detailed: { requestedLevel: "detailed", hfviewerLevel: 1 },
    fine: { requestedLevel: "fine", hfviewerLevel: 2 }
  };
  if (aliases[raw]) {
    return {
      ...aliases[raw],
      granularityLabel: labelForHfviewerLevel(aliases[raw].hfviewerLevel)
    };
  }

  const requestedLevel = Number(raw);
  if (!Number.isFinite(requestedLevel) || requestedLevel < 0) {
    throw new Error(`Invalid granularity level: "${value}".`);
  }

  const hfviewerLevel = requestedLevel > 2 ? Math.round(requestedLevel) - 1 : Math.round(requestedLevel);
  return {
    requestedLevel,
    hfviewerLevel,
    granularityLabel: labelForHfviewerLevel(hfviewerLevel)
  };
}

export function labelForHfviewerLevel(level) {
  const numericLevel = Math.max(0, Math.round(Number(level) || 0));
  if (numericLevel > 2) {
    return `Level ${numericLevel + 1}`;
  }
  if (numericLevel > 1) {
    return "Fine";
  }
  if (numericLevel > 0) {
    return "Detailed";
  }
  return "Block";
}

export function parseInfoPanelText(text) {
  const lines = normalizeLines(text);
  const title = lines.find((line) => /\bmodel$/i.test(line)) || lines[0] || "";
  const summaryText = findSummaryLine(lines);
  const semanticLine = lines.find((line) => /SEMANTIC FLOW/i.test(line)) || "";
  const outputShape = valueAfterHeading(lines, "Model output");
  const operationHeadingIndex = lines.findIndex((line) => /^Operation types$/i.test(line));
  const operationLines = operationHeadingIndex >= 0
    ? linesBetweenHeading(lines, operationHeadingIndex, SECTION_HEADINGS)
    : [];
  const operationCount = operationHeadingIndex >= 0
    ? parseInteger(operationLines[0] || "")
    : null;
  const operationTypes = operationHeadingIndex >= 0
    ? parseOperationTypes(operationLines)
    : [];
  const attributes = parseKeyValueSection(lines, "Model attributes", SECTION_HEADINGS);

  return {
    model: {
      title,
      nodeCount: parseSummaryInteger(summaryText, /([\d,]+)\s+nodes?/i),
      operationTypeCount: parseSummaryInteger(summaryText, /([\d,]+)\s+op\s+types?/i),
      operationCount,
      tokenVocab: parseSummaryInteger(summaryText, /([\d,]+)\s*-\s*token\s+vocab/i),
      latency: extractLatency(summaryText),
      semanticFlow: extractSemanticFlow(semanticLine),
      fidelity: extractFidelity(semanticLine),
      outputShape,
      summaryText: summaryText || null,
      attributes
    },
    operationTypes,
    sections: buildSections(lines),
    rawLines: lines
  };
}

export function buildOutputPayload({
  artifacts,
  capturedAt,
  extraction,
  granularity,
  modelId,
  pageTitle,
  warnings = []
}) {
  const encodedModelPath = encodeModelIdPath(modelId);
  return {
    schemaVersion: SCHEMA_VERSION,
    source: {
      modelId,
      hfviewerUrl: `https://hfviewer.com/${encodedModelPath}`,
      huggingFaceUrl: `https://huggingface.co/${encodedModelPath}`,
      capturedAt,
      requestedLevel: granularity.requestedLevel,
      hfviewerLevel: granularity.hfviewerLevel,
      granularityLabel: granularity.granularityLabel
    },
    artifacts,
    model: extraction.model,
    operationTypes: extraction.operationTypes,
    sections: extraction.sections,
    raw: {
      infoPanelText: extraction.rawLines.join("\n"),
      pageTitle,
      rightPanelLines: extraction.rawLines
    },
    warnings
  };
}

export function parseTimeoutSeconds(value, fallback = DEFAULT_OPTIONS.timeoutSeconds) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    throw new Error(`Invalid timeout: "${value}". Use a positive number of seconds, e.g. --timeout 300.`);
  }

  return Math.round(seconds);
}

export function resolveTimeoutSeconds(options = {}) {
  if (options.timeoutSeconds !== undefined) {
    return parseTimeoutSeconds(options.timeoutSeconds);
  }
  if (options.timeoutMs !== undefined) {
    return parseTimeoutSeconds(Number(options.timeoutMs) / 1000);
  }
  return DEFAULT_OPTIONS.timeoutSeconds;
}

export function buildCaptureFailureMessage({
  modelId,
  hfviewerUrl,
  timeoutSeconds,
  cause,
  processingModalVisible = false
}) {
  const lines = [
    `Failed to capture model structure for ${modelId} from hfviewer.com.`
  ];

  if (processingModalVisible) {
    lines.push(
      "",
      "hfviewer showed a \"Processing model\" dialog (the model is still processing or queued).",
      "Layerdex waits for the page to finish rendering and does not support email notification."
    );
  }

  const causeMessage = cause instanceof Error ? cause.message : String(cause || "");
  const timedOut = /timeout/i.test(causeMessage) || cause?.name === "TimeoutError";
  if (timedOut) {
    lines.push(
      "",
      `Timed out after ${timeoutSeconds}s. Retry with a longer wait, e.g. --timeout 300.`
    );
  }

  lines.push(
    "",
    "Could not retrieve this model's architecture from hfviewer. Open the page manually:",
    hfviewerUrl,
    "",
    "This model may not have been indexed or cached by hfviewer yet, especially for large or rarely viewed models."
  );

  if (causeMessage) {
    lines.push("", `Original error: ${causeMessage}`);
  }

  return lines.join("\n");
}

export function parseCliArgs(argv) {
  const initial = {
    ...DEFAULT_OPTIONS,
    modelInput: "",
    showHelp: false
  };

  return readCliToken(argv, 0, initial);
}

async function main() {
  const options = parseCliArgs(process.argv.slice(2));
  if (options.showHelp || !options.modelInput) {
    printHelp();
    process.exit(options.showHelp ? 0 : 1);
  }

  const result = await captureHfviewer(options);
  console.log(JSON.stringify({
    diagramPng: result.artifacts.diagramPng,
    infoJson: result.artifacts.infoJson,
    modelId: result.source.modelId,
    granularityLabel: result.source.granularityLabel,
    warnings: result.warnings
  }, null, 2));
}

export async function captureHfviewer(options) {
  const modelId = normalizeModelId(options.modelInput);
  const granularity = parseLevelOption(options.level);
  const playwright = await importPlaywright();
  const outDir = path.resolve(options.outDir || DEFAULT_OPTIONS.outDir);
  const encodedModelPath = encodeModelIdPath(modelId);
  const hfviewerUrl = `${trimTrailingSlash(options.baseUrl || DEFAULT_OPTIONS.baseUrl)}/${encodedModelPath}`;
  const slug = slugForModelId(modelId);
  const baseName = `${slug}-level${granularity.hfviewerLevel + 1}`;
  const pngPath = path.join(outDir, `${baseName}-structure.png`);
  const jsonPath = path.join(outDir, `${baseName}-info.json`);

  await fs.mkdir(outDir, { recursive: true });

  const timeoutSeconds = resolveTimeoutSeconds(options);
  const timeoutMs = timeoutSeconds * 1000;
  const browser = await playwright.chromium.launch({ headless: options.headless !== false });
  let page;

  try {
    const context = await browser.newContext({
      colorScheme: "dark",
      deviceScaleFactor: toPositiveNumber(options.deviceScaleFactor, DEFAULT_OPTIONS.deviceScaleFactor),
      viewport: {
        width: toPositiveInteger(options.width, DEFAULT_OPTIONS.width),
        height: toPositiveInteger(options.height, DEFAULT_OPTIONS.height)
      }
    });
    page = await context.newPage();

    await page.goto(hfviewerUrl, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    await waitForOuterViewer(page, timeoutMs);
    await setGranularityLevel(page, granularity.hfviewerLevel, timeoutMs);
    const frame = await getViewerFrame(page, timeoutMs);
    await waitForEmbeddedViewer(frame, timeoutMs);
    await forceZoomToFit(frame);

    const infoPanelText = await extractInfoPanelText(frame);
    const extraction = parseInfoPanelText(infoPanelText);
    const graphExport = await writeGraphPng(frame, pngPath, {
      padding: toPositiveInteger(options.padding, DEFAULT_OPTIONS.padding)
    });
    const warnings = [
      ...graphExport.warnings,
      ...warningsForExtraction(extraction)
    ];
    const payload = buildOutputPayload({
      artifacts: {
        diagramPng: pngPath,
        infoJson: jsonPath,
        exportMethod: graphExport.method,
        width: graphExport.width,
        height: graphExport.height
      },
      capturedAt: new Date().toISOString(),
      extraction,
      granularity,
      modelId,
      pageTitle: await page.title(),
      warnings
    });

    await fs.writeFile(jsonPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
    return payload;
  } catch (error) {
    const processingModalVisible = page ? await detectProcessingModal(page) : false;
    throw new Error(buildCaptureFailureMessage({
      modelId,
      hfviewerUrl,
      timeoutSeconds,
      cause: error,
      processingModalVisible
    }), { cause: error });
  } finally {
    await browser.close();
  }
}

function readCliToken(argv, index, state) {
  if (index >= argv.length) {
    return state;
  }

  const token = argv[index];
  const next = argv[index + 1];
  if (token === "--help" || token === "-h") {
    return readCliToken(argv, index + 1, { ...state, showHelp: true });
  }
  if (token === "--headed") {
    return readCliToken(argv, index + 1, { ...state, headless: false });
  }
  if (token === "--out") {
    return readCliToken(argv, index + 2, { ...state, outDir: requireValue(token, next) });
  }
  if (token === "--level") {
    return readCliToken(argv, index + 2, { ...state, level: requireValue(token, next) });
  }
  if (token === "--base-url") {
    return readCliToken(argv, index + 2, { ...state, baseUrl: requireValue(token, next) });
  }
  if (token === "--width") {
    return readCliToken(argv, index + 2, { ...state, width: Number(requireValue(token, next)) });
  }
  if (token === "--height") {
    return readCliToken(argv, index + 2, { ...state, height: Number(requireValue(token, next)) });
  }
  if (token === "--scale") {
    return readCliToken(argv, index + 2, { ...state, deviceScaleFactor: Number(requireValue(token, next)) });
  }
  if (token === "--timeout") {
    return readCliToken(argv, index + 2, {
      ...state,
      timeoutSeconds: parseTimeoutSeconds(requireValue(token, next))
    });
  }
  if (token === "--padding") {
    return readCliToken(argv, index + 2, { ...state, padding: Number(requireValue(token, next)) });
  }
  if (token.startsWith("--")) {
    throw new Error(`Unknown option: ${token}`);
  }
  if (state.modelInput) {
    throw new Error(`Unexpected extra argument: ${token}`);
  }
  return readCliToken(argv, index + 1, { ...state, modelInput: token });
}

function requireValue(flag, value) {
  if (!value || value.startsWith("--")) {
    throw new Error(`${flag} requires a value.`);
  }
  return value;
}

async function importPlaywright() {
  try {
    return await import("playwright");
  } catch (error) {
    throw new Error(
      "Playwright is required for hfviewer capture. Run `npm install` in this repo, then retry."
    );
  }
}

async function detectProcessingModal(page) {
  try {
    return await page.evaluate(() => {
      const text = document.body?.innerText || "";
      return /processing model/i.test(text) && /leave your email/i.test(text);
    });
  } catch {
    return false;
  }
}

async function waitForOuterViewer(page, timeoutMs) {
  await page.waitForSelector("#viewer-model-frame", { state: "attached", timeout: timeoutMs });
  await page.waitForFunction(
    () => {
      const frame = document.getElementById("viewer-model-frame");
      const src = frame?.getAttribute("src") || frame?.dataset?.viewerSrc || "";
      return !!frame && src && src !== "about:blank";
    },
    undefined,
    { timeout: timeoutMs }
  );
}

async function setGranularityLevel(page, hfviewerLevel, timeoutMs) {
  await page.waitForSelector("#viewer-granularity-input", { state: "attached", timeout: timeoutMs });
  const maxLevel = await page.waitForFunction(
    () => {
      const wrapper = document.getElementById("viewer-granularity");
      const input = document.getElementById("viewer-granularity-input");
      if (!input || input.disabled || wrapper?.hidden) {
        return false;
      }
      const max = Number(input.max);
      return Number.isFinite(max) ? max : false;
    },
    undefined,
    { timeout: timeoutMs }
  );
  const supportedMax = await maxLevel.jsonValue();
  if (hfviewerLevel > supportedMax) {
    throw new Error(
      `hfviewer only exposes levels 0-${supportedMax} for this model; requested internal level ${hfviewerLevel}.`
    );
  }

  await page.locator("#viewer-granularity-input").evaluate((input, value) => {
    input.value = String(value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, hfviewerLevel);
}

async function getViewerFrame(page, timeoutMs) {
  const handle = await page.waitForSelector("#viewer-model-frame", { state: "attached", timeout: timeoutMs });
  const frame = await handle.contentFrame();
  if (!frame) {
    throw new Error("hfviewer iframe is not available.");
  }
  return frame;
}

async function waitForEmbeddedViewer(frame, timeoutMs) {
  await frame.waitForFunction(
    () => {
      const graphs = document.querySelector(".graphs");
      const infoPanel = document.querySelector("#infoPanel, .info-panel");
      const graphRect = graphs?.getBoundingClientRect?.();
      const publicApi = window.__embedlPublic || null;
      const busy = typeof publicApi?.isGranularityBusy === "function" && publicApi.isGranularityBusy();
      const infoText = infoPanel?.innerText || infoPanel?.textContent || "";
      const infoReady = /\bnodes?\b/i.test(infoText) && /\bop\s+types?\b/i.test(infoText);
      const loading = /loading model|processing model/i.test(document.body?.innerText || "");
      return (
        !!graphs &&
        !!infoPanel &&
        graphRect?.width > 0 &&
        graphRect?.height > 0 &&
        infoReady &&
        !busy &&
        !loading
      );
    },
    undefined,
    { timeout: timeoutMs }
  );
}

async function forceZoomToFit(frame) {
  await frame.evaluate(async () => {
    const wait = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));
    const publicApi = window.__embedlPublic || null;
    const debug = window.__graphDebug__ || null;
    publicApi?.forceZoomToFitModel?.({ animate: false });
    debug?.zoomToFitModel?.({ animate: false });
    await wait(260);
  });
}

async function extractInfoPanelText(frame) {
  return frame.evaluate(() => {
    const panel = document.querySelector("#infoPanel, .info-panel");
    if (!panel) {
      throw new Error("hfviewer info panel was not found.");
    }
    return panel.innerText || panel.textContent || "";
  });
}

async function writeGraphPng(frame, pngPath, options) {
  const exported = await tryExportWithHfviewerApi(frame, options);
  if (exported?.dataUrl) {
    await fs.writeFile(pngPath, dataUrlToBuffer(exported.dataUrl));
    return {
      method: "hfviewer-api",
      warnings: [],
      width: toPositiveInteger(exported.width || exported.cssWidth, 1),
      height: toPositiveInteger(exported.height || exported.cssHeight, 1)
    };
  }

  const graph = frame.locator(".graphs").first();
  await graph.screenshot({ path: pngPath, omitBackground: false });
  const box = await graph.boundingBox();
  return {
    method: "element-screenshot",
    warnings: [],
    width: toPositiveInteger(box?.width, 1),
    height: toPositiveInteger(box?.height, 1)
  };
}

async function tryExportWithHfviewerApi(frame, options) {
  return frame.evaluate(async ({ padding }) => {
    const wait = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));
    const publicApi = window.__embedlPublic || null;
    const debug = window.__graphDebug__ || null;
    publicApi?.forceZoomToFitModel?.({ animate: false });
    debug?.zoomToFitModel?.({ animate: false });
    await wait(220);
    const result = debug?.exportCroppedModelImage?.(null, {
      padding,
      mimeType: "image/png",
      minEdgeScreenWidth: 1
    });
    return result?.dataUrl ? result : null;
  }, options);
}

function dataUrlToBuffer(dataUrl) {
  const match = /^data:image\/png;base64,(?<payload>.+)$/s.exec(dataUrl);
  if (!match?.groups?.payload) {
    throw new Error("hfviewer export did not return a PNG data URL.");
  }
  return Buffer.from(match.groups.payload, "base64");
}

function warningsForExtraction(extraction) {
  return [
    ...(!extraction.model.title ? ["Could not parse model title from hfviewer info panel."] : []),
    ...(extraction.operationTypes.length === 0 ? ["Could not parse operation type percentages."] : [])
  ];
}

function normalizeLines(text) {
  return String(text || "")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function findSummaryLine(lines) {
  return lines.find((line) => /\bnodes?\b/i.test(line) && /\bop\s+types?\b/i.test(line)) || "";
}

function valueAfterHeading(lines, heading) {
  const index = lines.findIndex((line) => line.toLowerCase() === heading.toLowerCase());
  return index >= 0 ? lines[index + 1] || null : null;
}

function parseOperationTypes(lines) {
  return lines
    .map((line, index) => {
      const inlineMatch = /^(?<name>.+?)\s+(?<percent>\d+(?:\.\d+)?)%$/.exec(line);
      if (inlineMatch) {
        return {
          name: inlineMatch.groups.name.trim(),
          percent: Number(inlineMatch.groups.percent)
        };
      }
      const percentMatch = /^(?<percent>\d+(?:\.\d+)?)%$/.exec(line);
      if (!percentMatch || index === 0) {
        return null;
      }
      const name = lines[index - 1];
      return /^[\d,]+\s+operations?$/i.test(name)
        ? null
        : {
            name,
            percent: Number(percentMatch.groups.percent)
          };
    })
    .filter(Boolean);
}

const SECTION_HEADINGS = new Set([
  "Model output",
  "Operation types",
  "Model attributes",
  "FLOPs assumptions",
  "FLOPs / generated token",
  "Latency coverage",
  "Nodes",
  "Op types",
  "Vocab size",
  "Precision breakdown"
]);

function buildSections(lines) {
  return lines
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => SECTION_HEADINGS.has(line))
    .map(({ line, index }, headingIndex, headings) => {
      const nextHeading = headings[headingIndex + 1]?.index ?? lines.length;
      return {
        heading: line,
        lines: lines.slice(index + 1, nextHeading)
      };
    });
}

function linesBetweenHeading(lines, headingIndex, stopHeadings) {
  const nextRelativeIndex = lines
    .slice(headingIndex + 1)
    .findIndex((line) => stopHeadings.has(line));
  const endIndex = nextRelativeIndex >= 0 ? headingIndex + 1 + nextRelativeIndex : lines.length;
  return lines.slice(headingIndex + 1, endIndex);
}

function parseKeyValueSection(lines, heading, stopHeadings) {
  const start = lines.findIndex((line) => line === heading);
  if (start < 0) {
    return {};
  }
  const tail = lines.slice(start + 1);
  const end = tail.findIndex((line) => stopHeadings.has(line));
  const sectionLines = end >= 0 ? tail.slice(0, end) : tail;
  return sectionLines.reduce((attributes, line, index) => {
    if (index % 2 !== 0) {
      return attributes;
    }
    const value = sectionLines[index + 1];
    if (value === undefined) {
      return attributes;
    }
    return {
      ...attributes,
      [line]: parseScalar(value)
    };
  }, {});
}

function parseScalar(value) {
  const text = String(value || "").trim();
  return /^[\d,]+(?:\.\d+)?$/.test(text) ? Number(text.replaceAll(",", "")) : text;
}

function parseSummaryInteger(text, pattern) {
  const match = pattern.exec(text || "");
  return match ? parseInteger(match[1]) : null;
}

function parseInteger(text) {
  const match = /([\d,]+)/.exec(String(text || ""));
  return match ? Number(match[1].replaceAll(",", "")) : null;
}

function extractLatency(summaryText) {
  const part = splitSummary(summaryText).find((item) => /latency/i.test(item));
  return part || null;
}

function extractSemanticFlow(line) {
  const part = splitSummary(line).find((item) => /SEMANTIC FLOW/i.test(item));
  return part || null;
}

function extractFidelity(line) {
  const part = splitSummary(line).find((item) => /FIDELITY/i.test(item));
  return part || null;
}

function splitSummary(text) {
  return String(text || "")
    .split(/[·•]/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function looksLikeUrl(value) {
  return /^https?:\/\//i.test(value);
}

function modelPathFromUrl(value) {
  const url = new URL(value);
  const host = url.hostname.toLowerCase();
  if (!host.endsWith("huggingface.co") && !host.endsWith("hfviewer.com")) {
    throw new Error(`Unsupported model URL host: ${url.hostname}`);
  }
  return url.pathname;
}

function encodeModelIdPath(modelId) {
  return modelId.split("/").map(encodeURIComponent).join("/");
}

function slugForModelId(modelId) {
  return modelId.replace("/", "__").replace(/[^a-zA-Z0-9._-]+/g, "-");
}

function trimTrailingSlash(value) {
  return String(value || "").replace(/\/+$/g, "");
}

function toPositiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.round(number) : fallback;
}

function toPositiveNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function printHelp() {
  console.log(`Usage:
  node skills/hf-model-architecture/scripts/capture-hfviewer.mjs <model-id-or-url> [options]

Options:
  --out <dir>       Output directory (default: current directory)
  --level <value>   UI level number or block/detailed/fine (default: 4)
  --width <px>      Browser viewport width (default: 2048)
  --height <px>     Browser viewport height (default: 1152)
  --scale <n>       Device scale factor for screenshot fallback (default: 2)
  --timeout <sec>   Wait budget for hfviewer rendering in seconds (default: 120)
  --padding <px>    Cropped graph padding for hfviewer API export (default: 24)
  --headed          Show the browser while capturing
`);
}

function isCliEntry() {
  const entry = process.argv[1];
  if (!entry) {
    return false;
  }
  const modulePath = path.resolve(fileURLToPath(import.meta.url));
  const entryPath = path.resolve(entry);
  if (entryPath === modulePath) {
    return true;
  }
  const base = path.basename(entryPath);
  return base === "capture-hfviewer.mjs"
    || base === "hf-model-architecture-skill"
    || base === "capture-hf-model";
}

if (isCliEntry()) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
