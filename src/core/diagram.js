export function buildArchitectureDiagram(anatomy, structure, dataflow, configEntries, weights, storage) {
  if (anatomy.family === "diffusion" && anatomy.isFlux) {
    return buildFluxDiagram(anatomy, configEntries);
  }

  if (anatomy.family === "diffusion") {
    return buildDiffusionDiagram(anatomy, configEntries);
  }

  if (anatomy.family === "adapter") {
    return buildAdapterDiagram(dataflow, storage);
  }

  if (anatomy.family === "transformer") {
    return buildTransformerDiagram(dataflow);
  }

  return buildMetadataDiagram(structure, dataflow);
}

export function buildModuleAnatomyDiagram(item, anatomy) {
  if (item.kind === "clip" || item.kind === "t5") {
    const outputLabel = item.kind === "clip" ? "Pooled embedding" : "Sequence embedding";
    return {
      title: `${item.label} anatomy`,
      lanes: [
        { id: "tokens", label: "Tokens", tone: "violet" },
        { id: "encoder", label: "Encoder", tone: "blue" },
        { id: "output", label: "Conditioning output", tone: "green" }
      ],
      nodes: [
        diagramNode(`${item.id}-tokens`, "Token ids", "tokens", "input", "tokens"),
        diagramNode(`${item.id}-embed`, "Text embedding", "embedding", "module", "encoder"),
        diagramNode(`${item.id}-blocks`, "Encoder blocks", "block-group", "module", "encoder", item.metrics || {}),
        diagramNode(`${item.id}-output`, outputLabel, "conditioning", "output", "output")
      ],
      edges: [
        { from: `${item.id}-tokens`, to: `${item.id}-embed`, label: "lookup" },
        { from: `${item.id}-embed`, to: `${item.id}-blocks`, label: "hidden states" },
        { from: `${item.id}-blocks`, to: `${item.id}-output`, label: item.kind === "clip" ? "pooled states" : "sequence states" }
      ]
    };
  }

  if (item.kind === "dit") {
    if (anatomy.isFlux) {
      const dualBlocks = item.metrics?.dualBlocks;
      const singleBlocks = item.metrics?.singleBlocks;
      return {
        title: "Flux transformer anatomy",
        lanes: [
          { id: "inputs", label: "Inputs", tone: "violet" },
          { id: "dual", label: "Dual-stream blocks", tone: "blue" },
          { id: "single", label: "Single-stream blocks", tone: "amber" },
          { id: "output", label: "Prediction", tone: "green" }
        ],
        nodes: [
          diagramNode("dit-latents", "Image latent tokens", "latent", "input", "inputs"),
          diagramNode("dit-text", "Text tokens", "conditioning", "input", "inputs"),
          diagramNode("dit-timestep", "Timestep embedding", "schedule", "input", "inputs"),
          diagramNode("dit-dual-blocks", blockLabel("Dual blocks", dualBlocks), "dual-block", "module", "dual", {
            blocks: dualBlocks || "unknown"
          }),
          diagramNode("dit-merge", "Merge streams", "residual", "state", "dual"),
          diagramNode("dit-single-blocks", blockLabel("Single blocks", singleBlocks), "single-block", "module", "single", {
            blocks: singleBlocks || "unknown"
          }),
          diagramNode("dit-projection", "Output projection", "head", "output", "output")
        ],
        edges: [
          { from: "dit-latents", to: "dit-dual-blocks", label: "image stream" },
          { from: "dit-text", to: "dit-dual-blocks", label: "text stream" },
          { from: "dit-timestep", to: "dit-dual-blocks", label: "modulation" },
          { from: "dit-dual-blocks", to: "dit-merge", label: "joint attention" },
          { from: "dit-merge", to: "dit-single-blocks", label: "merged sequence" },
          { from: "dit-single-blocks", to: "dit-projection", label: "final states" }
        ]
      };
    }

    return {
      title: "Diffusion transformer anatomy",
      lanes: [
        { id: "inputs", label: "Inputs", tone: "violet" },
        { id: "blocks", label: "Joint transformer blocks", tone: "amber" },
        { id: "output", label: "Prediction", tone: "green" }
      ],
      nodes: [
        diagramNode("dit-latents", "Latent tokens", "latent", "input", "inputs"),
        diagramNode("dit-conditioning", "Text conditioning", "conditioning", "input", "inputs"),
        diagramNode("dit-timestep", "Timestep embedding", "schedule", "input", "inputs"),
        diagramNode("dit-attention", "Joint attention", "attention", "module", "blocks"),
        diagramNode("dit-mlp", "MLP", "mlp", "module", "blocks"),
        diagramNode("dit-residual", "Residual stream", "residual", "state", "blocks"),
        diagramNode("dit-projection", "Output projection", "head", "output", "output")
      ],
      edges: [
        { from: "dit-latents", to: "dit-attention", label: "latent sequence" },
        { from: "dit-conditioning", to: "dit-attention", label: "text context" },
        { from: "dit-timestep", to: "dit-attention", label: "time modulation" },
        { from: "dit-attention", to: "dit-residual", label: "attended states" },
        { from: "dit-residual", to: "dit-mlp", label: "normalized states" },
        { from: "dit-mlp", to: "dit-projection", label: "noise / velocity" }
      ]
    };
  }

  if (item.kind === "scheduler") {
    return {
      title: "Scheduler loop anatomy",
      lanes: [
        { id: "schedule", label: "Schedule", tone: "violet" },
        { id: "loop", label: "Denoise loop", tone: "rose" },
        { id: "state", label: "Latent state", tone: "green" }
      ],
      nodes: [
        diagramNode("sigma", "Sigma / timestep", "schedule", "input", "schedule"),
        diagramNode("current-latent", "Current latent", "latent", "state", "state"),
        diagramNode("denoiser-call", anatomy.hasDit ? "Call DiT" : "Call U-Net", anatomy.hasDit ? "dit" : "unet", "module", "loop"),
        diagramNode("update-rule", "Update rule", "scheduler", "module", "loop"),
        diagramNode("next-latent", "Next latent", "latent", "state", "state")
      ],
      edges: [
        { from: "sigma", to: "denoiser-call", label: "step condition" },
        { from: "current-latent", to: "denoiser-call", label: "noisy latent" },
        { from: "denoiser-call", to: "update-rule", label: "prediction" },
        { from: "update-rule", to: "next-latent", label: "integrate" },
        { from: "next-latent", to: "current-latent", label: "repeat" }
      ]
    };
  }

  if (item.kind === "vae") {
    return {
      title: "VAE decoder anatomy",
      lanes: [
        { id: "latent", label: "Latent", tone: "violet" },
        { id: "decode", label: "Decode", tone: "amber" },
        { id: "pixels", label: "Pixels", tone: "green" }
      ],
      nodes: [
        diagramNode("vae-latent", "Final latent", "latent", "input", "latent"),
        diagramNode("vae-decoder", "Decoder blocks", "vae-decoder", "module", "decode", item.metrics || {}),
        diagramNode("vae-upsample", "Upsample", "upsample", "module", "decode"),
        diagramNode("vae-image", "RGB image", "output", "output", "pixels")
      ],
      edges: [
        { from: "vae-latent", to: "vae-decoder", label: "decode latent" },
        { from: "vae-decoder", to: "vae-upsample", label: "feature maps" },
        { from: "vae-upsample", to: "vae-image", label: "pixels" }
      ]
    };
  }

  if (item.kind === "conditioning") {
    return {
      title: "Conditioning anatomy",
      lanes: [
        { id: "text", label: "Text encoders", tone: "violet" },
        { id: "merge", label: "Conditioning", tone: "amber" },
        { id: "core", label: "Denoiser input", tone: "green" }
      ],
      nodes: [
        diagramNode("conditioning-clip", "CLIP pooled", "clip", "module", "text"),
        diagramNode("conditioning-t5", "T5 sequence", "t5", "module", "text"),
        diagramNode("conditioning-merge", "Condition pack", "conditioning", "state", "merge"),
        diagramNode("conditioning-core", anatomy.hasDit ? "Flux transformer" : "Denoiser", anatomy.hasDit ? "dit" : "unet", "module", "core")
      ],
      edges: [
        { from: "conditioning-clip", to: "conditioning-merge", label: "pooled embedding" },
        { from: "conditioning-t5", to: "conditioning-merge", label: "sequence embedding" },
        { from: "conditioning-merge", to: "conditioning-core", label: "guidance context" }
      ]
    };
  }

  return undefined;
}

function buildFluxDiagram(anatomy, configEntries) {
  const blockMetrics = fluxBlockMetrics(configEntries);
  return {
    title: "FLUX text-to-image dataflow",
    variant: "flux",
    width: 1900,
    height: 980,
    lanes: [],
    regions: [
      diagramRegion("prepare-region", "Prepare", "violet", 70, 30, 760, 145),
      diagramRegion("denoise-region", "Denoise", "rose", 35, 205, 1795, 700),
      diagramRegion("flux-region", "Flux", "amber", 95, 315, 1515, 500),
      diagramRegion("double-region", blockLabel("DoubleStreamBlock", blockMetrics.dualBlocks), "yellow", 145, 435, 690, 320),
      diagramRegion("single-region", blockLabel("SingleStreamBlock", blockMetrics.singleBlocks), "green", 980, 405, 455, 300, { dashed: true })
    ],
    nodes: [
      diagramNode("prompt", "Prompt", "input", "input", "prepare", {}, { x: 145, y: 92 }),
      diagramNode("clip", "CLIP encoder", "clip", "module", "prepare", {}, { x: 350, y: 92 }),
      diagramNode("t5", "T5 encoder", "t5", "module", "prepare", {}, { x: 555, y: 92 }),
      diagramNode("txt-ids", "txt_ids", "position", "input", "prepare", {}, { x: 760, y: 92 }),
      diagramNode("img-start", "init_image", "image", "input", "denoise", {}, { x: 170, y: 260 }),
      diagramNode("img-ids", "img_ids", "position", "input", "denoise", {}, { x: 380, y: 260 }),
      diagramNode("timesteps", "Timesteps", "schedule", "input", "denoise", {}, { x: 1370, y: 260 }),
      diagramNode("guidance", "guidance", "conditioning", "input", "denoise", {}, { x: 1570, y: 260 }),
      diagramNode("txt", "txt", "conditioning", "state", "flux", {}, { x: 230, y: 365 }),
      diagramNode("vec", "vec", "conditioning", "state", "flux", {}, { x: 455, y: 365 }),
      diagramNode("img", "img", "latent", "state", "flux", {}, { x: 170, y: 345 }),
      diagramNode("pe", "PE", "position", "state", "flux", {}, { x: 700, y: 365 }),
      diagramNode("timestep-embed", "timestep", "schedule", "state", "denoise", {}, { x: 1370, y: 345 }),
      diagramNode("vector-in", "vector", "conditioning", "state", "denoise", {}, { x: 1570, y: 345 }),
      diagramNode("scheduler", "Scheduler", "scheduler", "module", "denoise", {
        role: "select sigma, call transformer, update latent"
      }, { x: 1740, y: 345 }),
      diagramNode("dit", "Flux Transformer", "dit", "module", "core", {
        layers: blockMetrics.dualBlocks || "unknown",
        dualBlocks: blockMetrics.dualBlocks || "unknown",
        singleBlocks: blockMetrics.singleBlocks || "unknown"
      }, { x: 855, y: 360 }),
      diagramNode("img-mod", "img mod", "modulation", "module", "core", {}, { x: 260, y: 515 }),
      diagramNode("txt-mod", "txt mod", "modulation", "module", "core", {}, { x: 260, y: 655 }),
      diagramNode("img-norm", "img norm1", "normalization", "module", "core", {}, { x: 465, y: 515 }),
      diagramNode("txt-norm", "txt norm1", "normalization", "module", "core", {}, { x: 465, y: 655 }),
      diagramNode("double-attn", "attention", "attention", "module", "core", {}, { x: 675, y: 515 }),
      diagramNode("double-mlp", "MLP", "mlp", "module", "core", {}, { x: 675, y: 655 }),
      diagramNode("img-add", "img add", "residual", "state", "core", {}, { x: 805, y: 535 }),
      diagramNode("txt-add", "txt add", "residual", "state", "core", {}, { x: 805, y: 675 }),
      diagramNode("dual-blocks", blockLabel("Dual blocks", blockMetrics.dualBlocks), "dual-block", "module", "core", {
        blocks: blockMetrics.dualBlocks || "unknown"
      }, { x: 490, y: 455 }),
      diagramNode("merge-streams", "concat img + txt", "residual", "state", "core", {}, { x: 920, y: 605 }),
      diagramNode("single-blocks", blockLabel("Single blocks", blockMetrics.singleBlocks), "single-block", "module", "core", {
        blocks: blockMetrics.singleBlocks || "unknown"
      }, { x: 1095, y: 460 }),
      diagramNode("single-linear", "linear1", "projection", "module", "core", {}, { x: 1095, y: 570 }),
      diagramNode("single-attn", "attention", "attention", "module", "core", {}, { x: 1290, y: 510 }),
      diagramNode("single-mlp", "MLP", "mlp", "module", "core", {}, { x: 1290, y: 630 }),
      diagramNode("single-add", "residual add", "residual", "state", "core", {}, { x: 1430, y: 570 }),
      diagramNode("dit-output", "Output projection", "head", "module", "core", {}, { x: 1520, y: 745 }),
      diagramNode("latent-update", "Latent update", "latent", "state", "denoise", {
        loop: "repeats until final denoised latent"
      }, { x: 1740, y: 610 }),
      anatomy.hasVae
        ? diagramNode("vae", "VAE decoder", "vae", "module", "decode", {}, { x: 1450, y: 900 })
        : diagramNode("decoder", "Decoder", "decoder", "module", "decode", {}, { x: 1450, y: 900 }),
      diagramNode("image", "Image", "output", "output", "decode", {}, { x: 1710, y: 900 })
    ],
    edges: [
      { from: "prompt", to: "clip", label: "tokens" },
      { from: "prompt", to: "t5", label: "tokens" },
      { from: "clip", to: "vec" },
      { from: "t5", to: "txt" },
      { from: "img-start", to: "img" },
      { from: "timesteps", to: "timestep-embed" },
      { from: "guidance", to: "vector-in" },
      { from: "txt-ids", to: "pe" },
      { from: "img-ids", to: "pe" },
      { from: "txt", to: "dit" },
      { from: "vec", to: "dit" },
      { from: "img", to: "dit" },
      { from: "pe", to: "dit" },
      { from: "timestep-embed", to: "scheduler" },
      { from: "vector-in", to: "scheduler" },
      { from: "scheduler", to: "dit", label: "denoise call" },
      { from: "dit", to: "dual-blocks" },
      { from: "dual-blocks", to: "img-mod" },
      { from: "dual-blocks", to: "txt-mod" },
      { from: "img-mod", to: "img-norm" },
      { from: "txt-mod", to: "txt-norm" },
      { from: "img-norm", to: "double-attn" },
      { from: "txt-norm", to: "double-attn" },
      { from: "double-attn", to: "img-add" },
      { from: "double-attn", to: "txt-add" },
      { from: "img-norm", to: "double-mlp" },
      { from: "txt-norm", to: "double-mlp" },
      { from: "double-mlp", to: "img-add" },
      { from: "double-mlp", to: "txt-add" },
      { from: "img-add", to: "merge-streams" },
      { from: "txt-add", to: "merge-streams" },
      { from: "merge-streams", to: "single-blocks", label: "merged sequence" },
      { from: "single-blocks", to: "single-linear" },
      { from: "single-linear", to: "single-attn" },
      { from: "single-linear", to: "single-mlp" },
      { from: "single-attn", to: "single-add" },
      { from: "single-mlp", to: "single-add" },
      { from: "single-add", to: "dit-output" },
      { from: "dit-output", to: "latent-update", label: "noise / velocity prediction" },
      { from: "latent-update", to: "scheduler", label: "updated latent" },
      { from: "latent-update", to: anatomy.hasVae ? "vae" : "decoder", label: "final latent" },
      { from: anatomy.hasVae ? "vae" : "decoder", to: "image", label: "pixels" }
    ]
  };
}

function buildDiffusionDiagram(anatomy, configEntries) {
  const coreId = diffusionCoreId(anatomy);
  const coreNode = anatomy.hasDit
    ? diagramNode("dit", "Diffusion Transformer", "dit", "module", "core", {
        layers: numberFromConfigs(configEntries, ["num_layers"]) || "unknown"
      }, { x: 640, y: 276 })
    : anatomy.hasUnet
      ? diagramNode("unet", "U-Net denoiser", "unet", "module", "core", {}, { x: 640, y: 276 })
      : diagramNode("decoder", "Decoder", "decoder", "module", "core", {}, { x: 640, y: 276 });

  return {
    title: "Diffusion generation path",
    variant: "diffusion",
    lanes: [
      { id: "prepare", label: "Prepare inputs", tone: "violet" },
      { id: "denoise", label: "Denoise loop", tone: "rose" },
      { id: "core", label: "Real inference module", tone: "amber" },
      { id: "decode", label: "Decode output", tone: "green" }
    ],
    nodes: [
      diagramNode("prompt", "Prompt", "input", "input", "prepare", {}, { x: 120, y: 92 }),
      anatomy.hasClip ? diagramNode("clip", "CLIP encoder", "clip", "module", "prepare", {}, { x: 330, y: 92 }) : undefined,
      anatomy.hasT5 ? diagramNode("t5", "T5 encoder", "t5", "module", "prepare", {}, { x: 515, y: 92 }) : undefined,
      diagramNode("conditioning", "Conditioning", "conditioning", "state", "prepare", {}, { x: 515, y: 204 }),
      diagramNode("latent", "Noise latent", "latent", "input", "prepare", {}, { x: 760, y: 92 }),
      diagramNode("timesteps", "Timesteps", "schedule", "input", "prepare", {}, { x: 960, y: 92 }),
      diagramNode("scheduler", "Scheduler", "scheduler", "module", "denoise", {
        role: "select timestep, call denoiser, update latent"
      }, { x: 430, y: 204 }),
      coreNode,
      diagramNode("latent-update", "Latent update", "latent", "state", "denoise", {
        loop: "repeats until final denoised latent"
      }, { x: 820, y: 204 }),
      anatomy.hasVae
        ? diagramNode("vae", "VAE decoder", "vae", "module", "decode", {}, { x: 660, y: 430 })
        : diagramNode("decoder", "Decoder", "decoder", "module", "decode", {}, { x: 660, y: 430 }),
      diagramNode("image", "Image", "output", "output", "decode", {}, { x: 910, y: 430 })
    ].filter(Boolean),
    edges: [
      anatomy.hasClip ? { from: "prompt", to: "clip", label: "tokens" } : undefined,
      anatomy.hasT5 ? { from: "prompt", to: "t5", label: "tokens" } : undefined,
      anatomy.hasClip ? { from: "clip", to: "conditioning", label: "pooled embedding" } : undefined,
      anatomy.hasT5 ? { from: "t5", to: "conditioning", label: "sequence embedding" } : undefined,
      { from: "conditioning", to: coreId, label: "conditioning" },
      { from: "latent", to: "scheduler", label: "initial latent" },
      { from: "timesteps", to: "scheduler", label: "schedule" },
      { from: "scheduler", to: coreId, label: "latent + timestep" },
      { from: coreId, to: "latent-update", label: "noise / velocity prediction" },
      { from: "latent-update", to: "scheduler", label: "updated latent" },
      { from: "latent-update", to: anatomy.hasVae ? "vae" : "decoder", label: "final latent" },
      { from: anatomy.hasVae ? "vae" : "decoder", to: "image", label: "pixels" }
    ].filter(Boolean)
  };
}

function buildAdapterDiagram(dataflow, storage) {
  return {
    title: "Adapter merge path",
    variant: "adapter",
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

function buildTransformerDiagram(dataflow) {
  return {
    title: "Transformer inference path",
    variant: "transformer",
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

function buildMetadataDiagram(structure, dataflow) {
  const structureNodeIds = new Set(structure.nodes.map((nodeItem) => nodeItem.id));
  const missingDataflowNodes = dataflow.nodes
    .filter((id) => !structureNodeIds.has(id))
    .map((id) => diagramNode(id, titleizeId(id), "metadata", id === "report" ? "output" : "state", "scan"));

  return {
    title: "Metadata scan",
    variant: "metadata",
    lanes: [{ id: "scan", label: "Scan", tone: "blue" }],
    nodes: [
      ...structure.nodes.map((nodeItem) =>
        diagramNode(nodeItem.id, nodeItem.label, nodeItem.kind, "module", "scan", nodeItem.metrics)
      ),
      ...missingDataflowNodes
    ],
    edges: dataflow.edges
  };
}

function diffusionCoreId(anatomy) {
  if (anatomy.hasDit) {
    return "dit";
  }
  if (anatomy.hasUnet) {
    return "unet";
  }
  return "decoder";
}

function diagramNode(id, label, kind, role, lane, metrics = {}, position = undefined) {
  return { id, label, kind, role, lane, metrics, position };
}

function diagramRegion(id, label, tone, x, y, width, height, options = {}) {
  return { id, label, tone, x, y, width, height, ...options };
}

function titleizeId(id) {
  return id
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function numberFromConfigs(configEntries, keys) {
  return configEntries
    .flatMap((entry) => keys.map((key) => entry.json[key]))
    .find((value) => Number.isFinite(value));
}

function fluxBlockMetrics(configEntries) {
  const transformerConfig = configEntries.find((entry) => {
    const path = entry.path.toLowerCase();
    const json = JSON.stringify(entry.json).toLowerCase();
    return path.includes("transformer/config") || json.includes("fluxtransformer");
  });

  return {
    dualBlocks: firstFinite([transformerConfig?.json.num_layers, transformerConfig?.json.num_double_layers]),
    singleBlocks: firstFinite([transformerConfig?.json.num_single_layers])
  };
}

function blockLabel(label, count) {
  return Number.isFinite(count) ? `${label} x${count}` : label;
}

function firstFinite(values) {
  return values.find((value) => Number.isFinite(value));
}
