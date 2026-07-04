import assert from "node:assert/strict";
import test from "node:test";
import { loadHuggingFacePackage } from "../src/ui/loaders.js";

test("normalizes Hugging Face metadata, string sizes, LFS file sizes, and card data", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    if (String(url).includes("/api/models/org/model/tree/main")) {
      return jsonResponse([
        { type: "directory", path: "ignored", size: 0 },
        { type: "file", path: "config.json", size: "64" },
        { type: "file", path: "model-00001-of-00002.safetensors", lfs: { size: "1024" } },
        { type: "file", path: "model-00002-of-00002.safetensors", size: "1960" },
        { type: "file", path: "model.safetensors.index.json", size: "80" }
      ]);
    }
    if (String(url).includes("/api/models/org/model")) {
      return jsonResponse({
        usedStorage: "2048",
        safetensors: { parameters: { BF16: "1024" }, total: "1024" },
        cardData: { license: "apache-2.0" },
        siblings: [
          { rfilename: "config.json", size: 64 },
          { rfilename: "model-00001-of-00002.safetensors", lfs: { size: "1024" } },
          { rfilename: "model-00002-of-00002.safetensors", size: "960" },
          { rfilename: "model.safetensors.index.json", size: 80 }
        ]
      });
    }
    if (String(url).endsWith("/config.json")) {
      return textResponse(JSON.stringify({ model_type: "llama" }));
    }
    if (String(url).endsWith("/model.safetensors.index.json")) {
      return textResponse(JSON.stringify({ metadata: { total_size: 1984 }, weight_map: {} }));
    }
    return textResponse("");
  };

  try {
    const modelPackage = await loadHuggingFacePackage("https://huggingface.co/org/model");

    assert.equal(modelPackage.source.metadata.usedStorage, 2048);
    assert.equal(modelPackage.source.metadata.safetensors.total, 1024);
    assert.equal(modelPackage.source.metadata.safetensors.parameters.BF16, 1024);
    assert.equal(
      modelPackage.files.find((file) => file.path === "model-00001-of-00002.safetensors").size,
      1024
    );
    assert.equal(modelPackage.files.find((file) => file.path === "model-00002-of-00002.safetensors").size, 1960);
    assert.equal(modelPackage.files.some((file) => file.path === "README.md" && file.text?.includes("apache-2.0")), false);
    assert.equal(modelPackage.source.metadata.cardData.license, "apache-2.0");
    assert.ok(calls.some((url) => url.includes("/api/models/org/model")));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

function jsonResponse(value) {
  return {
    ok: true,
    json: async () => value
  };
}

function textResponse(value) {
  return {
    ok: true,
    text: async () => value
  };
}
