---
name: hf-model-architecture
description: Capture Hugging Face model architecture diagrams as PNG plus the hfviewer.com right-panel metadata as structured JSON. Use when the user provides a Hugging Face model id (e.g. zai-org/GLM-5.2), a huggingface.co/<owner>/<model> URL, or an hfviewer.com/... URL and wants an architecture graph image, operation-type distribution, node/op-type/vocab counts, model attributes, or a reproducible model-structure artifact at a chosen granularity (Block / Detailed / Fine / Level 4+).
---

# HF Model Architecture

## Overview

Use [hfviewer](https://hfviewer.com/) as the authoritative model-structure renderer. Convert a Hugging Face model id such as `zai-org/GLM-5.2` into `https://hfviewer.com/zai-org/GLM-5.2`, set the requested granularity, export the graph PNG, and normalize the right-side information panel into JSON.

## Prerequisites

- Node.js 18+
- Project dependencies: `npm install` (from the skill directory or repo root)
- Chromium for Playwright: `npx playwright install chromium`
- The target model must be publicly visible on Hugging Face and renderable on hfviewer. Gated or private models are not supported.

## Default Workflow

1. Normalize the input into a Hugging Face model id with one owner and one model segment.
2. Open `https://hfviewer.com/<owner>/<model>`.
3. Set granularity to Level 4 unless the user requests another level (see mapping table below).
4. Export the cropped model graph as PNG. Prefer hfviewer's embedded export API; fall back to a Playwright element screenshot of `.graphs`.
5. Extract the right-side info panel (`#infoPanel` or `.info-panel`) and output JSON matching `references/hfviewer-output.schema.json`.
6. Return the PNG path, JSON path, and any warnings.

## Granularity Mapping

| User request | requestedLevel | hfviewerLevel (internal) | granularityLabel |
|--------------|----------------|--------------------------|------------------|
| "Block"      | block          | 0                        | Block            |
| "Detailed"   | detailed       | 1                        | Detailed         |
| "Fine"       | fine           | 2                        | Fine             |
| "Level 4"    | 4              | 3                        | Level 4          |

hfviewer uses internal 0-based levels: visible `Level 4` is internal `3`.

## Automation

Use the bundled script whenever filesystem access is available (run from this skill directory, or prefix `skills/hf-model-architecture/` when inside a Layerdex repo checkout):

```sh
node scripts/capture-hfviewer.mjs zai-org/GLM-5.2 --out artifacts/glm-5.2 --level 4
```

Useful options:

- `--level <n|block|detailed|fine>`: visible level number or named hfviewer level. Default: `4`.
- `--out <dir>`: output directory. Default: current directory.
- `--width <px>` / `--height <px>`: browser viewport. Default: `2048x1152`.
- `--scale <n>`: browser device scale factor for screenshot fallback. Default: `2`.
- `--timeout <sec>`: total wait budget for hfviewer generation in seconds. Default: `120`. Example: `--timeout 300` waits up to 5 minutes across all loading steps.
- `--headed`: run the browser visibly for debugging.

If Playwright is missing, install project dependencies before running the script. If browser binaries are missing, run Playwright's browser install for Chromium.

## Examples

**Example 1 — Hugging Face model id**

User: "Capture a Level 4 architecture graph for zai-org/GLM-5.2."

```sh
node scripts/capture-hfviewer.mjs zai-org/GLM-5.2 --out artifacts/glm-5.2 --level 4
```

Expected artifacts:

- `artifacts/glm-5.2/zai-org__GLM-5.2-level4-structure.png`
- `artifacts/glm-5.2/zai-org__GLM-5.2-level4-info.json`

**Example 2 — hfviewer URL**

User: "Get the structure diagram from https://hfviewer.com/black-forest-labs/FLUX.1-dev at Fine granularity."

```sh
node scripts/capture-hfviewer.mjs https://hfviewer.com/black-forest-labs/FLUX.1-dev --out artifacts/flux --level fine
```

Expected artifacts:

- `artifacts/flux/black-forest-labs__FLUX.1-dev-level3-structure.png`
- `artifacts/flux/black-forest-labs__FLUX.1-dev-level3-info.json`

**Example 3 — Hugging Face page URL**

User: "Extract architecture metadata from https://huggingface.co/meta-llama/Llama-3.1-8B."

```sh
node scripts/capture-hfviewer.mjs https://huggingface.co/meta-llama/Llama-3.1-8B --out artifacts/llama --level 4
```

## When NOT to Use

- The model is gated, private, or not indexed by hfviewer.
- The user only wants to download weights, run inference, or inspect tokenizer/config files without an architecture diagram.
- The user only needs general model card text from the Hugging Face README — read the model page directly instead.
- The user wants a custom visualization engine or tensor-name-based architecture inference — this skill delegates rendering to hfviewer.

## Manual Fallback

When automation is unavailable, use a browser:

1. Open the hfviewer URL.
2. Wait until the interactive graph loads.
3. Move the granularity slider to the requested level.
4. Capture only the graph area on the left, not the right info panel, unless the user asks for a full viewer screenshot.
5. Transcribe the right panel into the same JSON fields described in `references/output-json.md`.

## Troubleshooting

| Error | Likely cause | Fix |
|-------|--------------|-----|
| `Playwright is required for hfviewer capture` | Missing npm dependencies | Run `npm install` in the skill or repo directory |
| `hfviewer iframe is not available` | Page did not finish loading | Increase `--timeout` (seconds); retry with `--headed` |
| Timeout or "Processing model" email dialog | Slow or uncached model | Increase `--timeout`; open the hfviewer URL manually — the model may not be indexed yet |
| `hfviewer info panel was not found` | Model failed to render | Confirm the model is public and supported on hfviewer |
| `hfviewer only exposes levels 0-N` | Requested level exceeds model support | Retry with a lower `--level` |
| `Expected a Hugging Face model id like "owner/model"` | Malformed input | Pass `owner/model`, a huggingface.co URL, or an hfviewer.com URL |
| Screenshot fallback instead of API export | hfviewer export API unavailable | Non-fatal; check `artifacts.exportMethod` in JSON output |

## Output Contract

Read `references/output-json.md` when you need field details. Validate generated JSON against `references/hfviewer-output.schema.json` when practical.
