const HEADER_LIMIT_BYTES = 8 * 1024 * 1024;
const TEXT_LIMIT_BYTES = 2 * 1024 * 1024;

export async function filesToPackage(fileList) {
  const browserFiles = [...fileList];
  if (browserFiles.length === 0) {
    throw new Error("No files selected");
  }
  const files = await Promise.all(browserFiles.map(materializeBrowserFile));
  const firstPath = files[0]?.path || "Local model";
  const rootName = firstPath.includes("/") ? firstPath.split("/")[0] : "Local model";

  return {
    source: { type: "local-directory", label: rootName },
    files
  };
}

export async function loadHuggingFacePackage(input) {
  const repo = normalizeHuggingFaceRepo(input);
  const modelResponse = await fetch(`https://huggingface.co/api/models/${repo}`);
  if (!modelResponse.ok) {
    throw new Error(`Hugging Face metadata request failed: ${modelResponse.status}`);
  }
  const model = await modelResponse.json();
  const siblings = Array.isArray(model.siblings) ? model.siblings : [];
  const metadataFiles = siblings.map((sibling) => ({
    path: sibling.rfilename,
    size: Number.isFinite(sibling.size) ? sibling.size : 0
  }));
  const enrichedFiles = await Promise.all(
    metadataFiles.map(async (file) => {
      if (!isFetchableMetadata(file.path)) {
        return file;
      }
      const text = await fetchHuggingFaceText(repo, file.path);
      return text ? { ...file, text } : file;
    })
  );

  return {
    source: { type: "hugging-face", label: repo },
    files: [
      ...enrichedFiles,
      {
        path: "README.md",
        size: model.cardData ? JSON.stringify(model.cardData).length : 0,
        text: model.cardData ? JSON.stringify(model.cardData, null, 2) : ""
      }
    ]
  };
}

async function materializeBrowserFile(file) {
  const path = file.webkitRelativePath || file.name;
  const lowerPath = path.toLowerCase();
  if (lowerPath.endsWith(".safetensors")) {
    return {
      path,
      size: file.size,
      bytes: await readSafetensorsHeader(file)
    };
  }
  if (lowerPath.endsWith(".gguf")) {
    return {
      path,
      size: file.size,
      bytes: await readBinaryPrefix(file)
    };
  }
  if (isTextMetadata(lowerPath) && file.size <= TEXT_LIMIT_BYTES) {
    return {
      path,
      size: file.size,
      text: await file.text()
    };
  }
  return { path, size: file.size };
}

async function readSafetensorsHeader(file) {
  const prefix = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  if (prefix.length < 8) {
    return prefix;
  }
  const view = new DataView(prefix.buffer, prefix.byteOffset, prefix.byteLength);
  const headerLength = Number(view.getBigUint64(0, true));
  const readableLength = Number.isSafeInteger(headerLength)
    ? Math.min(8 + headerLength, HEADER_LIMIT_BYTES)
    : 8;
  return new Uint8Array(await file.slice(0, readableLength).arrayBuffer());
}

async function readBinaryPrefix(file) {
  return new Uint8Array(await file.slice(0, HEADER_LIMIT_BYTES).arrayBuffer());
}

function normalizeHuggingFaceRepo(input) {
  const trimmed = input.trim();
  if (trimmed === "") {
    throw new Error("Hugging Face repo is required");
  }
  if (!trimmed.includes("huggingface.co")) {
    return trimmed.replace(/^\/+|\/+$/g, "");
  }
  const url = new URL(trimmed);
  return url.pathname.replace(/^\/+|\/+$/g, "").split("/").slice(0, 2).join("/");
}

function isFetchableMetadata(path) {
  const lowerPath = path.toLowerCase();
  return (
    lowerPath.endsWith("config.json") ||
    lowerPath.endsWith("model_index.json") ||
    lowerPath.endsWith(".safetensors.index.json")
  );
}

function isTextMetadata(lowerPath) {
  return (
    lowerPath.endsWith(".json") ||
    lowerPath.endsWith(".md") ||
    lowerPath.endsWith(".txt") ||
    lowerPath.endsWith(".yaml") ||
    lowerPath.endsWith(".yml")
  );
}

async function fetchHuggingFaceText(repo, path) {
  const response = await fetch(`https://huggingface.co/${repo}/raw/main/${path}`);
  return response.ok ? response.text() : "";
}
