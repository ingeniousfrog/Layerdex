# Layerdex Codemap

**Last updated:** 2026-07-04
**Entry points:** `index.html`, `src/app.js`, `src/core/analyzer.js`

## Architecture

Layerdex is a static local-first browser app. Browser loaders produce a normalized model package, `src/core/analyzer.js` turns that package into an immutable analysis object, `src/core/diagram.js` builds a semantic architecture diagram from that analysis, and the UI renderer projects the result into linked views.

## Key Modules

| Module | Purpose | Exports | Dependencies |
| --- | --- | --- | --- |
| `src/core/analyzer.js` | Model metadata analysis, semantic anatomy inference, diffing | `analyzeModelPackage`, `diffAnalyses` | GGUF and Safetensors index helpers |
| `src/core/diagram.js` | Semantic overview diagrams for diffusion, adapter, transformer, and metadata-only models | `buildArchitectureDiagram` | Analyzer output shapes |
| `src/core/gguf.js` | Bounded local GGUF header and partial metadata parsing | `readGgufFile` | None |
| `src/core/safetensors.js` | Bounded Safetensors header parsing | `readSafetensorsFile` | None |
| `src/core/safetensors-index.js` | Safetensors shard index parsing and metadata-only tensor projection | `readSafetensorsIndexes` | None |
| `src/app.js` | UI state orchestration and event binding | None | analyzer, loaders, renderer, exports, sample data |
| `src/ui/loaders.js` | Local browser file loading and Hugging Face metadata loading, including `usedStorage`, Safetensors summaries, and LFS sizes | `filesToPackage`, `loadHuggingFacePackage` | Browser File API, `fetch` |
| `src/ui/render.js` | HTML/SVG rendering for six views and side panels | `renderApp`, `formatNumber`, `formatBytes`, `escapeHtml` | DOM |
| `src/ui/export.js` | Report export helpers | `downloadJsonReport`, `downloadSvgReport`, `downloadPngReport`, `printPdfReport` | DOM, renderer formatting helpers |
| `src/ui/sample-package.js` | Demo base and LoRA packages | `createDemoPackage`, `createDemoTunedPackage` | None |
| `src/styles.css` | App shell, navigation, panels, controls, and table styling | None | CSS custom properties |
| `src/diagram.css` | Overview architecture diagram and Anatomy module focus styling | None | Renderer class names |
| `test/analyzer.test.js` | Analyzer regression tests | None | Node test runner |
| `test/loaders.test.js` | Hugging Face loader normalization tests | None | Node test runner |

## Data Flow

1. Local files or Hugging Face metadata become `{ source, files }` packages. Hugging Face packages preserve API-level repository metadata under `source.metadata`.
2. The analyzer validates packages and extracts config facts, Safetensors tensor metadata, Safetensors index shard maps, bounded/partial GGUF header metadata, LoRA adapter facts, semantic structure, dataflow, weight summaries, and storage summaries.
3. The diagram builder converts anatomy, dataflow, storage, and weight summaries into Overview diagram lanes, nodes, and edges.
4. `src/app.js` stores the current analysis, optional baseline, active view, selected node, and diff.
5. `src/ui/render.js` renders the left structure tree, central view canvas, Overview diagram, Anatomy module focus panel, right detail panel, fact list, and tensor/file/shard drilldown from that state.
6. Export helpers serialize the current analysis or a generated SVG view.
