import { escapeHtml, formatBytes, formatNumber } from "./render.js";

export function downloadJsonReport(analysis, diff) {
  requireAnalysis(analysis);
  downloadBlob(
    `${slug(analysis.overview.displayName)}-layerdex-report.json`,
    "application/json",
    JSON.stringify({ analysis, diff, exportedAt: new Date().toISOString() }, null, 2)
  );
}

export function downloadSvgReport(analysis, activeView) {
  requireAnalysis(analysis);
  downloadBlob(
    `${slug(analysis.overview.displayName)}-${slug(activeView)}.svg`,
    "image/svg+xml",
    buildSvg(analysis, activeView)
  );
}

export async function downloadPngReport(analysis, activeView) {
  requireAnalysis(analysis);
  const svg = buildSvg(analysis, activeView);
  const imageUrl = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  const image = await loadImage(imageUrl);
  const canvas = document.createElement("canvas");
  canvas.width = 1600;
  canvas.height = 1000;
  const context = canvas.getContext("2d");
  context.fillStyle = "#f7f4ec";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0);
  URL.revokeObjectURL(imageUrl);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) {
    throw new Error("PNG export failed");
  }
  downloadUrl(`${slug(analysis.overview.displayName)}-${slug(activeView)}.png`, URL.createObjectURL(blob));
}

export function printPdfReport() {
  window.print();
}

function buildSvg(analysis, activeView) {
  const nodes = analysis.structure.nodes.filter((node) => node.id !== analysis.structure.rootId);
  const title = `${analysis.overview.displayName} / ${activeView}`;
  const rows = [
    ["Architecture", analysis.overview.architecture],
    ["Modality", analysis.overview.modality],
    ["Precision", analysis.overview.precision],
    ["Parameters", formatNumber(analysis.overview.totalParameters)],
    ["Storage", formatBytes(analysis.storage.totalBytes)]
  ];
  const nodeMarkup = nodes
    .slice(0, 12)
    .map((node, index) => {
      const x = 120 + (index % 4) * 350;
      const y = 320 + Math.floor(index / 4) * 180;
      return `
        <g transform="translate(${x},${y})">
          <rect width="280" height="110" rx="8" fill="#fffdf7" stroke="#27221d" stroke-width="2"/>
          <text x="18" y="34" fill="#27221d" font-family="Avenir Next, Segoe UI, sans-serif" font-size="25" font-weight="700">${escapeXml(node.label)}</text>
          <text x="18" y="70" fill="#6a6258" font-family="Menlo, Consolas, monospace" font-size="18">${escapeXml(node.kind)} / ${escapeXml(node.status)}</text>
        </g>
      `;
    })
    .join("");
  const metricMarkup = rows
    .map(
      ([label, value], index) => `
        <text x="90" y="${150 + index * 42}" fill="#27221d" font-family="Menlo, Consolas, monospace" font-size="22">
          ${escapeXml(label)}: ${escapeXml(value)}
        </text>
      `
    )
    .join("");

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1000" viewBox="0 0 1600 1000">
      <rect width="1600" height="1000" fill="#f7f4ec"/>
      <path d="M0 112 H1600" stroke="#27221d" stroke-width="3"/>
      <text x="90" y="76" fill="#27221d" font-family="Avenir Next, Segoe UI, sans-serif" font-size="42" font-weight="800">${escapeXml(title)}</text>
      <circle cx="1460" cy="58" r="26" fill="#d94f35"/>
      <circle cx="1526" cy="58" r="26" fill="#2a8f76"/>
      ${metricMarkup}
      <rect x="70" y="278" width="1460" height="2" fill="#27221d"/>
      ${nodeMarkup}
      <text x="90" y="940" fill="#6a6258" font-family="Menlo, Consolas, monospace" font-size="20">Layerdex metadata report</text>
    </svg>
  `;
}

function requireAnalysis(analysis) {
  if (!analysis) {
    throw new Error("No analysis available");
  }
}

function downloadBlob(filename, type, content) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  downloadUrl(filename, url);
}

function downloadUrl(filename, url) {
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 500);
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Image export load failed"));
    image.src = url;
  });
}

function slug(value) {
  return String(value || "layerdex")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function escapeXml(value) {
  return escapeHtml(value).replaceAll("&nbsp;", " ");
}
