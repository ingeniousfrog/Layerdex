function safetensorsBytes(tensors) {
  const header = JSON.stringify(tensors);
  const headerBytes = new TextEncoder().encode(header);
  const bytes = new Uint8Array(8 + headerBytes.length);
  const view = new DataView(bytes.buffer);
  view.setBigUint64(0, BigInt(headerBytes.length), true);
  bytes.set(headerBytes, 8);
  return bytes;
}

export function createDemoPackage() {
  return {
    source: { type: "local-directory", label: "Layerdex Demo Base" },
    files: [
      {
        path: "config.json",
        size: 256,
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
        size: 33556480,
        bytes: safetensorsBytes({
          "__metadata__": { format: "pt" },
          "model.embed_tokens.weight": {
            dtype: "BF16",
            shape: [32000, 4096],
            data_offsets: [0, 262144000]
          },
          "model.layers.0.self_attn.q_proj.weight": {
            dtype: "BF16",
            shape: [4096, 4096],
            data_offsets: [262144000, 295698432]
          },
          "model.layers.0.mlp.down_proj.weight": {
            dtype: "BF16",
            shape: [4096, 11008],
            data_offsets: [295698432, 385875968]
          }
        })
      },
      {
        path: "README.md",
        size: 1800,
        text: "# Demo model\n\nMetadata-only sample bundled with Layerdex."
      }
    ]
  };
}

export function createDemoTunedPackage() {
  return {
    source: { type: "local-directory", label: "Layerdex Demo LoRA" },
    files: [
      {
        path: "adapter_config.json",
        size: 220,
        text: JSON.stringify({
          base_model_name_or_path: "Layerdex Demo Base",
          peft_type: "LORA",
          r: 16,
          target_modules: ["q_proj", "v_proj"]
        })
      },
      {
        path: "adapter_model.safetensors",
        size: 1048576,
        bytes: safetensorsBytes({
          "base_model.model.model.layers.0.self_attn.q_proj.lora_A.weight": {
            dtype: "F16",
            shape: [16, 4096],
            data_offsets: [0, 131072]
          },
          "base_model.model.model.layers.0.self_attn.q_proj.lora_B.weight": {
            dtype: "F16",
            shape: [4096, 16],
            data_offsets: [131072, 262144]
          }
        })
      }
    ]
  };
}
