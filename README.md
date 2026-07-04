# Layerdex

**Last updated:** 2026-07-04

Layerdex is a local-first model anatomy tool for LLMs, diffusion models, vision models, and quantized checkpoints. It turns model files into readable structures, showing architecture, tensor layout, quantization, LoRA coverage, and checkpoint differences without fully loading weights.

## Current Slice

Layerdex currently runs as a static browser app with a tested metadata analyzer:

- Open a local model directory or selected files in the browser.
- Fetch Hugging Face repository metadata, config files, file listings, and index JSON without downloading full weights.
- Use Hugging Face `usedStorage`, Safetensors parameter summaries, and LFS file sizes when available so remote metadata-only estimates are closer to the repository's actual footprint.
- Parse Safetensors headers from local files by reading only the header range.
- Parse local GGUF headers for version, tensor count, supported scalar/array metadata, and partial metadata warnings while still reading only a bounded prefix.
- Read Safetensors index files to surface metadata-only tensor names and shard distribution.
- Detect LoRA adapters from `adapter_config.json` and LoRA tensor names, including target module coverage.
- Separate verified facts from config/weight metadata and inferred facts from naming/rules.
- Explore six linked views: Overview, Anatomy, Dataflow, Weights, Storage, and Diff, with tensor/file/shard drilldown in the detail panel.
- Inspect a semantic architecture diagram in Overview that shows model inputs, conditioning paths, core modules, decode/output flow, and selected module details.
- Focus an Anatomy module independently after selecting a structure item from the tree or diagram.
- Pin a baseline, compare it with the current analysis, and export SVG, PNG, print-to-PDF, or JSON reports.

## Run Locally

```sh
npm test
npm run start
```

Then open [http://127.0.0.1:5283/](http://127.0.0.1:5283/).

## Project Map

- `index.html` - app shell with source controls, structure tree, workspace, details, and exports.
- `src/app.js` - browser orchestration, state updates, imports, baseline pinning, and exports.
- `src/core/analyzer.js` - pure metadata analyzer and diff engine.
- `src/core/diagram.js` - semantic architecture diagram model for diffusion, adapter, transformer, and metadata-only scans.
- `src/core/gguf.js` - bounded GGUF header and metadata parser.
- `src/core/safetensors.js` - bounded Safetensors header parser.
- `src/core/safetensors-index.js` - Safetensors index parser for shard and metadata-only tensor insight.
- `src/ui/loaders.js` - local file and Hugging Face metadata loaders.
- `src/ui/render.js` - six-view renderer and details/facts panels.
- `src/ui/export.js` - SVG, PNG, print-to-PDF, and JSON report exports.
- `src/ui/sample-package.js` - bundled demo model packages.
- `src/styles.css` - app shell, panel, control, and table styling.
- `src/diagram.css` - architecture diagram and module focus styling.
- `test/analyzer.test.js` - Node test coverage for analyzer behavior.
- `test/loaders.test.js` - loader tests for Hugging Face metadata normalization.

## Boundaries

Implemented metadata analysis is intentionally conservative. Hugging Face estimates use repository API metadata when present, but remote tensor statistics still require future byte-range reads. Full tensor-value statistics, full GGUF tensor-directory decoding, ONNX / `torch.export` import, remote byte-range weight pulls, and deeper deployment estimators are planned next-stage capabilities rather than finished product claims.
