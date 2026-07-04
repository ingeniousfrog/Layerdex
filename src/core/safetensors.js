export function readSafetensorsFile(file) {
  if (!file.path.toLowerCase().endsWith(".safetensors") || !file.bytes) {
    return undefined;
  }
  const readout = parseSafetensors(file);
  return {
    path: file.path,
    tensors: readout.tensors.map((tensor) => ({
      ...tensor,
      sourceFile: file.path
    })),
    warnings: readout.warnings
  };
}

function parseSafetensors(file) {
  try {
    const bytes = asUint8Array(file.bytes);
    if (bytes.length < 9) {
      return { tensors: [], warnings: ["Header is shorter than the safetensors prefix"] };
    }
    const headerLength = Number(readUint64LE(bytes.slice(0, 8)));
    const headerEnd = 8 + headerLength;
    if (!Number.isSafeInteger(headerLength) || headerEnd > bytes.length) {
      return { tensors: [], warnings: ["Header length is incomplete or out of range"] };
    }
    const header = new TextDecoder().decode(bytes.slice(8, headerEnd));
    const parsed = JSON.parse(header);
    const tensors = Object.entries(parsed)
      .filter(([name]) => name !== "__metadata__")
      .map(([name, metadata]) => ({
        name,
        dtype: metadata.dtype,
        shape: Array.isArray(metadata.shape) ? metadata.shape : [],
        bytes: Array.isArray(metadata.data_offsets)
          ? metadata.data_offsets[1] - metadata.data_offsets[0]
          : undefined,
        parameters: shapeProduct(metadata.shape)
      }));
    return { tensors, warnings: [] };
  } catch (error) {
    return {
      tensors: [],
      warnings: [error instanceof Error ? error.message : "Unknown safetensors parse error"]
    };
  }
}

function asUint8Array(bytes) {
  if (bytes instanceof Uint8Array) {
    return bytes;
  }
  if (bytes instanceof ArrayBuffer) {
    return new Uint8Array(bytes);
  }
  return new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

function readUint64LE(bytes) {
  return bytes.reduce((value, byte, index) => value + (BigInt(byte) << BigInt(index * 8)), 0n);
}

function shapeProduct(shape) {
  return Array.isArray(shape) && shape.length > 0
    ? shape.reduce((total, dimension) => total * dimension, 1)
    : 0;
}
