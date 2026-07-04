import { toFiniteNumber } from "./numbers.js";

export function huggingFaceParameterSummary(source = { metadata: {} }) {
  const parameters = source.metadata?.safetensors?.parameters || {};
  const normalizedParameters = Object.entries(parameters).reduce(
    (accumulator, [dtype, value]) => ({
      ...accumulator,
      [dtype]: toFiniteNumber(value) || 0
    }),
    {}
  );
  const totalFromParameters = Object.values(normalizedParameters).reduce((total, value) => total + value, 0);
  const totalFromMetadata = toFiniteNumber(source.metadata?.safetensors?.total);
  return {
    parameters: normalizedParameters,
    total: Number.isFinite(totalFromMetadata) ? totalFromMetadata : totalFromParameters
  };
}

export function bytesByDtype(parameters) {
  return Object.entries(parameters).reduce(
    (accumulator, [dtype, count]) => ({
      ...accumulator,
      [dtype]: count * bytesPerParameter(dtype)
    }),
    {}
  );
}

function bytesPerParameter(dtype) {
  const normalized = String(dtype).toUpperCase();
  if (normalized === "F64") {
    return 8;
  }
  if (normalized === "F32") {
    return 4;
  }
  if (["BF16", "F16", "I16", "U16"].includes(normalized)) {
    return 2;
  }
  if (["I8", "U8", "BOOL"].includes(normalized)) {
    return 1;
  }
  return 2;
}
