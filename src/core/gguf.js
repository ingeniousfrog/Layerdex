const GGUF_MAGIC = "GGUF";

const GGUF_VALUE_TYPES = {
  0: "uint8",
  1: "int8",
  2: "uint16",
  3: "int16",
  4: "uint32",
  5: "int32",
  6: "float32",
  7: "bool",
  8: "string",
  9: "array",
  10: "uint64",
  11: "int64",
  12: "float64"
};

export function readGgufFile(file) {
  if (!file.path.toLowerCase().endsWith(".gguf") || !file.bytes) {
    return undefined;
  }

  try {
    const reader = createReader(file.bytes);
    const magic = reader.string(4);
    if (magic !== GGUF_MAGIC) {
      return warning(file.path, "Missing GGUF magic header");
    }
    const version = reader.uint32();
    const tensorCount = Number(reader.uint64());
    const metadataCount = Number(reader.uint64());
    const metadataReadout = readMetadata(reader, metadataCount);

    return {
      path: file.path,
      version,
      tensorCount,
      metadata: metadataReadout.metadata,
      warnings: metadataReadout.warnings
    };
  } catch (error) {
    return warning(
      file.path,
      error instanceof Error ? error.message : "Unknown GGUF parse error"
    );
  }
}

function readMetadata(reader, metadataCount) {
  const metadata = {};
  const warnings = [];
  for (let index = 0; index < metadataCount; index += 1) {
    try {
      const key = reader.lengthPrefixedString();
      const valueType = reader.uint32();
      metadata[key] = readValue(reader, valueType);
    } catch (error) {
      warnings.push(
        error instanceof Error
          ? `Metadata entry ${index} skipped: ${error.message}`
          : `Metadata entry ${index} skipped`
      );
      break;
    }
  }
  return { metadata, warnings };
}

function readValue(reader, valueType) {
  const type = GGUF_VALUE_TYPES[valueType];
  if (type === "string") {
    return reader.lengthPrefixedString();
  }
  if (type === "uint32") {
    return reader.uint32();
  }
  if (type === "uint8") {
    return reader.uint8();
  }
  if (type === "int8") {
    return reader.int8();
  }
  if (type === "uint16") {
    return reader.uint16();
  }
  if (type === "int16") {
    return reader.int16();
  }
  if (type === "int32") {
    return reader.int32();
  }
  if (type === "uint64") {
    return Number(reader.uint64());
  }
  if (type === "int64") {
    return Number(reader.int64());
  }
  if (type === "float32") {
    return reader.float32();
  }
  if (type === "float64") {
    return reader.float64();
  }
  if (type === "bool") {
    return reader.uint8() === 1;
  }
  if (type === "array") {
    return readArray(reader);
  }
  throw new Error(`Unsupported GGUF metadata value type: ${valueType}`);
}

function readArray(reader) {
  const itemType = reader.uint32();
  const itemCount = Number(reader.uint64());
  return Array.from({ length: itemCount }).map(() => readValue(reader, itemType));
}

function createReader(bytesLike) {
  const bytes = asUint8Array(bytesLike);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 0;

  function ensure(length) {
    if (offset + length > bytes.byteLength) {
      throw new Error("GGUF header is incomplete");
    }
  }

  return {
    string(length) {
      ensure(length);
      const value = new TextDecoder().decode(bytes.slice(offset, offset + length));
      offset += length;
      return value;
    },
    lengthPrefixedString() {
      const length = Number(this.uint64());
      return this.string(length);
    },
    uint8() {
      ensure(1);
      const value = view.getUint8(offset);
      offset += 1;
      return value;
    },
    int8() {
      ensure(1);
      const value = view.getInt8(offset);
      offset += 1;
      return value;
    },
    uint16() {
      ensure(2);
      const value = view.getUint16(offset, true);
      offset += 2;
      return value;
    },
    int16() {
      ensure(2);
      const value = view.getInt16(offset, true);
      offset += 2;
      return value;
    },
    uint32() {
      ensure(4);
      const value = view.getUint32(offset, true);
      offset += 4;
      return value;
    },
    int32() {
      ensure(4);
      const value = view.getInt32(offset, true);
      offset += 4;
      return value;
    },
    uint64() {
      ensure(8);
      const value = view.getBigUint64(offset, true);
      offset += 8;
      return value;
    },
    int64() {
      ensure(8);
      const value = view.getBigInt64(offset, true);
      offset += 8;
      return value;
    },
    float32() {
      ensure(4);
      const value = view.getFloat32(offset, true);
      offset += 4;
      return value;
    },
    float64() {
      ensure(8);
      const value = view.getFloat64(offset, true);
      offset += 8;
      return value;
    }
  };
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

function warning(path, message) {
  return {
    path,
    version: undefined,
    tensorCount: 0,
    metadata: {},
    warnings: [message]
  };
}
