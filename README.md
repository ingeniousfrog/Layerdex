# Layerdex

**Last updated:** 2026-07-06

Layerdex is now a Codex skill for using [hfviewer](https://hfviewer.com/) as the source of truth for model architecture visuals. Give it a Hugging Face model id such as `zai-org/GLM-5.2`; it opens `https://hfviewer.com/zai-org/GLM-5.2`, switches to the requested granularity level, exports a lossless PNG of the model graph, and writes the right-side model information to structured JSON.

## Current Slice

- Skill: `skills/hfviewer-model-structure/SKILL.md`
- Automation: `skills/hfviewer-model-structure/scripts/capture-hfviewer.mjs`
- Output contract: `skills/hfviewer-model-structure/references/hfviewer-output.schema.json`
- Tests: `test/hfviewer-capture.test.js`

The old local static analyzer has been removed from the active package surface. This repo now focuses on a reliable hfviewer capture workflow instead of reimplementing architecture inference.

## Run

```sh
npm install
npm test
npm run capture -- zai-org/GLM-5.2 --out artifacts/glm-5.2 --level 4
```

The capture command writes:

- `zai-org__GLM-5.2-level4-structure.png` - cropped model graph PNG exported from hfviewer when available, with a screenshot fallback.
- `zai-org__GLM-5.2-level4-info.json` - normalized right-side information and artifact metadata.

## JSON Shape

The JSON output follows the schema in `skills/hfviewer-model-structure/references/hfviewer-output.schema.json`:

- `source` records the model id, hfviewer URL, Hugging Face URL, capture time, requested UI level, and internal hfviewer level.
- `artifacts` points to the generated graph PNG.
- `model` contains the parsed title, node count, operation type count, vocabulary size, latency note, semantic/fidelity labels, and output shape.
- `operationTypes` contains the right-panel operation distribution.
- `sections` and `raw` preserve the original right-panel text for auditability.

## Boundaries

Layerdex depends on hfviewer rendering and metadata. It does not download model weights, infer architecture from tensor names, or maintain a separate visualization engine.
