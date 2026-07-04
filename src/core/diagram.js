export function buildArchitectureDiagram(anatomy, structure, dataflow, configEntries, weights, storage) {
  if (anatomy.family === "diffusion") {
    return {
      title: "Diffusion generation path",
      lanes: [
        { id: "prepare", label: "Prepare", tone: "violet" },
        { id: "denoise", label: "Denoise", tone: "rose" },
        { id: "core", label: "Core model", tone: "amber" },
        { id: "decode", label: "Decode", tone: "green" }
      ],
      nodes: [
        diagramNode("prompt", "Prompt", "input", "input", "prepare"),
        diagramNode("noise", "Noise / latent", "latent", "input", "prepare"),
        diagramNode("clip", "CLIP encoder", "encoder", "module", "prepare"),
        diagramNode("t5", "T5 encoder", "encoder", "module", "prepare"),
        diagramNode("timesteps", "Timesteps", "schedule", "input", "prepare"),
        anatomy.hasDit
          ? diagramNode("dit", "Diffusion Transformer", "dit", "module", "core", {
              layers: numberFromConfigs(configEntries, ["num_layers"]) || "unknown"
            })
          : diagramNode("unet", "U-Net denoiser", "unet", "module", "core"),
        diagramNode("scheduler", "Scheduler loop", "scheduler", "module", "denoise"),
        anatomy.hasVae
          ? diagramNode("vae", "VAE decoder", "vae", "module", "decode")
          : diagramNode("decoder", "Decoder", "decoder", "module", "decode"),
        diagramNode("image", "Image", "output", "output", "decode")
      ],
      edges: [
        { from: "prompt", to: "clip", label: "tokens" },
        { from: "prompt", to: "t5", label: "tokens" },
        { from: "clip", to: anatomy.hasDit ? "dit" : "unet", label: "conditioning" },
        { from: "t5", to: anatomy.hasDit ? "dit" : "unet", label: "text embeddings" },
        { from: "noise", to: "scheduler", label: "latent" },
        { from: "timesteps", to: "scheduler", label: "t" },
        { from: "scheduler", to: anatomy.hasDit ? "dit" : "unet", label: "denoise step" },
        { from: anatomy.hasDit ? "dit" : "unet", to: anatomy.hasVae ? "vae" : "decoder", label: "denoised latent" },
        { from: anatomy.hasVae ? "vae" : "decoder", to: "image", label: "pixels" }
      ]
    };
  }

  if (anatomy.family === "adapter") {
    return {
      title: "Adapter merge path",
      lanes: [
        { id: "input", label: "Input", tone: "violet" },
        { id: "adapter", label: "Adapter", tone: "amber" },
        { id: "base", label: "Base model", tone: "blue" },
        { id: "output", label: "Output", tone: "green" }
      ],
      nodes: [
        diagramNode("adapter-input", "Hidden states", "input", "input", "input"),
        diagramNode("lora", "LoRA delta", "lora", "module", "adapter", storage.adapter || {}),
        diagramNode("base-model", "Base model module", "base-model", "module", "base"),
        diagramNode("merged-output", "Adapted output", "output", "output", "output")
      ],
      edges: dataflow.edges
    };
  }

  if (anatomy.family === "transformer") {
    return {
      title: "Transformer inference path",
      lanes: [
        { id: "input", label: "Input", tone: "violet" },
        { id: "blocks", label: "Decoder stack", tone: "blue" },
        { id: "cache", label: "Cache", tone: "amber" },
        { id: "output", label: "Output", tone: "green" }
      ],
      nodes: [
        diagramNode("tokens", "Tokens", "input", "input", "input"),
        diagramNode("embeddings", "Embedding table", "embedding", "module", "input"),
        diagramNode("attention", "Self attention", "attention", "module", "blocks"),
        diagramNode("residual", "Residual add", "residual", "state", "blocks"),
        diagramNode("mlp", "MLP", "mlp", "module", "blocks"),
        diagramNode("kv-cache", "KV cache", "cache", "state", "cache"),
        diagramNode("lm-head", "LM head", "head", "output", "output")
      ],
      edges: dataflow.edges
    };
  }

  return {
    title: "Metadata scan",
    lanes: [{ id: "scan", label: "Scan", tone: "blue" }],
    nodes: structure.nodes.map((nodeItem) =>
      diagramNode(nodeItem.id, nodeItem.label, nodeItem.kind, "module", "scan", nodeItem.metrics)
    ),
    edges: dataflow.edges
  };
}

function diagramNode(id, label, kind, role, lane, metrics = {}) {
  return { id, label, kind, role, lane, metrics };
}

function numberFromConfigs(configEntries, keys) {
  return configEntries
    .flatMap((entry) => keys.map((key) => entry.json[key]))
    .find((value) => Number.isFinite(value));
}
