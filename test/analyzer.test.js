import assert from "node:assert/strict";
import test from "node:test";
import { analyzeModelPackage, diffAnalyses } from "../src/core/analyzer.js";

function safetensorsFixture(tensors) {
  const header = JSON.stringify(tensors);
  const body = Buffer.from(header, "utf8");
  const bytes = Buffer.alloc(8 + body.length);
  bytes.writeBigUInt64LE(BigInt(body.length), 0);
  body.copy(bytes, 8);
  return new Uint8Array(bytes);
}

function ggufFixture({ version = 3, tensorCount = 0, metadata = {} }) {
  const parts = [
    Buffer.from("GGUF", "ascii"),
    writeUint32(version),
    writeUint64(tensorCount),
    writeUint64(Object.keys(metadata).length)
  ];
  for (const [key, value] of Object.entries(metadata)) {
    const keyBytes = Buffer.from(key, "utf8");
    parts.push(writeUint64(keyBytes.length), keyBytes);
    if (typeof value === "string") {
      const valueBytes = Buffer.from(value, "utf8");
      parts.push(writeUint32(8), writeUint64(valueBytes.length), valueBytes);
    } else if (Array.isArray(value)) {
      parts.push(writeUint32(9));
      if (value.every((item) => typeof item === "string")) {
        parts.push(writeUint32(8), writeUint64(value.length));
        for (const item of value) {
          const valueBytes = Buffer.from(item, "utf8");
          parts.push(writeUint64(valueBytes.length), valueBytes);
        }
      } else {
        parts.push(writeUint32(4), writeUint64(value.length));
        for (const item of value) {
          parts.push(writeUint32(item));
        }
      }
    } else {
      parts.push(writeUint32(4), writeUint32(value));
    }
  }
  return new Uint8Array(Buffer.concat(parts));
}

function writeUint32(value) {
  const bytes = Buffer.alloc(4);
  bytes.writeUInt32LE(value);
  return bytes;
}

function writeUint64(value) {
  const bytes = Buffer.alloc(8);
  bytes.writeBigUInt64LE(BigInt(value));
  return bytes;
}

test("analyzes a local transformer package from config and safetensors metadata", () => {
  const analysis = analyzeModelPackage({
    source: { type: "local-directory", label: "Tiny Llama" },
    files: [
      {
        path: "config.json",
        size: 220,
        text: JSON.stringify({
          architectures: ["LlamaForCausalLM"],
          hidden_size: 4096,
          model_type: "llama",
          num_attention_heads: 32,
          num_hidden_layers: 32,
          num_key_value_heads: 8,
          torch_dtype: "bfloat16",
          vocab_size: 32000
        })
      },
      {
        path: "model-00001-of-00002.safetensors",
        size: 2048,
        bytes: safetensorsFixture({
          "__metadata__": { format: "pt" },
          "model.layers.0.self_attn.q_proj.weight": {
            dtype: "BF16",
            shape: [4096, 4096],
            data_offsets: [0, 33554432]
          },
          "model.layers.0.mlp.down_proj.weight": {
            dtype: "BF16",
            shape: [4096, 11008],
            data_offsets: [33554432, 123731968]
          }
        })
      }
    ]
  });

  assert.equal(analysis.overview.architecture, "Transformer");
  assert.equal(analysis.overview.modality, "text");
  assert.equal(analysis.overview.precision, "bfloat16");
  assert.equal(analysis.weights.tensors.length, 2);
  assert.equal(analysis.weights.totalParameters, 61865984);
  assert.ok(analysis.structure.nodes.some((node) => node.kind === "attention"));
  assert.ok(analysis.dataflow.edges.some((edge) => edge.to === "kv-cache"));
  assert.ok(
    analysis.facts.some(
      (fact) =>
        fact.key === "hidden_size" &&
        fact.status === "verified" &&
        fact.source === "config"
    )
  );
  assert.ok(
    analysis.facts.some(
      (fact) =>
        fact.key === "architecture" &&
        fact.status === "inferred" &&
        fact.source === "rule"
    )
  );
});

test("detects diffusion anatomy across U-Net, VAE, and DiT-style configs", () => {
  const analysis = analyzeModelPackage({
    source: { type: "local-directory", label: "Flux-ish Pipeline" },
    files: [
      {
        path: "unet/config.json",
        size: 120,
        text: JSON.stringify({ _class_name: "UNet2DConditionModel", block_out_channels: [320, 640] })
      },
      {
        path: "vae/config.json",
        size: 100,
        text: JSON.stringify({ _class_name: "AutoencoderKL", latent_channels: 4 })
      },
      {
        path: "transformer/config.json",
        size: 140,
        text: JSON.stringify({ _class_name: "SD3Transformer2DModel", num_layers: 24 })
      }
    ]
  });

  assert.equal(analysis.overview.modality, "image");
  assert.equal(analysis.overview.architecture, "Diffusion Pipeline");
  assert.ok(analysis.structure.nodes.some((node) => node.kind === "unet"));
  assert.ok(analysis.structure.nodes.some((node) => node.kind === "vae"));
  assert.ok(analysis.structure.nodes.some((node) => node.kind === "dit"));
  assert.ok(analysis.dataflow.edges.some((edge) => edge.from === "conditioning"));
});

test("records GGUF storage and quantization as filename-derived inferences", () => {
  const analysis = analyzeModelPackage({
    source: { type: "local-directory", label: "Qwen GGUF" },
    files: [
      { path: "qwen2.5-7b-instruct-q4_k_m.gguf", size: 4680000000 }
    ]
  });

  assert.equal(analysis.storage.formats.gguf.count, 1);
  assert.equal(analysis.storage.quantization, "Q4_K_M");
  assert.ok(
    analysis.facts.some(
      (fact) =>
        fact.key === "quantization" &&
        fact.status === "inferred" &&
        fact.source === "filename"
    )
  );
});

test("uses safetensors index files for shard and metadata-only tensor insight", () => {
  const analysis = analyzeModelPackage({
    source: { type: "hugging-face", label: "org/sharded-model" },
    files: [
      {
        path: "config.json",
        size: 160,
        text: JSON.stringify({ model_type: "llama", hidden_size: 2048, num_hidden_layers: 24 })
      },
      {
        path: "model.safetensors.index.json",
        size: 360,
        text: JSON.stringify({
          metadata: { total_size: 6000 },
          weight_map: {
            "model.embed_tokens.weight": "model-00001-of-00002.safetensors",
            "model.layers.0.self_attn.q_proj.weight": "model-00001-of-00002.safetensors",
            "model.layers.1.mlp.down_proj.weight": "model-00002-of-00002.safetensors"
          }
        })
      },
      { path: "model-00001-of-00002.safetensors", size: 4000 },
      { path: "model-00002-of-00002.safetensors", size: 2000 }
    ]
  });

  assert.equal(analysis.storage.shards.length, 2);
  assert.equal(analysis.storage.shards[0].tensorCount, 2);
  assert.equal(analysis.weights.tensors.length, 3);
  assert.ok(analysis.weights.tensors.every((tensor) => tensor.metadataOnly));
  assert.ok(
    analysis.facts.some(
      (fact) =>
        fact.key === "shard_index" &&
        fact.status === "verified" &&
        fact.source === "index"
    )
  );
});

test("identifies LoRA adapters and exposes their target coverage", () => {
  const analysis = analyzeModelPackage({
    source: { type: "local-directory", label: "Rank Adapter" },
    files: [
      {
        path: "adapter_config.json",
        size: 280,
        text: JSON.stringify({
          base_model_name_or_path: "Tiny Llama",
          peft_type: "LORA",
          r: 16,
          target_modules: ["q_proj", "v_proj"]
        })
      },
      {
        path: "adapter_model.safetensors",
        size: 2048,
        bytes: safetensorsFixture({
          "base_model.model.model.layers.0.self_attn.q_proj.lora_A.weight": {
            dtype: "F16",
            shape: [16, 4096],
            data_offsets: [0, 131072]
          },
          "base_model.model.model.layers.0.self_attn.v_proj.lora_B.weight": {
            dtype: "F16",
            shape: [4096, 16],
            data_offsets: [131072, 262144]
          }
        })
      }
    ]
  });

  assert.equal(analysis.overview.architecture, "LoRA Adapter");
  assert.equal(analysis.storage.adapter.type, "LORA");
  assert.deepEqual(analysis.storage.adapter.targetModules, ["q_proj", "v_proj"]);
  assert.ok(analysis.structure.nodes.some((node) => node.kind === "lora"));
  assert.ok(analysis.dataflow.edges.some((edge) => edge.to === "base-model"));
  assert.ok(
    analysis.facts.some(
      (fact) =>
        fact.key === "adapter_type" &&
        fact.status === "verified" &&
        fact.source === "config"
    )
  );
});

test("parses GGUF header metadata when local bytes are available", () => {
  const analysis = analyzeModelPackage({
    source: { type: "local-directory", label: "Qwen GGUF" },
    files: [
      {
        path: "qwen2.5-7b-instruct-q4_k_m.gguf",
        size: 4680000000,
        bytes: ggufFixture({
          tensorCount: 291,
          metadata: {
            "general.architecture": "qwen2",
            "general.name": "Qwen2.5 7B Instruct",
            "llama.context_length": 32768
          }
        })
      }
    ]
  });

  assert.equal(analysis.storage.gguf.version, 3);
  assert.equal(analysis.storage.gguf.tensorCount, 291);
  assert.equal(analysis.storage.gguf.metadata["general.architecture"], "qwen2");
  assert.equal(analysis.storage.quantization, "Q4_K_M");
  assert.ok(
    analysis.facts.some(
      (fact) =>
        fact.key === "gguf_metadata" &&
        fact.status === "verified" &&
        fact.source === "weights"
    )
  );
});

test("parses GGUF array metadata without dropping the whole header", () => {
  const analysis = analyzeModelPackage({
    source: { type: "local-directory", label: "Token GGUF" },
    files: [
      {
        path: "token-model.gguf",
        size: 1200000,
        bytes: ggufFixture({
          tensorCount: 10,
          metadata: {
            "general.architecture": "llama",
            "tokenizer.ggml.tokens": ["<s>", "</s>"]
          }
        })
      }
    ]
  });

  assert.deepEqual(analysis.storage.gguf.metadata["tokenizer.ggml.tokens"], ["<s>", "</s>"]);
  assert.equal(analysis.facts.some((fact) => fact.key === "gguf_parse_error"), false);
});

test("keeps partial GGUF metadata when the bounded header prefix ends early", () => {
  const bytes = ggufFixture({
    tensorCount: 10,
    metadata: {
      "general.architecture": "llama",
      "tokenizer.ggml.tokens": ["<s>", "</s>", "<unk>"]
    }
  });

  const analysis = analyzeModelPackage({
    source: { type: "local-directory", label: "Partial GGUF" },
    files: [
      {
        path: "partial.gguf",
        size: 1200000,
        bytes: bytes.slice(0, bytes.length - 4)
      }
    ]
  });

  assert.equal(analysis.storage.gguf.metadata["general.architecture"], "llama");
  assert.ok(analysis.facts.some((fact) => fact.key === "gguf_parse_error"));
});

test("keeps analysis usable when a safetensors header is unreadable", () => {
  const invalidHeader = new Uint8Array(18);
  new DataView(invalidHeader.buffer).setBigUint64(0, 10n, true);
  invalidHeader.set(new TextEncoder().encode("{broken"), 8);

  const analysis = analyzeModelPackage({
    source: { type: "local-directory", label: "Damaged" },
    files: [
      {
        path: "config.json",
        size: 120,
        text: JSON.stringify({ model_type: "llama", hidden_size: 1024 })
      },
      {
        path: "model.safetensors",
        size: 4096,
        bytes: invalidHeader
      }
    ]
  });

  assert.equal(analysis.overview.architecture, "Transformer");
  assert.equal(analysis.weights.tensors.length, 0);
  assert.ok(
    analysis.facts.some(
      (fact) =>
        fact.key === "safetensors_parse_error" &&
        fact.status === "warning" &&
        fact.source === "weights"
    )
  );
});

test("compares structure, tensor, and storage changes between two analyses", () => {
  const base = analyzeModelPackage({
    source: { type: "local-directory", label: "Base" },
    files: [
      {
        path: "config.json",
        size: 120,
        text: JSON.stringify({ model_type: "llama", hidden_size: 4096, num_hidden_layers: 32 })
      },
      {
        path: "base.safetensors",
        size: 1024,
        bytes: safetensorsFixture({
          "model.layers.0.self_attn.q_proj.weight": {
            dtype: "BF16",
            shape: [4096, 4096],
            data_offsets: [0, 33554432]
          }
        })
      }
    ]
  });
  const tuned = analyzeModelPackage({
    source: { type: "local-directory", label: "LoRA Tune" },
    files: [
      {
        path: "config.json",
        size: 140,
        text: JSON.stringify({ model_type: "llama", hidden_size: 4096, num_hidden_layers: 40 })
      },
      {
        path: "adapter_model.safetensors",
        size: 768,
        bytes: safetensorsFixture({
          "base_model.model.model.layers.0.self_attn.q_proj.lora_A.weight": {
            dtype: "F16",
            shape: [8, 4096],
            data_offsets: [0, 65536]
          }
        })
      }
    ]
  });

  const diff = diffAnalyses(base, tuned);

  assert.equal(diff.summary.changedConfigs, 1);
  assert.equal(diff.summary.addedTensors, 1);
  assert.equal(diff.summary.removedTensors, 1);
  assert.ok(diff.structureChanges.some((change) => change.key === "num_hidden_layers"));
  assert.ok(diff.tensorChanges.some((change) => change.status === "added"));
  assert.ok(diff.storageDeltaBytes < 0);
});

test("rejects invalid packages with a clear validation error", () => {
  assert.throws(
    () => analyzeModelPackage({ source: { type: "local-directory", label: "Broken" }, files: [] }),
    /files must contain at least one file/i
  );
});
