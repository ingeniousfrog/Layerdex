const ATTENTION_MARKERS = new Set(["attn", "attention", "self_attn", "self_attention"]);
const MLP_MARKERS = new Set(["mlp", "ffn", "feed_forward", "feedforward"]);
const EMBEDDING_MARKERS = new Set(["embed", "embeddings", "embed_tokens", "wte", "tok_embeddings"]);
const HEAD_MARKERS = new Set(["lm_head", "output", "output_layer"]);
const ROUTER_MARKERS = new Set(["gate", "router"]);
const EXPERT_MARKERS = new Set(["expert", "experts"]);
const NORM_MARKERS = new Set(["norm", "layernorm", "layer_norm", "rms_norm", "ln_f"]);

export function parseTensorName(name, sourceFile = "") {
  const parts = name.split(".").filter(Boolean);
  const lowered = parts.map((part) => part.toLowerCase());
  const sourceComponent = componentFromPath(sourceFile);
  const component = sourceComponent || componentFromParts(lowered);
  const layerIndex = layerIndexFromParts(lowered);
  const lora = lowered.some((part) => part === "lora_a" || part === "lora_b" || part.startsWith("lora_"));
  const targetModule = lora ? targetBeforeLora(parts) : operationFromParts(parts);
  const blockType = blockTypeFromParts(lowered, component);
  const parameter = parameterFromParts(parts);
  const group = tensorGroupFromParts(lowered, blockType);

  return {
    name,
    sourceFile,
    parts,
    component,
    layerIndex,
    blockType,
    operation: targetModule,
    parameter,
    group,
    lora,
    targetModule
  };
}

export function tensorGroup(name) {
  return parseTensorName(name).group;
}

function componentFromPath(path) {
  const lowerPath = path.toLowerCase();
  if (lowerPath.startsWith("text_encoder_2/")) {
    return "t5";
  }
  if (lowerPath.startsWith("text_encoder/")) {
    return "clip";
  }
  if (lowerPath.startsWith("transformer/")) {
    return "dit";
  }
  if (lowerPath.startsWith("unet/")) {
    return "unet";
  }
  if (lowerPath.startsWith("vae/")) {
    return "vae";
  }
  return undefined;
}

function componentFromParts(parts) {
  if (parts.includes("text_encoder_2")) {
    return "t5";
  }
  if (parts.includes("text_encoder")) {
    return "clip";
  }
  if (parts.includes("unet")) {
    return "unet";
  }
  if (parts.includes("vae")) {
    return "vae";
  }
  if (parts.includes("double_blocks") || parts.includes("single_blocks") || parts.includes("transformer_blocks")) {
    return "dit";
  }
  return "other";
}

function layerIndexFromParts(parts) {
  for (let index = 0; index < parts.length - 1; index += 1) {
    if (["layers", "blocks", "h", "block", "blk"].includes(parts[index]) && /^\d+$/.test(parts[index + 1])) {
      return Number(parts[index + 1]);
    }
  }
  return undefined;
}

function blockTypeFromParts(parts, component) {
  if (parts.includes("double_blocks")) {
    return "dual-block";
  }
  if (parts.includes("single_blocks")) {
    return "single-block";
  }
  if (parts.some((part) => ATTENTION_MARKERS.has(part) || part.endsWith("_attn") || part.startsWith("attn_"))) {
    return "attention";
  }
  if (parts.some((part) => MLP_MARKERS.has(part) || part.startsWith("ffn_"))) {
    return "mlp";
  }
  if (parts.some((part) => EMBEDDING_MARKERS.has(part))) {
    return "embedding";
  }
  if (parts.some((part) => HEAD_MARKERS.has(part))) {
    return "head";
  }
  if (parts.some((part) => EXPERT_MARKERS.has(part))) {
    return "experts";
  }
  if (parts.some((part) => ROUTER_MARKERS.has(part))) {
    return "router";
  }
  if (parts.some((part) => NORM_MARKERS.has(part) || part.endsWith("_norm"))) {
    return "normalization";
  }
  return component === "dit" ? "dit" : "other";
}

function tensorGroupFromParts(parts, blockType) {
  if (parts.some((part) => part.startsWith("lora_"))) {
    return "lora";
  }
  if (blockType === "attention") {
    return "attention";
  }
  if (blockType === "mlp") {
    return "mlp";
  }
  if (blockType === "embedding") {
    return "embedding";
  }
  if (blockType === "head") {
    return "head";
  }
  if (blockType === "router" || blockType === "experts") {
    return "moe";
  }
  return "other";
}

function targetBeforeLora(parts) {
  const loraIndex = parts.findIndex((part) => part.toLowerCase().startsWith("lora_"));
  return loraIndex > 0 ? parts[loraIndex - 1] : undefined;
}

function operationFromParts(parts) {
  const meaningful = parts.filter((part) => !/^\d+$/.test(part));
  if (meaningful.length < 2) {
    return meaningful[0];
  }
  const last = meaningful.at(-1);
  return last === "weight" || last === "bias" ? meaningful.at(-2) : last;
}

function parameterFromParts(parts) {
  const last = parts.at(-1);
  return last === "weight" || last === "bias" ? last : undefined;
}
