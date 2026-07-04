import { analyzeModelPackage, diffAnalyses } from "./core/analyzer.js";
import {
  downloadJsonReport,
  downloadPngReport,
  downloadSvgReport,
  printPdfReport
} from "./ui/export.js";
import { filesToPackage, loadHuggingFacePackage } from "./ui/loaders.js";
import { renderApp } from "./ui/render.js";
import { createDemoPackage, createDemoTunedPackage } from "./ui/sample-package.js";

let state = {
  activeView: "Overview",
  analysis: undefined,
  baseline: undefined,
  diff: undefined,
  expandedModules: [],
  moduleDialogId: undefined,
  selectedId: "model",
  status: "Ready"
};

function setState(patch) {
  state = {
    ...state,
    ...patch
  };
  renderApp(state);
}

function analyzePackage(modelPackage, patch = {}) {
  const analysis = analyzeModelPackage(modelPackage);
  const diff = state.baseline ? diffAnalyses(state.baseline, analysis) : undefined;
  setState({
    ...patch,
    analysis,
    diff,
    expandedModules: [],
    moduleDialogId: undefined,
    selectedId: "model",
    status: `${analysis.storage.files.length} files analyzed`
  });
}

async function handleLocalFiles(event) {
  const files = event.target.files;
  if (!files || files.length === 0) {
    return;
  }
  await runTask("Reading local metadata", async () => {
    const modelPackage = await filesToPackage(files);
    analyzePackage(modelPackage);
  });
}

async function handleHuggingFaceSubmit(event) {
  event.preventDefault();
  const input = document.getElementById("hfInput");
  await runTask("Fetching remote metadata", async () => {
    const modelPackage = await loadHuggingFacePackage(input.value);
    analyzePackage(modelPackage);
  });
}

function loadDemo() {
  const baseline = analyzeModelPackage(createDemoPackage());
  const analysis = analyzeModelPackage(createDemoTunedPackage());
  setState({
    activeView: "Overview",
    analysis,
    baseline,
    diff: diffAnalyses(baseline, analysis),
    expandedModules: [],
    moduleDialogId: undefined,
    selectedId: "model",
    status: "Demo LoRA compared with demo base"
  });
}

function pinBaseline() {
  if (!state.analysis) {
    setState({ status: "No analysis to pin" });
    return;
  }
  setState({
    baseline: state.analysis,
    diff: undefined,
    status: `${state.analysis.overview.displayName} pinned as baseline`
  });
}

function compareWithBaseline() {
  if (!state.analysis || !state.baseline) {
    setState({ status: "Baseline and current analysis are required" });
    return;
  }
  setState({
    diff: diffAnalyses(state.baseline, state.analysis),
    status: "Diff refreshed"
  });
}

async function runTask(status, task) {
  setState({ status });
  try {
    await task();
  } catch (error) {
    setState({
      status: error instanceof Error ? error.message : "Unexpected error"
    });
  }
}

function handleViewClick(event) {
  const view = event.target.closest("[data-view]")?.dataset.view;
  if (view) {
    setState({ activeView: view, moduleDialogId: undefined });
  }
}

function handleSelectionClick(event) {
  const id = event.target.closest("[data-select-id]")?.dataset.selectId;
  if (id) {
    setState({ selectedId: id });
  }
}

function handleCanvasClick(event) {
  if (event.target.closest("[data-modal-close]") || event.target.matches("[data-modal-backdrop]")) {
    setState({ moduleDialogId: undefined });
    return;
  }

  const toggleId = event.target.closest("[data-toggle-module]")?.dataset.toggleModule;
  if (toggleId) {
    setState({
      expandedModules: toggleArray(state.expandedModules, toggleId),
      selectedId: toggleId
    });
    return;
  }

  const openId = event.target.closest("[data-open-module]")?.dataset.openModule;
  if (openId) {
    setState({
      moduleDialogId: openId,
      selectedId: openId
    });
    return;
  }

  handleSelectionClick(event);
}

function toggleArray(values, value) {
  return values.includes(value)
    ? values.filter((item) => item !== value)
    : [...values, value];
}

async function handleExport(kind) {
  await runTask(`Exporting ${kind}`, async () => {
    if (kind === "SVG") {
      downloadSvgReport(state.analysis, state.activeView);
    } else if (kind === "PNG") {
      await downloadPngReport(state.analysis, state.activeView);
    } else if (kind === "PDF") {
      printPdfReport();
    } else {
      downloadJsonReport(state.analysis, state.diff);
    }
    setState({ status: `${kind} export ready` });
  });
}

function bindEvents() {
  document.getElementById("fileInput").addEventListener("change", handleLocalFiles);
  document.getElementById("demoButton").addEventListener("click", loadDemo);
  document.getElementById("hfForm").addEventListener("submit", handleHuggingFaceSubmit);
  document.getElementById("baselineButton").addEventListener("click", pinBaseline);
  document.getElementById("compareButton").addEventListener("click", compareWithBaseline);
  document.getElementById("viewTabs").addEventListener("click", handleViewClick);
  document.getElementById("structureTree").addEventListener("click", handleSelectionClick);
  document.getElementById("viewCanvas").addEventListener("click", handleCanvasClick);
  document.getElementById("exportSvg").addEventListener("click", () => handleExport("SVG"));
  document.getElementById("exportPng").addEventListener("click", () => handleExport("PNG"));
  document.getElementById("exportPdf").addEventListener("click", () => handleExport("PDF"));
  document.getElementById("exportJson").addEventListener("click", () => handleExport("Report"));
}

bindEvents();
renderApp(state);
