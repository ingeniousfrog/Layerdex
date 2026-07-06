import assert from "node:assert/strict";
import test from "node:test";
import {
  buildOutputPayload,
  labelForHfviewerLevel,
  normalizeModelId,
  parseCliArgs,
  parseInfoPanelText,
  parseLevelOption
} from "../scripts/capture-hfviewer.mjs";

test("normalizes Hugging Face and hfviewer model inputs", () => {
  assert.equal(normalizeModelId("zai-org/GLM-5.2"), "zai-org/GLM-5.2");
  assert.equal(normalizeModelId("https://hfviewer.com/zai-org/GLM-5.2"), "zai-org/GLM-5.2");
  assert.equal(normalizeModelId("https://huggingface.co/zai-org/GLM-5.2/tree/main"), "zai-org/GLM-5.2");
  assert.throws(() => normalizeModelId("GLM-5.2"), /owner\/model/);
});

test("maps visible level requests to hfviewer internal levels", () => {
  assert.deepEqual(parseLevelOption("4"), {
    requestedLevel: 4,
    hfviewerLevel: 3,
    granularityLabel: "Level 4"
  });
  assert.deepEqual(parseLevelOption("fine"), {
    requestedLevel: "fine",
    hfviewerLevel: 2,
    granularityLabel: "Fine"
  });
  assert.equal(labelForHfviewerLevel(0), "Block");
  assert.equal(labelForHfviewerLevel(1), "Detailed");
});

test("parses hfviewer right-panel text into structured model data", () => {
  const text = `
GLM-5.2 model
58 nodes · 12 op types · 154,880-token vocab · No latency annotations found
MODULE-DERIVED SEMANTIC FLOW · MODULE-DERIVED FIDELITY

Model output
B×T×154880

Operation types
55 operations
Linear
40.0%
RMSNorm
20.0%
Add
9.1%
Input
5.5%
Model attributes
Context
1,048,576
Layers
78
Summary
78 decoder layers, 3 dense warmup, 75 MoE
`;

  const extracted = parseInfoPanelText(text);

  assert.equal(extracted.model.title, "GLM-5.2 model");
  assert.equal(extracted.model.nodeCount, 58);
  assert.equal(extracted.model.operationTypeCount, 12);
  assert.equal(extracted.model.operationCount, 55);
  assert.equal(extracted.model.tokenVocab, 154880);
  assert.equal(extracted.model.outputShape, "B×T×154880");
  assert.equal(extracted.model.latency, "No latency annotations found");
  assert.equal(extracted.model.semanticFlow, "MODULE-DERIVED SEMANTIC FLOW");
  assert.equal(extracted.model.fidelity, "MODULE-DERIVED FIDELITY");
  assert.deepEqual(extracted.operationTypes.slice(0, 2), [
    { name: "Linear", percent: 40 },
    { name: "RMSNorm", percent: 20 }
  ]);
  assert.equal(extracted.model.attributes.Context, 1048576);
  assert.equal(extracted.model.attributes.Layers, 78);
  assert.equal(extracted.model.attributes.Summary, "78 decoder layers, 3 dense warmup, 75 MoE");
});

test("builds stable output payload with artifact pointers", () => {
  const extraction = parseInfoPanelText("GLM-5.2 model\nOperation types\nLinear 100.0%");
  const payload = buildOutputPayload({
    artifacts: {
      diagramPng: "/tmp/graph.png",
      exportMethod: "hfviewer-api",
      height: 200,
      infoJson: "/tmp/info.json",
      width: 100
    },
    capturedAt: "2026-07-06T00:00:00.000Z",
    extraction,
    granularity: parseLevelOption("4"),
    modelId: "zai-org/GLM-5.2",
    pageTitle: "Architecture graph for zai-org/GLM-5.2 | hfviewer"
  });

  assert.equal(payload.schemaVersion, "1.0.0");
  assert.equal(payload.source.hfviewerUrl, "https://hfviewer.com/zai-org/GLM-5.2");
  assert.equal(payload.source.hfviewerLevel, 3);
  assert.equal(payload.artifacts.diagramPng, "/tmp/graph.png");
});

test("parses CLI flags without mutating defaults", () => {
  const parsed = parseCliArgs([
    "zai-org/GLM-5.2",
    "--out",
    "artifacts/glm",
    "--level",
    "4",
    "--headed"
  ]);

  assert.equal(parsed.modelInput, "zai-org/GLM-5.2");
  assert.equal(parsed.outDir, "artifacts/glm");
  assert.equal(parsed.level, "4");
  assert.equal(parsed.headless, false);
});
