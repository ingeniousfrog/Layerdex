---
name: hfviewer-model-structure
description: Capture model architecture visuals and structured metadata from hfviewer.com. Use when a user provides a Hugging Face model id or hfviewer/Hugging Face URL and wants a Level 4 architecture graph PNG, the right-side hfviewer information as JSON, or a reproducible hfviewer-based model-structure artifact.
---

# HFViewer Model Structure

## Overview

Use hfviewer as the authoritative model-structure renderer. Convert a Hugging Face model id such as `zai-org/GLM-5.2` into `https://hfviewer.com/zai-org/GLM-5.2`, set the requested granularity, export the graph PNG, and normalize the right-side information panel into JSON.

## Default Workflow

1. Normalize the input into a Hugging Face model id with one owner and one model segment.
2. Open `https://hfviewer.com/<owner>/<model>`.
3. Set granularity to Level 4 unless the user requests another level. hfviewer uses internal 0-based levels: `Block` is `0`, `Detailed` is `1`, `Fine` is `2`, and visible `Level 4` is internal `3`.
4. Export the cropped model graph as PNG. Prefer hfviewer's own embedded export API; fall back to a Playwright element screenshot of `.graphs`.
5. Extract the right-side info panel (`#infoPanel` or `.info-panel`) and output JSON matching `references/hfviewer-output.schema.json`.
6. Return the PNG path, JSON path, and any warnings.

## Automation

Use the bundled script whenever filesystem access is available:

```sh
node skills/hfviewer-model-structure/scripts/capture-hfviewer.mjs zai-org/GLM-5.2 --out artifacts/glm-5.2 --level 4
```

Useful options:

- `--level <n|block|detailed|fine>`: visible level number or named hfviewer level. Default: `4`.
- `--out <dir>`: output directory. Default: current directory.
- `--width <px>` / `--height <px>`: browser viewport. Default: `2048x1152`.
- `--scale <n>`: browser device scale factor for screenshot fallback. Default: `2`.
- `--timeout <ms>`: wait budget for hfviewer generation. Default: `120000`.
- `--headed`: run the browser visibly for debugging.

If Playwright is missing, install project dependencies before running the script. If browser binaries are missing, run Playwright's browser install for Chromium.

## Manual Fallback

When automation is unavailable, use a browser:

1. Open the hfviewer URL.
2. Wait until the interactive graph loads.
3. Move the granularity slider to Level 4.
4. Capture only the graph area on the left, not the right info panel, unless the user asks for a full viewer screenshot.
5. Transcribe the right panel into the same JSON fields described in `references/output-json.md`.

## Output Contract

Read `references/output-json.md` when you need field details. Validate generated JSON against `references/hfviewer-output.schema.json` when practical.
