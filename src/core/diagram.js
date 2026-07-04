export function buildArchitectureDiagram(anatomy, structure, dataflow, configEntries, weights, storage) {
  if (anatomy.family === "diffusion") {
    const coreId = anatomy.hasDit ? "dit" : "unet";
    const coreNode = anatomy.hasDit
      ? diagramNode("dit", "Diffusion Transformer", "dit", "module", "core", {
          layers: numberFromConfigs(configEntries, ["num_layers"]) || "unknown"
        }, { x: 640, y: 276 })
      : diagramNode("unet", "U-Net denoiser", "unet", "module", "core", {}, { x: 640, y: 276 });
    return {
      title: "Diffusion generation path",
      lanes: [
        { id: "prepare", label: "Prepare inputs", tone: "violet" },
        { id: "denoise", label: "Denoise loop", tone: "rose" },
        { id: "core", label: "Real inference module", tone: "amber" },
        { id: "decode", label: "Decode output", tone: "green" }
      ],
      nodes: [
        diagramNode("prompt", "Prompt", "input", "input", "prepare", {}, { x: 120, y: 92 }),
        diagramNode("clip", "CLIP encoder", "encoder", "module", "prepare", {}, { x: 330, y: 92 }),
        diagramNode("t5", "T5 encoder", "encoder", "module", "prepare", {}, { x: 515, y: 92 }),
        diagramNode("latent", "Noise latent", "latent", "input", "prepare", {}, { x: 760, y: 92 }),
        diagramNode("timesteps", "Timesteps", "schedule", "input", "prepare", {}, { x: 960, y: 92 }),
        diagramNode("scheduler", "Scheduler", "scheduler", "module", "denoise", {
          role: "select timestep, call denoiser, update latent"
        }, { x: 430, y: 204 }),
        coreNode,
        diagramNode("latent-update", "Latent update", "scheduler", "state", "denoise", {
          loop: "repeats until final denoised latent"
        }, { x: 820, y: 204 }),
        anatomy.hasVae
          ? diagramNode("vae", "VAE decoder", "vae", "module", "decode", {}, { x: 660, y: 430 })
          : diagramNode("decoder", "Decoder", "decoder", "module", "decode", {}, { x: 660, y: 430 }),
        diagramNode("image", "Image", "output", "output", "decode", {}, { x: 910, y: 430 })
      ],
      edges: [
        { from: "prompt", to: "clip", label: "tokens" },
        { from: "prompt", to: "t5", label: "tokens" },
        { from: "clip", to: coreId, label: "pooled embedding" },
        { from: "t5", to: coreId, label: "sequence embedding" },
        { from: "latent", to: "scheduler", label: "initial latent" },
        { from: "timesteps", to: "scheduler", label: "schedule" },
        { from: "scheduler", to: coreId, label: "latent + timestep" },
        { from: coreId, to: "latent-update", label: "noise / velocity prediction" },
        { from: "latent-update", to: "scheduler", label: "updated latent" },
        { from: "latent-update", to: anatomy.hasVae ? "vae" : "decoder", label: "final latent" },
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

function diagramNode(id, label, kind, role, lane, metrics = {}, position = undefined) {
  return { id, label, kind, role, lane, metrics, position };
}

function numberFromConfigs(configEntries, keys) {
  return configEntries
    .flatMap((entry) => keys.map((key) => entry.json[key]))
    .find((value) => Number.isFinite(value));
}
