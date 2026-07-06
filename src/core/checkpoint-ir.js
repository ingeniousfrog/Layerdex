import { formatForPath } from "./file-format.js";
import { parseTensorName } from "./tensor-namespace.js";

export function buildCheckpointIr({
  source,
  files,
  configEntries,
  tensorEntries,
  ggufReadouts,
  indexReadout,
  adapter,
  quantization
}) {
  const configs = configEntries.map(normalizeConfig);
  const tensors = tensorEntries.map((tensor) => ({
    ...tensor,
    namespace: parseTensorName(tensor.name, tensor.sourceFile)
  }));
  const gguf = ggufReadouts.map((readout) => ({
    path: readout.path,
    version: readout.version,
    tensorCount: readout.tensorCount,
    metadata: readout.metadata || {},
    tensors: readout.tensors || [],
    warnings: readout.warnings || []
  }));

  return {
    source,
    files: files.map((file) => ({
      path: file.path,
      size: file.size,
      format: formatForPath(file.path)
    })),
    configs,
    tensors,
    gguf,
    index: indexReadout,
    adapter,
    quantization,
    components: buildComponents(configs, tensors, gguf)
  };
}

function normalizeConfig(entry) {
  const json = entry.json || {};
  return {
    path: entry.path,
    json,
    component: componentFromConfig(entry.path, json),
    className: stringValue(json._class_name),
    modelType: stringValue(json.model_type),
    architectures: Array.isArray(json.architectures) ? json.architectures.map(String) : []
  };
}

function buildComponents(configs, tensors, ggufReadouts) {
  const components = new Map();
  for (const config of configs) {
    addComponent(components, config.component, {
      source: "config",
      status: "verified",
      evidence: config.path,
      config
    });
  }
  for (const tensor of tensors) {
    const namespace = tensor.namespace;
    addComponent(components, namespace.component, {
      source: tensor.metadataOnly ? "index" : "weights",
      status: tensor.metadataOnly ? "inferred" : "verified",
      evidence: tensor.sourceFile || tensor.name,
      tensor
    });
    addComponent(components, namespace.blockType, {
      source: tensor.metadataOnly ? "index" : "weights",
      status: tensor.metadataOnly ? "inferred" : "verified",
      evidence: tensor.name,
      tensor
    });
  }
  for (const readout of ggufReadouts) {
    const architecture = readout.metadata?.["general.architecture"];
    if (architecture) {
      addComponent(components, "transformer", {
        source: "gguf",
        status: "verified",
        evidence: `${readout.path}:general.architecture=${architecture}`
      });
    }
  }
  return Object.fromEntries(components);
}

function addComponent(components, key, evidence) {
  if (!key || key === "other") {
    return;
  }
  const current = components.get(key) || {
    key,
    count: 0,
    sources: new Set(),
    statuses: new Set(),
    evidence: []
  };
  current.count += 1;
  current.sources.add(evidence.source);
  current.statuses.add(evidence.status);
  current.evidence.push(evidence);
  components.set(key, current);
}

function componentFromConfig(path, json) {
  const lowerPath = path.toLowerCase();
  const className = String(json._class_name || "").toLowerCase();
  if (lowerPath.includes("adapter_config") || json.peft_type) {
    return "adapter";
  }
  if (lowerPath.includes("text_encoder_2") || className.includes("t5encoder")) {
    return "t5";
  }
  if (lowerPath.includes("text_encoder") || className.includes("cliptext")) {
    return "clip";
  }
  if (lowerPath.includes("unet") || className.includes("unet")) {
    return "unet";
  }
  if (lowerPath.includes("vae") || className.includes("autoencoderkl")) {
    return "vae";
  }
  if (
    lowerPath.includes("transformer") ||
    className.includes("fluxtransformer") ||
    className.includes("sd3transformer") ||
    className.includes("transformer2d")
  ) {
    return "dit";
  }
  if (lowerPath.includes("scheduler") || className.includes("scheduler")) {
    return "scheduler";
  }
  if (lowerPath.endsWith("model_index.json")) {
    return "pipeline";
  }
  return "model";
}

function stringValue(value) {
  return typeof value === "string" ? value : undefined;
}
