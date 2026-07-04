export function defaultNodeDetails(item, anatomy) {
  const detailsByKind = {
    attention: [
      "Builds query, key, and value projections from hidden states.",
      "Reads or writes KV cache during autoregressive decoding.",
      "Returns attended states into the residual path."
    ],
    "base-model": [
      "Receives adapter deltas at configured target modules.",
      "Keeps the original base weights separate unless merged."
    ],
    "block-group": [
      "Repeats attention, normalization, residual, and MLP work.",
      "Layer count comes from config when available."
    ],
    cache: [
      "Stores past keys and values for token-by-token inference.",
      "Memory grows with batch size, context length, and layer count."
    ],
    clip: [
      "Encodes prompt tokens into pooled text conditioning.",
      "Often provides global style and prompt-level guidance.",
      "Feeds the denoiser through the conditioning path."
    ],
    conditioning: [
      "Prompt text is tokenized for CLIP and/or T5 encoders.",
      "Text embeddings condition every denoising step.",
      "Control or image conditions can join this lane in extended pipelines."
    ],
    dit: [
      "Main inference module for FLUX/DiT-style diffusion pipelines.",
      "FLUX runs dual-stream blocks before merging into single-stream blocks.",
      "Consumes latent state, timestep/sigma, and text embeddings.",
      "Predicts noise or velocity for the scheduler update."
    ],
    "dual-block": [
      "Processes image latent tokens and text tokens as separate streams.",
      "Uses joint attention to let both streams exchange conditioning.",
      "Feeds the merged representation into the single-stream stage."
    ],
    embedding: [
      "Looks up token ids in the embedding table.",
      "Produces the first hidden-state sequence."
    ],
    files: [
      "Scans local or remote metadata without loading full weight payloads.",
      "File sizes drive disk footprint when available."
    ],
    head: [
      "Projects hidden states to logits or output channels.",
      "Sampling or decoding happens after this projection."
    ],
    input: [
      "Represents user-provided or generated inputs to the pipeline.",
      "Values are shown as semantic flow nodes rather than loaded tensors."
    ],
    latent: [
      "Carries the compressed image state through the denoising loop.",
      "Starts as noise and is updated step-by-step by the scheduler.",
      "The final latent is decoded into pixels by the VAE."
    ],
    lora: [
      "Stores low-rank A/B projection deltas.",
      "Applies only to configured target modules.",
      "Can be merged into or composed with a base model."
    ],
    mlp: [
      "Applies feed-forward projections after attention.",
      "Returns transformed states into the residual stream."
    ],
    model: [
      `Detected as ${anatomy.architecture}.`,
      "Verified facts come from config, index, and bounded header reads.",
      "Inferred facts come from naming and architecture rules."
    ],
    scheduler: [
      "Chooses the timestep schedule and current sigma/noise level.",
      "Calls the denoiser at each step with latent state and conditioning.",
      "Updates the latent after each prediction until final VAE decode."
    ],
    "single-block": [
      "Runs after FLUX merges image and text streams into one sequence.",
      "Refines the joint representation before output projection.",
      "Its depth comes from num_single_layers when available."
    ],
    t5: [
      "Encodes prompt tokens into sequence-level text embeddings.",
      "Provides detailed token context for FLUX and DiT-style denoisers.",
      "Feeds conditioning into each denoising step."
    ],
    targets: [
      "Names the base modules touched by an adapter.",
      "Coverage is verified from config or inferred from tensor names."
    ],
    unet: [
      "Receives noisy latents, timestep embedding, and conditioning.",
      "Predicts denoising residuals inside the scheduler loop.",
      "Common in Stable Diffusion style pipelines."
    ],
    vae: [
      "Maps final latent state back into image space.",
      "Runs decoder blocks and upsampling layers.",
      "Produces RGB pixels after denoising is complete."
    ],
    "vae-decoder": [
      "Converts latent channels into image-space feature maps.",
      "Applies decoder blocks before final upsampling.",
      "Produces the pixel path used by the output image."
    ],
    weights: [
      "Tensor metadata comes from safetensors headers or index files.",
      "Full tensor values are intentionally not loaded."
    ]
  };
  return detailsByKind[item.kind] || [
    "Represents a semantic module inferred from available metadata.",
    "Load more config or tensor metadata for deeper structure."
  ];
}
