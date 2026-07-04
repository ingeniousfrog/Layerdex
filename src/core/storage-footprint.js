import { toFiniteNumber } from "./numbers.js";

export function summarizeStorageFootprint(files, source) {
  const alternativePaths = alternativeRootCheckpointPaths(files);
  const activeFiles = files.filter((file) => !alternativePaths.includes(file.path));
  const alternativeBytes = files
    .filter((file) => alternativePaths.includes(file.path))
    .reduce((total, file) => total + file.size, 0);
  const fileTotalBytes = files.reduce((total, file) => total + file.size, 0);
  const activeFileTotalBytes = activeFiles.reduce((total, file) => total + file.size, 0);
  const sourceTotalBytes = toFiniteNumber(source.metadata.usedStorage) || 0;
  const missingSizeCount = files.filter((file) => file.size === 0).length;
  const totalBytes = activeFileTotalBytes > 0
    ? activeFileTotalBytes
    : fileTotalBytes > 0
      ? fileTotalBytes
      : sourceTotalBytes;
  const totalBasis = alternativeBytes > 0
    ? "active diffusers component files"
    : fileTotalBytes > 0
      ? "current file list"
      : "repository usedStorage fallback";

  return {
    activeFiles,
    activeFileTotalBytes,
    alternativeBytes,
    alternativePaths,
    fileTotalBytes,
    missingSizeCount,
    repositoryStorageBytes: sourceTotalBytes,
    totalBasis,
    totalBytes
  };
}

function alternativeRootCheckpointPaths(files) {
  const hasDiffusersComponents = files.some((file) => {
    const lowerPath = file.path.toLowerCase();
    return (
      lowerPath.startsWith("transformer/") ||
      lowerPath.startsWith("unet/") ||
      lowerPath.startsWith("vae/") ||
      lowerPath.startsWith("text_encoder/") ||
      lowerPath.startsWith("text_encoder_2/")
    );
  });
  if (!hasDiffusersComponents) {
    return [];
  }
  return files
    .filter((file) => {
      const lowerPath = file.path.toLowerCase();
      return !lowerPath.includes("/") && lowerPath.endsWith(".safetensors");
    })
    .map((file) => file.path);
}
