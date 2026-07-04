export function readSafetensorsIndexes(jsonFiles, files) {
  const fileSizeByPath = files.reduce(
    (accumulator, file) => ({
      ...accumulator,
      [file.path]: file.size
    }),
    {}
  );
  const indexes = jsonFiles
    .filter((entry) => entry.path.toLowerCase().endsWith(".safetensors.index.json"))
    .filter((entry) => entry.json?.weight_map && typeof entry.json.weight_map === "object")
    .map((entry) => buildIndexReadout(entry, fileSizeByPath));

  return {
    tensors: indexes.flatMap((index) => index.tensors),
    shards: indexes.flatMap((index) => index.shards),
    totalSize: indexes.reduce((total, index) => total + (index.totalSize || 0), 0),
    indexCount: indexes.length
  };
}

function buildIndexReadout(entry, fileSizeByPath) {
  const weightMap = entry.json.weight_map;
  const shardTensorCounts = Object.entries(weightMap).reduce(
    (accumulator, [tensorName, shardPath]) => ({
      ...accumulator,
      [shardPath]: {
        path: shardPath,
        tensorCount: (accumulator[shardPath]?.tensorCount || 0) + 1,
        tensors: [...(accumulator[shardPath]?.tensors || []), tensorName],
        size: fileSizeByPath[shardPath] || 0
      }
    }),
    {}
  );

  return {
    path: entry.path,
    totalSize: entry.json.metadata?.total_size || 0,
    tensors: Object.entries(weightMap).map(([name, sourceFile]) => ({
      name,
      dtype: undefined,
      shape: [],
      bytes: undefined,
      parameters: 0,
      sourceFile,
      source: "index",
      metadataOnly: true
    })),
    shards: Object.values(shardTensorCounts).sort((left, right) =>
      left.path.localeCompare(right.path)
    )
  };
}
