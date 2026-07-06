# HFViewer Output JSON

Use this shape for extracted hfviewer model-structure artifacts.

## Top-Level Fields

- `schemaVersion`: semantic version for this contract. Current value: `1.0.0`.
- `source`: normalized input and capture context.
- `artifacts`: generated files.
- `model`: parsed right-panel model facts.
- `operationTypes`: parsed operation distribution rows from the right panel.
- `sections`: best-effort preservation of right-panel sections.
- `raw`: audit text and page details.
- `warnings`: non-fatal extraction or export warnings.

## Important Fields

- `source.modelId`: Hugging Face model id such as `zai-org/GLM-5.2`.
- `source.hfviewerUrl`: direct hfviewer URL.
- `source.huggingFaceUrl`: Hugging Face model page URL.
- `source.requestedLevel`: the user-facing level request, usually `4`.
- `source.hfviewerLevel`: internal hfviewer 0-based level. Visible `Level 4` is `3`.
- `artifacts.diagramPng`: absolute path to the graph PNG.
- `model.title`: right-panel title, for example `GLM-5.2 model`.
- `model.nodeCount`: parsed from text such as `58 nodes`.
- `model.operationTypeCount`: parsed from text such as `12 op types`.
- `model.tokenVocab`: parsed from text such as `154,880-token vocab`.
- `model.outputShape`: parsed from the `Model output` section.
- `model.attributes`: key/value model attributes from the right panel, such as `Context`, `Layers`, `Experts`, and `Summary`.
- `operationTypes[].name`: operation label, for example `Linear`.
- `operationTypes[].percent`: numeric percentage.

## Notes

Preserve `raw.infoPanelText` even when parsing is incomplete. Add a warning instead of guessing when a field is absent.
