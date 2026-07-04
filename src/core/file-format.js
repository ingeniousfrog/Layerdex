export function formatForPath(path) {
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
