import { buildArchitectureDiagram } from "./diagram.js";
import { readGgufFile } from "./gguf.js";
import { readSafetensorsFile } from "./safetensors.js";
import { readSafetensorsIndexes } from "./safetensors-index.js";

const CONFIG_FACT_KEYS = [
  "_class_name",
  "architectures",
  "base_model_name_or_path",
  "hidden_size",
  "latent_channels",
  "model_type",
  "num_attention_heads",
  "num_experts",
  "num_hidden_layers",
  "num_key_value_heads",
  "num_layers",
  "peft_type",
  "r",
  "target_modules",
  "torch_dtype",
  "vocab_size"
];

const DTYPE_LABELS = {
  BF16: "bfloat16",
  F16: "float16",
  F32: "float32",
  F64: "float64",
  I8: "int8",
  I16: "int16",
  I32: "int32",
  I64: "int64",
  U8: "uint8"
};

export function analyzeModelPackage(modelPackage) {
  const normalized = validateModelPackage(modelPackage);
  const jsonFiles = normalized.files.map(parseJsonFile).filter(Boolean);
  const configEntries = jsonFiles.filter(isConfigEntry);
  const safetensorReadouts = normalized.files.map(readSafetensorsFile).filter(Boolean);
  const indexReadout = readSafetensorsIndexes(jsonFiles, normalized.files);
  const ggufReadouts = normalized.files.map(readGgufFile).filter(Boolean);
  const tensorEntries = mergeTensorEntries(
    indexReadout.tensors,
    safetensorReadouts.flatMap((readout) => readout.tensors)
  );
  const adapter = inferAdapter(configEntries, tensorEntries);
  const quantization = inferQuantization(normalized.files, configEntries);
  const anatomy = inferAnatomy(
    normalized.files,
    configEntries,
    tensorEntries,
    quantization,
    adapter,
    ggufReadouts
  );
  const configFacts = configEntries.flatMap(configEntryFacts);
  const tensorFacts = tensorEntries.length > 0
    ? [
        fact({
          key: "tensor_metadata",
          label: "Tensor metadata",
          source: "weights",
          status: "verified",
          value: `${tensorEntries.length} tensors`
        })
      ]
    : [];
  const quantizationFacts = quantization
    ? [
        fact({
          key: "quantization",
          label: "Quantization",
          source: quantization.source,
          status: quantization.status,
          value: quantization.value
        })
      ]
    : [];
  const indexFacts = indexReadout.indexCount > 0
    ? [
        fact({
          key: "shard_index",
          label: "Safetensors shard index",
          source: "index",
          status: "verified",
          value: `${indexReadout.shards.length} shards / ${indexReadout.tensors.length} tensors`
        })
      ]
    : [];
  const adapterFacts = adapter
    ? [
        fact({
          key: "adapter_type",
          label: "Adapter type",
          source: adapter.source,
          status: adapter.status,
          value: adapter.type
        }),
        fact({
          key: "adapter_targets",
          label: "Adapter targets",
          source: adapter.source,
          status: adapter.status,
          value: adapter.targetModules
        })
      ]
    : [];
  const hfParameterSummary = huggingFaceParameterSummary(normalized.source);
  const huggingFaceFacts = [
    ...(hfParameterSummary.total > 0
      ? [
          fact({
            key: "hf_safetensors_parameters",
            label: "Hugging Face parameters",
            source: "huggingface",
            status: "verified",
            value: hfParameterSummary.total
          })
        ]
      : []),
    ...(Number.isFinite(normalized.source.metadata.usedStorage)
      ? [
          fact({
            key: "hf_used_storage",
            label: "Hugging Face storage",
            source: "huggingface",
            status: "verified",
            value: normalized.source.metadata.usedStorage
          })
        ]
      : [])
  ];
  const ggufFacts = ggufReadouts.flatMap((readout) => [
    ...(readout.version
      ? [
          fact({
            key: "gguf_metadata",
            label: "GGUF metadata",
            source: "weights",
            status: "verified",
            value: `v${readout.version} / ${readout.tensorCount} tensors`,
            evidence: readout.path
          })
        ]
      : []),
    ...readout.warnings.map((warning) =>
      fact({
        key: "gguf_parse_error",
        label: "GGUF parse warning",
        source: "weights",
        status: "warning",
        value: warning,
        evidence: readout.path
      })
    )
  ]);
  const parseWarningFacts = safetensorReadouts.flatMap((readout) =>
    readout.warnings.map((warning) =>
      fact({
        key: "safetensors_parse_error",
        label: "Safetensors parse warning",
        source: "weights",
        status: "warning",
        value: warning,
        evidence: readout.path
      })
    )
  );
  const allFacts = [
    ...configFacts,
    ...tensorFacts,
    ...indexFacts,
    ...quantizationFacts,
    ...adapterFacts,
    ...huggingFaceFacts,
    ...ggufFacts,
    ...parseWarningFacts,
    fact({
      key: "architecture",
      label: "Architecture",
      source: "rule",
      status: "inferred",
      value: anatomy.architecture,
      evidence: anatomy.evidence
    })
  ];
  const storage = buildStorage(normalized.files, quantization, indexReadout, ggufReadouts, adapter, normalized.source);
  const weights = buildWeights(tensorEntries, normalized.source);
  const structure = buildStructure(anatomy, configEntries, weights, adapter);
  const dataflow = buildDataflow(anatomy, adapter);
  const diagram = buildArchitectureDiagram(anatomy, structure, dataflow, configEntries, weights, storage);

  return {
    id: stableId(normalized.source.label, normalized.files),
    source: normalized.source,
    overview: {
      architecture: anatomy.architecture,
      deploymentEstimate: estimateDeployment(storage, weights, quantization),
      displayName: normalized.source.label,
      modality: anatomy.modality,
      precision: inferPrecision(configEntries, tensorEntries, quantization, normalized.source),
      totalBytes: storage.totalBytes,
      totalParameters: weights.totalParameters
    },
    facts: allFacts,
    structure,
    dataflow,
    diagram,
    weights,
    storage,
    views: [
      "Overview",
      "Anatomy",
      "Dataflow",
      "Weights",
      "Storage",
      "Diff"
    ]
  };
}

export function diffAnalyses(baseAnalysis, nextAnalysis) {
  const baseConfig = factMap(baseAnalysis, "config");
  const nextConfig = factMap(nextAnalysis, "config");
  const configKeys = unique([...Object.keys(baseConfig), ...Object.keys(nextConfig)]);
  const structureChanges = configKeys
    .filter((key) => JSON.stringify(baseConfig[key]) !== JSON.stringify(nextConfig[key]))
    .map((key) => ({
      key,
      before: baseConfig[key],
      after: nextConfig[key],
      status: baseConfig[key] === undefined ? "added" : nextConfig[key] === undefined ? "removed" : "changed"
    }));
  const tensorChanges = diffTensors(baseAnalysis.weights.tensors, nextAnalysis.weights.tensors);
  const storageDeltaBytes = nextAnalysis.storage.totalBytes - baseAnalysis.storage.totalBytes;
  const quantizationChange =
    baseAnalysis.storage.quantization === nextAnalysis.storage.quantization
      ? []
      : [
          {
            key: "quantization",
            before: baseAnalysis.storage.quantization,
            after: nextAnalysis.storage.quantization,
            status: "changed"
          }
        ];

  return {
    summary: {
      addedTensors: tensorChanges.filter((change) => change.status === "added").length,
      changedConfigs: structureChanges.filter((change) => change.status === "changed").length,
      changedTensors: tensorChanges.filter((change) => change.status === "changed").length,
      removedTensors: tensorChanges.filter((change) => change.status === "removed").length
    },
    structureChanges,
    tensorChanges,
    storageDeltaBytes,
    storageChanges: quantizationChange
  };
}

function validateModelPackage(modelPackage) {
  if (!modelPackage || typeof modelPackage !== "object") {
    throw new TypeError("model package must be an object");
  }
  if (!Array.isArray(modelPackage.files) || modelPackage.files.length === 0) {
    throw new TypeError("files must contain at least one file");
  }

  return {
    source: {
      type: modelPackage.source?.type || "local-directory",
      label: modelPackage.source?.label || "Untitled model",
      metadata: modelPackage.source?.metadata || {}
    },
    files: modelPackage.files
      .map((file) => {
        if (!file || typeof file.path !== "string" || file.path.trim() === "") {
          throw new TypeError("each file must include a path");
        }
        return {
          path: file.path,
          size: Number.isFinite(file.size) ? file.size : byteLength(file.text, file.bytes),
          text: typeof file.text === "string" ? file.text : undefined,
          bytes: file.bytes
        };
      })
      .sort((left, right) => left.path.localeCompare(right.path))
  };
}

function parseJsonFile(file) {
  if (!file.path.toLowerCase().endsWith(".json") || typeof file.text !== "string") {
    return undefined;
  }
  try {
    return { path: file.path, json: JSON.parse(file.text) };
  } catch (error) {
    return {
      path: file.path,
      error: error instanceof Error ? error.message : "Unknown JSON parse error"
    };
  }
}

function isConfigEntry(entry) {
  if (!entry?.json || typeof entry.json !== "object") {
    return false;
  }
  const lowerPath = entry.path.toLowerCase();
  return lowerPath.endsWith("config.json") || lowerPath.endsWith("model_index.json");
}

function configEntryFacts(entry) {
  return CONFIG_FACT_KEYS
    .filter((key) => entry.json[key] !== undefined)
    .map((key) =>
      fact({
        key,
        label: key,
        source: "config",
        status: "verified",
        value: entry.json[key],
        evidence: entry.path
      })
    );
}

function inferAdapter(configEntries, tensorEntries) {
  const adapterConfig = configEntries.find(
    (entry) => entry.path.toLowerCase().includes("adapter_config") || entry.json.peft_type
  );
  const loraTensors = tensorEntries.filter((tensor) => tensor.name.toLowerCase().includes("lora_"));
  const type = adapterConfig?.json.peft_type || (loraTensors.length > 0 ? "LORA" : undefined);
  if (!type) {
    return undefined;
  }
  const targetModules = Array.isArray(adapterConfig?.json.target_modules)
    ? adapterConfig.json.target_modules
    : inferLoraTargets(loraTensors);

  return {
    type: String(type).toUpperCase(),
    baseModel: adapterConfig?.json.base_model_name_or_path,
    rank: adapterConfig?.json.r,
    targetModules,
    tensorCount: loraTensors.length,
    source: adapterConfig ? "config" : "rule",
    status: adapterConfig ? "verified" : "inferred"
  };
}

function inferLoraTargets(tensors) {
  return unique(
    tensors
      .map((tensor) => tensor.name.match(/\.([A-Za-z0-9_]+)\.lora_[AB]\./)?.[1])
      .filter(Boolean)
  );
}

function inferQuantization(files, configEntries) {
  const fromConfig = configEntries
    .map((entry) => entry.json.quantization_config?.quant_method || entry.json.quantization_config?.bits)
    .find((value) => value !== undefined);
  if (fromConfig !== undefined) {
    return {
      value: String(fromConfig),
      source: "config",
      status: "verified"
    };
  }

  const fileQuantization = files
    .map((file) => file.path.toLowerCase().match(/(?:^|[-_.])(q\d(?:_[a-z0-9]+){0,3})(?:[-_.]|$)/i)?.[1])
    .find(Boolean);

  return fileQuantization
    ? {
        value: fileQuantization.toUpperCase(),
        source: "filename",
        status: "inferred"
      }
    : undefined;
}

function inferAnatomy(files, configEntries, tensorEntries, quantization, adapter, ggufReadouts = []) {
  const searchable = [
    ...files.map((file) => file.path),
    ...configEntries.map((entry) => JSON.stringify(entry.json)),
    ...tensorEntries.map((tensor) => tensor.name),
    ...ggufReadouts.map((readout) => JSON.stringify(readout.metadata))
  ]
    .join("\n")
    .toLowerCase();
  const hasUnet = searchable.includes("unet");
  const hasVae = searchable.includes("vae") || searchable.includes("autoencoderkl");
  const hasDit =
    searchable.includes("dit") ||
    searchable.includes("transformer2d") ||
    searchable.includes("sd3transformer");
  const hasMoe = searchable.includes("num_experts") || searchable.includes("experts");
  const hasTransformer =
    searchable.includes("llama") ||
    searchable.includes("mistral") ||
    searchable.includes("qwen") ||
    searchable.includes("gemma") ||
    searchable.includes("gpt") ||
    searchable.includes("transformer");
  const hasGguf = files.some((file) => file.path.toLowerCase().endsWith(".gguf"));

  if (adapter?.type === "LORA") {
    return {
      architecture: "LoRA Adapter",
      modality: "text",
      family: "adapter",
      evidence: "Adapter config or LoRA tensor names",
      adapter
    };
  }

  if (hasUnet || hasVae || hasDit) {
    return {
      architecture: "Diffusion Pipeline",
      modality: "image",
      family: "diffusion",
      evidence: "Diffusers-style component configs or tensor names",
      hasUnet,
      hasVae,
      hasDit
    };
  }

  if (hasMoe) {
    return {
      architecture: "MoE Transformer",
      modality: "text",
      family: "transformer",
      evidence: "Expert/router naming or num_experts config",
      hasMoe: true
    };
  }

  if (hasTransformer || hasGguf || quantization) {
    return {
      architecture: "Transformer",
      modality: "text",
      family: "transformer",
      evidence: "Transformer model_type, tensor names, or GGUF artifact"
    };
  }

  return {
    architecture: "Unknown Semantic Model",
    modality: "unknown",
    family: "unknown",
    evidence: "No recognized model family markers"
  };
}

function buildStorage(files, quantization, indexReadout, ggufReadouts, adapter, source) {
  const formats = files.reduce(
    (accumulator, file) => ({
      ...accumulator,
      [formatForPath(file.path)]: {
        count: (accumulator[formatForPath(file.path)]?.count || 0) + 1,
        bytes: (accumulator[formatForPath(file.path)]?.bytes || 0) + file.size
      }
    }),
    {}
  );

  const fileTotalBytes = files.reduce((total, file) => total + file.size, 0);
  const sourceTotalBytes = Number.isFinite(source.metadata.usedStorage)
    ? source.metadata.usedStorage
    : 0;

  return {
    totalBytes: Math.max(fileTotalBytes, sourceTotalBytes),
    fileTotalBytes,
    files: files.map((file) => ({
      path: file.path,
      size: file.size,
      format: formatForPath(file.path)
    })),
    formats,
    quantization: quantization?.value || "none detected",
    shards: indexReadout.shards,
    safetensorsIndexTotalSize: indexReadout.totalSize,
    gguf: ggufReadouts.find((readout) => readout.version),
    adapter
  };
}

function buildWeights(tensors, source) {
  const tensorParameters = tensors.reduce((total, tensor) => total + tensor.parameters, 0);
  const hfParameterSummary = huggingFaceParameterSummary(source);
  const totalParameters = Math.max(tensorParameters, hfParameterSummary.total);
  const dtypeCounts = tensors.reduce(
    (accumulator, tensor) => ({
      ...accumulator,
      [tensor.dtype || "unknown"]: (accumulator[tensor.dtype || "unknown"] || 0) + 1
    }),
    {}
  );
  const groups = tensors.reduce(
    (accumulator, tensor) => ({
      ...accumulator,
      [tensorGroup(tensor.name)]: (accumulator[tensorGroup(tensor.name)] || 0) + 1
    }),
    {}
  );
  const averageParameters = tensors.length > 0 ? totalParameters / tensors.length : 0;
  const anomalies = tensors
    .filter((tensor) => tensor.parameters > averageParameters * 2 && tensors.length > 1)
    .map((tensor) => ({
      name: tensor.name,
      reason: "Large tensor relative to package average",
      parameters: tensor.parameters
    }));

  return {
    tensors,
    totalParameters,
    tensorParameters,
    externalParameters: hfParameterSummary.total,
    parameterBreakdown: hfParameterSummary.parameters,
    dtypeCounts,
    groups,
    anomalies
  };
}

function buildStructure(anatomy, configEntries, weights, adapter) {
  const layers = numberFromConfigs(configEntries, ["num_hidden_layers", "num_layers"]);
  const hiddenSize = numberFromConfigs(configEntries, ["hidden_size"]);
  const transformerNodes = [
    node("embeddings", "Token embeddings", "embedding", "verified", "config", { hiddenSize }),
    node("blocks", `${layers || "N"} decoder blocks`, "block-group", "inferred", "rule", { layers }),
    node("attention", "Self attention", "attention", "inferred", "rule"),
    node("mlp", "Feed-forward / MLP", "mlp", "inferred", "rule"),
    node("kv-cache", "KV cache path", "cache", "inferred", "rule"),
    node("lm-head", "Language modeling head", "head", "inferred", "rule")
  ];
  const moeNodes = anatomy.hasMoe
    ? [
        node("router", "Router", "router", "inferred", "rule"),
        node("experts", "Experts", "experts", "inferred", "rule")
      ]
    : [];
  const diffusionNodes = [
    anatomy.hasUnet ? node("unet", "U-Net denoiser", "unet", "verified", "config") : undefined,
    anatomy.hasVae ? node("vae", "VAE latent codec", "vae", "verified", "config") : undefined,
    anatomy.hasDit ? node("dit", "Diffusion transformer", "dit", "verified", "config") : undefined,
    node("conditioning", "Conditioning inputs", "conditioning", "inferred", "rule"),
    node("scheduler", "Scheduler steps", "scheduler", "inferred", "rule")
  ].filter(Boolean);
  const unknownNodes = [
    node("files", "Model files", "files", "verified", "filesystem"),
    node("weights", `${weights.tensors.length} tensors`, "weights", "verified", "weights")
  ];
  const adapterNodes = adapter
    ? [
        node("base-model", adapter.baseModel || "Base model", "base-model", "verified", "config"),
        node("lora", `LoRA rank ${adapter.rank || "?"}`, "lora", "verified", adapter.source, {
          rank: adapter.rank,
          targetModules: adapter.targetModules.join(", ") || "inferred from tensor names",
          tensorCount: adapter.tensorCount
        }),
        node("target-modules", "Target modules", "targets", adapter.status, adapter.source, {
          modules: adapter.targetModules.join(", ") || "unknown"
        })
      ]
    : [];
  const children =
    anatomy.family === "diffusion"
      ? diffusionNodes
      : anatomy.family === "adapter"
        ? adapterNodes
      : anatomy.family === "transformer"
        ? [...transformerNodes, ...moeNodes]
        : unknownNodes;

  return {
    rootId: "model",
    nodes: [
      node("model", anatomy.architecture, "model", "inferred", "rule", {
        modality: anatomy.modality
      }),
      ...children
    ],
    links: children.map((child) => ({ from: "model", to: child.id }))
  };
}

function buildDataflow(anatomy, adapter) {
  if (anatomy.family === "adapter") {
    return {
      nodes: ["adapter-input", "lora", "base-model", "merged-output"],
      edges: [
        { from: "adapter-input", to: "lora", label: "low-rank deltas" },
        { from: "lora", to: "base-model", label: adapter?.targetModules.join(", ") || "target modules" },
        { from: "base-model", to: "merged-output", label: "adapted activations" }
      ]
    };
  }

  if (anatomy.family === "diffusion") {
    return {
      nodes: ["conditioning", "scheduler", "dit", "unet", "vae", "image"].filter(
        (id) =>
          id === "conditioning" ||
          id === "scheduler" ||
          id === "image" ||
          (id === "dit" && anatomy.hasDit) ||
          (id === "unet" && anatomy.hasUnet) ||
          (id === "vae" && anatomy.hasVae)
      ),
      edges: [
        { from: "conditioning", to: anatomy.hasDit ? "dit" : "unet", label: "text / image conditions" },
        { from: "scheduler", to: anatomy.hasDit ? "dit" : "unet", label: "timestep" },
        anatomy.hasDit && anatomy.hasUnet ? { from: "dit", to: "unet", label: "latent tokens" } : undefined,
        anatomy.hasUnet && anatomy.hasVae ? { from: "unet", to: "vae", label: "denoised latent" } : undefined,
        anatomy.hasVae ? { from: "vae", to: "image", label: "decoded pixels" } : undefined
      ].filter(Boolean)
    };
  }

  if (anatomy.family === "transformer") {
    return {
      nodes: ["tokens", "embeddings", "attention", "kv-cache", "residual", "mlp", "lm-head"],
      edges: [
        { from: "tokens", to: "embeddings", label: "token ids" },
        { from: "embeddings", to: "attention", label: "hidden states" },
        { from: "attention", to: "kv-cache", label: "keys / values" },
        { from: "attention", to: "residual", label: "residual add" },
        { from: "residual", to: "mlp", label: "normalized states" },
        { from: "mlp", to: "lm-head", label: "logits path" }
      ]
    };
  }

  return {
    nodes: ["files", "metadata", "report"],
    edges: [{ from: "files", to: "metadata", label: "scan" }, { from: "metadata", to: "report", label: "summarize" }]
  };
}

function inferPrecision(configEntries, tensors, quantization, source = { metadata: {} }) {
  const dtypeFromConfig = configEntries
    .map((entry) => entry.json.torch_dtype)
    .find((value) => typeof value === "string");
  const dtypeFromTensor = tensors.map((tensor) => tensor.dtype).find(Boolean);
  const dtypeFromHuggingFace = Object.keys(source.metadata.safetensors?.parameters || {})
    .find((key) => Number(source.metadata.safetensors.parameters[key]) > 0);
  return dtypeFromConfig || DTYPE_LABELS[dtypeFromTensor] || DTYPE_LABELS[dtypeFromHuggingFace] || quantization?.value || "metadata-only";
}

function estimateDeployment(storage, weights, quantization) {
  const weightBytes = weights.tensors.reduce((total, tensor) => total + (tensor.bytes || 0), 0);
  const effectiveBytes = weightBytes || storage.totalBytes;
  const vramBytes = quantization ? effectiveBytes * 1.18 : effectiveBytes * 1.32;
  return {
    disk: effectiveBytes,
    estimatedVram: Math.round(vramBytes),
    note: weightBytes > 0 ? "Derived from tensor metadata" : "Derived from file sizes"
  };
}

function diffTensors(baseTensors, nextTensors) {
  const baseMap = objectBy(baseTensors, "name");
  const nextMap = objectBy(nextTensors, "name");
  return unique([...Object.keys(baseMap), ...Object.keys(nextMap)])
    .filter((name) => JSON.stringify(baseMap[name]) !== JSON.stringify(nextMap[name]))
    .map((name) => ({
      name,
      before: baseMap[name],
      after: nextMap[name],
      status: baseMap[name] === undefined ? "added" : nextMap[name] === undefined ? "removed" : "changed"
    }));
}

function fact({ key, label, source, status, value, evidence }) {
  return { key, label, source, status, value, evidence };
}

function node(id, label, kind, status, source, metrics = {}) {
  return { id, label, kind, status, source, metrics };
}

function factMap(analysis, source) {
  return analysis.facts
    .filter((factItem) => factItem.source === source)
    .reduce(
      (accumulator, factItem) => ({
        ...accumulator,
        [factItem.key]: factItem.value
      }),
      {}
    );
}

function numberFromConfigs(configEntries, keys) {
  return configEntries
    .flatMap((entry) => keys.map((key) => entry.json[key]))
    .find((value) => Number.isFinite(value));
}

function formatForPath(path) {
  const lowerPath = path.toLowerCase();
  if (lowerPath.endsWith(".safetensors")) {
    return "safetensors";
  }
  if (lowerPath.endsWith(".gguf")) {
    return "gguf";
  }
  if (lowerPath.endsWith(".json")) {
    return "json";
  }
  if (lowerPath.endsWith(".bin")) {
    return "pytorch-bin";
  }
  return "other";
}

function tensorGroup(name) {
  if (name.includes("lora_")) {
    return "lora";
  }
  if (name.includes("self_attn") || name.includes("attention")) {
    return "attention";
  }
  if (name.includes("mlp") || name.includes("feed_forward")) {
    return "mlp";
  }
  if (name.includes("embed")) {
    return "embedding";
  }
  return "other";
}

function stableId(label, files) {
  const seed = `${label}:${files.map((file) => `${file.path}:${file.size}`).join("|")}`;
  const hash = [...seed].reduce((value, character) => (value * 31 + character.charCodeAt(0)) >>> 0, 2166136261);
  return `model-${hash.toString(16)}`;
}

function byteLength(text, bytes) {
  if (typeof text === "string") {
    return new TextEncoder().encode(text).length;
  }
  if (bytes?.byteLength !== undefined) {
    return bytes.byteLength;
  }
  return 0;
}

function huggingFaceParameterSummary(source = { metadata: {} }) {
  const parameters = source.metadata?.safetensors?.parameters || {};
  const totalFromParameters = Object.values(parameters).reduce(
    (total, value) => total + (Number.isFinite(value) ? value : 0),
    0
  );
  const totalFromMetadata = source.metadata?.safetensors?.total;
  return {
    parameters,
    total: Number.isFinite(totalFromMetadata) ? totalFromMetadata : totalFromParameters
  };
}

function mergeTensorEntries(...groups) {
  const tensorByName = groups.flat().reduce(
    (accumulator, tensor) => ({
      ...accumulator,
      [tensor.name]: tensor
    }),
    {}
  );
  return Object.values(tensorByName).sort((left, right) => left.name.localeCompare(right.name));
}

function objectBy(items, key) {
  return items.reduce(
    (accumulator, item) => ({
      ...accumulator,
      [item[key]]: item
    }),
    {}
  );
}

function unique(items) {
  return [...new Set(items)];
}
