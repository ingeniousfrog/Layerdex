const DECODER_ONLY_MODEL_TYPES = new Set([
  "baichuan",
  "bloom",
  "deepseek",
  "falcon",
  "gemma",
  "gpt2",
  "gpt_bigcode",
  "llama",
  "mistral",
  "mixtral",
  "mpt",
  "phi",
  "qwen",
  "qwen2",
  "qwen3",
  "starcoder2"
]);

const ENCODER_MODEL_TYPES = new Set([
  "bert",
  "clip",
  "clip_text_model",
  "distilbert",
  "roberta",
  "xlm-roberta"
]);

const ENCODER_DECODER_MODEL_TYPES = new Set([
  "bart",
  "mt5",
  "t5"
]);

const TRANSFORMER_MODEL_TYPES = new Set([
  ...DECODER_ONLY_MODEL_TYPES,
  ...ENCODER_MODEL_TYPES,
  ...ENCODER_DECODER_MODEL_TYPES
]);

export function resolveArchitecture(ir) {
  if (ir.adapter?.type === "LORA") {
    return {
      architecture: "LoRA Adapter",
      modality: "text",
      family: "adapter",
      evidence: evidenceText(ir.adapter.source, "Adapter config or LoRA tensor namespace"),
      source: ir.adapter.source,
      status: ir.adapter.status,
      adapter: ir.adapter,
      components: ir.components
    };
  }

  const diffusion = resolveDiffusion(ir);
  if (diffusion) {
    return diffusion;
  }

  const transformer = resolveTransformer(ir);
  if (transformer) {
    return transformer;
  }

  return {
    architecture: "Unknown Semantic Model",
    modality: "unknown",
    family: "unknown",
    evidence: "No strong architecture candidate found in config, Diffusers metadata, or GGUF metadata",
    source: "schema",
    status: "inferred",
    components: ir.components
  };
}

function resolveDiffusion(ir) {
  const configComponents = new Set(ir.configs.map((config) => config.component).filter(Boolean));
  const hasPipeline = configComponents.has("pipeline");
  const hasUnet = configComponents.has("unet");
  const hasVae = configComponents.has("vae");
  const hasDit = configComponents.has("dit");
  const isDiffusion = hasPipeline || hasUnet || hasVae || hasDit;
  if (!isDiffusion) {
    return undefined;
  }
  const hasClip = configComponents.has("clip") || hasComponent(ir, "clip");
  const hasT5 = configComponents.has("t5") || hasComponent(ir, "t5");
  const hasScheduler = configComponents.has("scheduler") || hasComponent(ir, "scheduler");
  const isFlux = hasClass(ir, "fluxpipeline") || hasClass(ir, "fluxtransformer");
  const primaryEvidence = firstConfigEvidence(ir, ["pipeline", "dit", "unet", "vae"]);
  return {
    architecture: isFlux ? "FLUX Diffusion Pipeline" : "Diffusion Pipeline",
    modality: "image",
    family: "diffusion",
    evidence: primaryEvidence || "Diffusers config schema matched",
    source: sourceForEvidence(primaryEvidence) || "schema",
    status: statusForEvidence(primaryEvidence) || "inferred",
    isFlux,
    hasClip,
    hasT5,
    hasUnet,
    hasVae,
    hasDit,
    hasScheduler,
    components: ir.components
  };
}

function resolveTransformer(ir) {
  const candidate = transformerCandidate(ir);
  if (!candidate) {
    return undefined;
  }
  const hasMoe =
    ir.configs.some((config) => Number.isFinite(config.json.num_experts)) ||
    hasComponent(ir, "router") ||
    hasComponent(ir, "experts");
  return {
    architecture: hasMoe ? "MoE Transformer" : "Transformer",
    modality: "text",
    family: "transformer",
    evidence: candidate.evidence,
    source: sourceForEvidence(candidate.evidence) || candidate.source,
    status: "verified",
    transformerRole: candidate.role,
    isDecoderOnly: candidate.role === "decoder-only",
    hasMoe,
    components: ir.components
  };
}

function hasComponent(ir, key) {
  return Boolean(ir.components[key]);
}

function hasClass(ir, value) {
  const lowerValue = value.toLowerCase();
  return ir.configs.some((config) => String(config.className || "").toLowerCase().includes(lowerValue));
}

function firstConfigEvidence(ir, components) {
  const config = ir.configs.find((entry) => components.includes(entry.component));
  return config ? `config:${config.path}:${config.component}` : undefined;
}

function sourceForEvidence(evidence) {
  return evidence?.split(":")[0];
}

function statusForEvidence(evidenceTextValue) {
  return evidenceTextValue?.includes("config:") || evidenceTextValue?.includes("gguf:")
    ? "verified"
    : "inferred";
}

function evidenceText(source, evidence) {
  return evidence ? `${source}:${evidence}` : source;
}

function transformerCandidate(ir) {
  for (const config of ir.configs) {
    const roleFromModelType = transformerRoleFromModelType(config.modelType);
    if (roleFromModelType) {
      return {
        source: "config",
        role: roleFromModelType,
        evidence: `config:${config.path}:model_type=${config.modelType}`
      };
    }
    const architecture = config.architectures.find((item) => transformerRoleFromArchitecture(item));
    if (architecture) {
      return {
        source: "config",
        role: transformerRoleFromArchitecture(architecture),
        evidence: `config:${config.path}:architectures=${architecture}`
      };
    }
  }

  const gguf = ir.gguf.find((readout) => readout.metadata?.["general.architecture"]);
  if (gguf) {
    const architecture = gguf.metadata["general.architecture"];
    return {
      source: "gguf",
      role: transformerRoleFromModelType(architecture) || "decoder-only",
      evidence: `gguf:${gguf.path}:general.architecture=${architecture}`
    };
  }

  return undefined;
}

function transformerRoleFromModelType(modelType) {
  const normalized = String(modelType || "").toLowerCase();
  if (DECODER_ONLY_MODEL_TYPES.has(normalized)) {
    return "decoder-only";
  }
  if (ENCODER_MODEL_TYPES.has(normalized)) {
    return "encoder";
  }
  if (ENCODER_DECODER_MODEL_TYPES.has(normalized)) {
    return "encoder-decoder";
  }
  return TRANSFORMER_MODEL_TYPES.has(normalized) ? "generic" : undefined;
}

function transformerRoleFromArchitecture(architecture) {
  const value = String(architecture || "");
  if (/causallm|gpt|llama|qwen|mistral|mixtral|bloom|falcon|gemma|phi|starcoder|mpt|baichuan/i.test(value)) {
    return "decoder-only";
  }
  if (/t5|conditionalgeneration|encoderdecoder|seq2seq/i.test(value)) {
    return "encoder-decoder";
  }
  if (/bert|roberta|distilbert|cliptext|clip/i.test(value)) {
    return "encoder";
  }
  return /transformer|model$/i.test(value) ? "generic" : undefined;
}
