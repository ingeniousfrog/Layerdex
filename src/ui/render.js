export function renderApp(state) {
  const analysis = state.analysis;
  setText("statusLine", state.status || "Ready");
  setText("modelTitle", analysis ? analysis.overview.displayName : "No model loaded");
  setHtml("metricStrip", analysis ? renderMetrics(analysis, state) : renderEmptyMetrics());
  setHtml("viewTabs", analysis ? renderTabs(analysis.views, state.activeView) : "");
  setHtml("structureTree", analysis ? renderTree(analysis, state.selectedId) : renderEmptyTree());
  setHtml("viewCanvas", analysis ? renderView(analysis, state) : renderEmptyCanvas());
  setHtml("detailPane", analysis ? renderDetail(analysis, state.selectedId) : renderEmptyDetail());
  setHtml("factList", analysis ? renderFacts(analysis.facts) : "");
}

function renderMetrics(analysis, state) {
  const metrics = [
    ["Architecture", analysis.overview.architecture],
    ["Modality", analysis.overview.modality],
    ["Precision", analysis.overview.precision],
    ["Parameters", formatNumber(analysis.overview.totalParameters)],
    ["Storage", formatBytes(analysis.storage.totalBytes)],
    ["Baseline", state.baseline ? state.baseline.overview.displayName : "None"]
  ];
  return metrics
    .map(
      ([label, value]) => `
        <article class="metric-card">
          <span>${escapeHtml(label)}</span>
          <strong>${escapeHtml(value)}</strong>
        </article>
      `
    )
    .join("");
}

function renderTabs(views, activeView) {
  return views
    .map(
      (view) => `
        <button class="${view === activeView ? "active" : ""}" type="button" data-view="${escapeHtml(view)}">
          ${escapeHtml(view)}
        </button>
      `
    )
    .join("");
}

function renderTree(analysis, selectedId) {
  const root = analysis.structure.nodes.find((node) => node.id === analysis.structure.rootId);
  const children = analysis.structure.links
    .filter((link) => link.from === analysis.structure.rootId)
    .map((link) => analysis.structure.nodes.find((node) => node.id === link.to))
    .filter(Boolean);
  return `
    ${renderTreeButton(root, selectedId)}
    <div class="tree-children">
      ${children.map((node) => renderTreeButton(node, selectedId)).join("")}
    </div>
  `;
}

function renderTreeButton(node, selectedId) {
  return `
    <button class="tree-node ${node.id === selectedId ? "selected" : ""}" type="button" data-select-id="${escapeHtml(node.id)}">
      <span class="node-kind">${escapeHtml(node.kind)}</span>
      <span>${escapeHtml(node.label)}</span>
      <small>${escapeHtml(node.status)}</small>
    </button>
  `;
}

function renderView(analysis, state) {
  const view = state.activeView || "Overview";
  if (view === "Anatomy") {
    return renderAnatomy(analysis, state);
  }
  if (view === "Dataflow") {
    return renderDataflow(analysis, state);
  }
  if (view === "Weights") {
    return renderWeights(analysis);
  }
  if (view === "Storage") {
    return renderStorage(analysis);
  }
  if (view === "Diff") {
    return renderDiff(state.diff);
  }
  return renderOverview(analysis, state.selectedId);
}

function renderOverview(analysis, selectedId) {
  const estimate = analysis.overview.deploymentEstimate;
  const selectedDiagramNode = findDiagramNode(analysis, selectedId);
  return `
    <div class="overview-workbench">
      <section class="architecture-stage">
        <div class="stage-header">
          <div>
            <p class="eyebrow">${escapeHtml(analysis.source.type)}</p>
            <h3>${escapeHtml(analysis.diagram.title)}</h3>
          </div>
          <span>${escapeHtml(analysis.overview.modality)} / ${escapeHtml(analysis.overview.precision)}</span>
        </div>
        ${renderArchitectureDiagram(analysis.diagram, selectedId, { compact: true })}
      </section>
      <aside class="overview-sidecar">
        <section class="module-summary">
          <span>Selected module</span>
          <strong>${escapeHtml(selectedDiagramNode?.label || analysis.overview.architecture)}</strong>
          <small>${escapeHtml(selectedDiagramNode ? `${selectedDiagramNode.kind} / ${selectedDiagramNode.role}` : "model overview")}</small>
        </section>
        <section class="estimate-panel">
          ${renderValueRow("Disk", formatBytes(estimate.disk))}
          ${renderValueRow("Estimated VRAM", formatBytes(estimate.estimatedVram))}
          ${renderValueRow("Basis", estimate.note)}
        </section>
        <section class="fact-radar">
          ${analysis.facts.slice(0, 6).map(renderFactChip).join("")}
        </section>
      </aside>
    </div>
  `;
}

function renderAnatomy(analysis, state) {
  const children = analysis.structure.links
    .map((link) => analysis.structure.nodes.find((node) => node.id === link.to))
    .filter(Boolean);
  const selectedId = state.selectedId;
  const selected = children.find((node) => node.id === selectedId) || children[0];
  const dialogNode = children.find((node) => node.id === state.moduleDialogId);
  return `
    <div class="anatomy-layout">
      ${renderModuleFocus(analysis, selected)}
      <div class="anatomy-board">
        ${children
          .map(
            (node, index) => `
              <button class="anatomy-node ${node.id === selectedId ? "selected" : ""}" type="button" data-select-id="${escapeHtml(node.id)}" data-open-module="${escapeHtml(node.id)}" style="--i:${index}">
                <span>${escapeHtml(node.kind)}</span>
                <strong>${escapeHtml(node.label)}</strong>
                <small>${escapeHtml(node.source)} / ${escapeHtml(node.status)}</small>
              </button>
            `
          )
          .join("")}
      </div>
    </div>
    ${dialogNode ? renderModuleDialog(dialogNode, analysis) : ""}
  `;
}

export function renderArchitectureDiagram(diagram, selectedId, options = {}) {
  const width = diagram.width || 1120;
  const laneHeight = 116;
  const height = diagram.height || Math.max(360, 58 + diagram.lanes.length * laneHeight);
  const expandableIds = new Set(options.expandableIds || []);
  const interactive = options.interactive !== false;
  const svgClass = [
    "architecture-svg",
    diagram.variant ? `diagram-${diagram.variant}` : "",
    options.compact ? "compact" : "",
    interactive ? "" : "static"
  ]
    .filter(Boolean)
    .join(" ");
  const laneYById = Object.fromEntries(
    diagram.lanes.map((lane, index) => [lane.id, 42 + index * laneHeight])
  );
  const nodesByLane = Object.fromEntries(
    diagram.lanes.map((lane) => [lane.id, diagram.nodes.filter((node) => node.lane === lane.id)])
  );
  const positionedNodes = Object.fromEntries(
    diagram.nodes.map((node) => {
      if (node.position) {
        return [node.id, { ...node, x: node.position.x, y: node.position.y }];
      }
      const laneNodes = nodesByLane[node.lane] || [node];
      const index = laneNodes.findIndex((item) => item.id === node.id);
      const spacing = 860 / Math.max(laneNodes.length, 1);
      const x = 205 + spacing * index + spacing / 2;
      const y = laneYById[node.lane] + 50;
      return [node.id, { ...node, x, y }];
    })
  );

  return `
    <svg class="${svgClass}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(diagram.title)}">
      <defs>
        <marker id="archArrow" markerWidth="10" markerHeight="10" refX="7" refY="3" orient="auto">
          <path d="M0,0 L0,6 L8,3 z"></path>
        </marker>
      </defs>
      ${diagram.lanes.map((lane) => renderDiagramLane(lane, laneYById[lane.id], width)).join("")}
      ${(diagram.regions || []).map(renderDiagramRegion).join("")}
      ${diagram.edges.map((edge) => renderDiagramEdge(edge, positionedNodes)).join("")}
      ${Object.values(positionedNodes).map((node) => renderDiagramNode(node, selectedId, {
        expandable: expandableIds.has(node.id),
        expanded: options.expandedIds?.includes(node.id),
        interactive
      })).join("")}
    </svg>
  `;
}

function renderDiagramRegion(region) {
  return `
    <g class="diagram-region ${escapeHtml(region.tone || "blue")} ${region.dashed ? "dashed" : ""}" transform="translate(${region.x} ${region.y})">
      <rect width="${region.width}" height="${region.height}" rx="${region.rx || 12}"></rect>
      <text x="${region.labelX || 16}" y="${region.labelY || 24}">${escapeHtml(region.label)}</text>
    </g>
  `;
}

function renderDiagramLane(lane, y, width) {
  return `
    <g class="diagram-lane ${escapeHtml(lane.tone || "blue")}" transform="translate(18 ${y})">
      <rect width="${width - 36}" height="94" rx="14"></rect>
      <text x="22" y="32">${escapeHtml(lane.label)}</text>
    </g>
  `;
}

function renderDiagramNode(node, selectedId, options = {}) {
  const nodeWidth = diagramNodeWidth(node);
  const nodeHeight = node.role === "module" ? 58 : 46;
  const selectionAttribute = options.interactive ? `data-select-id="${escapeHtml(node.id)}"` : "";
  return `
    <g class="diagram-node ${escapeHtml(node.role)} ${node.id === selectedId ? "selected" : ""}" ${selectionAttribute} transform="translate(${node.x} ${node.y})">
      <rect x="${-nodeWidth / 2}" y="${-nodeHeight / 2}" width="${nodeWidth}" height="${nodeHeight}" rx="11"></rect>
      <text class="node-title" y="-5" text-anchor="middle">${escapeHtml(node.label)}</text>
      <text class="node-meta" y="17" text-anchor="middle">${escapeHtml(node.kind)}</text>
      ${options.interactive && options.expandable ? renderDiagramExpander(node.id, nodeWidth, options.expanded) : ""}
    </g>
  `;
}

function renderDiagramExpander(nodeId, nodeWidth, expanded) {
  return `
    <g class="diagram-expander ${expanded ? "expanded" : ""}" data-toggle-module="${escapeHtml(nodeId)}" transform="translate(${nodeWidth / 2 - 13} ${-18})">
      <circle r="10"></circle>
      <text text-anchor="middle" dominant-baseline="central">${expanded ? "-" : "+"}</text>
    </g>
  `;
}

function renderDiagramEdge(edge, nodes) {
  const from = nodes[edge.from];
  const to = nodes[edge.to];
  if (!from || !to) {
    return "";
  }
  const direction = to.x >= from.x ? 1 : -1;
  const startX = from.x + direction * (diagramNodeWidth(from) / 2 - 6);
  const endX = to.x - direction * (diagramNodeWidth(to) / 2 - 6);
  const midX = (startX + endX) / 2;
  const loopOffset = direction === -1 ? 58 : 0;
  const controlY = from.y === to.y ? from.y - 24 - loopOffset : (from.y + to.y) / 2 - loopOffset;
  return `
    <path class="diagram-edge" d="M ${startX} ${from.y} C ${midX} ${controlY}, ${midX} ${controlY}, ${endX} ${to.y}" marker-end="url(#archArrow)"></path>
    ${edge.label ? `<text class="diagram-edge-label" x="${midX}" y="${controlY - 7}" text-anchor="middle">${escapeHtml(edge.label)}</text>` : ""}
  `;
}

function diagramNodeWidth(node) {
  if (node.role === "module") {
    return 172;
  }
  if (node.role === "state") {
    return 142;
  }
  return 124;
}

function renderModuleFocus(analysis, selected) {
  if (!selected) {
    return `<section class="module-focus"><div class="empty-state"><strong>No module</strong><span>Select a structure node.</span></div></section>`;
  }
  const relatedEdges = analysis.dataflow.edges.filter(
    (edge) => edge.from === selected.id || edge.to === selected.id
  );
  const diagramNode = findDiagramNode(analysis, selected.id);
  return `
    <section class="module-focus ${selected.kind}">
      <div class="module-chip">${escapeHtml(selected.kind)}</div>
      <h3>${escapeHtml(selected.label)}</h3>
      <p>${escapeHtml(selected.source)} / ${escapeHtml(selected.status)}</p>
      ${selected.diagram
        ? `<div class="module-diagram">${renderArchitectureDiagram(selected.diagram, undefined, {
            compact: true,
            interactive: false
          })}</div>`
        : `<div class="module-glyph" aria-hidden="true">
            <span></span><span></span><span></span>
          </div>`}
      <div class="module-stats">
        ${Object.entries(selected.metrics || {}).map(([key, value]) => renderValueRow(key, value || "unknown")).join("")}
        ${diagramNode ? renderValueRow("Diagram lane", diagramNode.lane) : ""}
        ${renderValueRow("Connected flows", relatedEdges.length)}
      </div>
      ${renderDetailList(selected.details || [])}
    </section>
  `;
}

function renderModuleDialog(node, analysis) {
  return `
    <div class="module-dialog-backdrop" role="presentation" data-modal-backdrop>
      <section class="module-dialog" role="dialog" aria-modal="true" aria-label="${escapeHtml(node.label)} details">
        <button class="dialog-close" type="button" data-modal-close aria-label="Close details">x</button>
        ${renderModuleDetailCard(node, analysis)}
      </section>
    </div>
  `;
}

function renderModuleDetailCard(node, analysis) {
  const relatedEdges = [
    ...analysis.diagram.edges.filter((edge) => edge.from === node.id || edge.to === node.id),
    ...analysis.dataflow.edges.filter((edge) => edge.from === node.id || edge.to === node.id)
  ];
  return `
    <article class="module-detail-card ${escapeHtml(node.kind)}">
      <div class="module-detail-heading">
        <span>${escapeHtml(node.kind)}</span>
        <strong>${escapeHtml(node.label)}</strong>
        <small>${escapeHtml(node.source)} / ${escapeHtml(node.status)}</small>
      </div>
      ${renderDetailList(node.details || [])}
      ${node.diagram ? `<div class="module-diagram compact-card">${renderArchitectureDiagram(node.diagram, undefined, {
        compact: true,
        interactive: false
      })}</div>` : ""}
      <div class="module-stats compact">
        ${Object.entries(node.metrics || {}).map(([key, value]) => renderValueRow(key, value || "unknown")).join("")}
        ${renderValueRow("Connected flows", relatedEdges.length)}
      </div>
    </article>
  `;
}

function renderDetailList(details) {
  if (!details.length) {
    return "";
  }
  return `
    <ol class="detail-list">
      ${details.map((detail) => `<li>${escapeHtml(detail)}</li>`).join("")}
    </ol>
  `;
}

function renderDataflow(analysis, state) {
  const expandedIds = state.expandedModules || [];
  const expandableIds = analysis.structure.nodes
    .filter((node) => node.id !== analysis.structure.rootId && node.details?.length > 0)
    .map((node) => node.id);
  const expandedNodes = expandedIds
    .map((id) => analysis.structure.nodes.find((node) => node.id === id))
    .filter(Boolean);
  return `
    <div class="dataflow-workbench">
      <section class="dataflow-stage">
        <div class="stage-header">
          <div>
            <p class="eyebrow">Inference order</p>
            <h3>${escapeHtml(analysis.diagram.title)}</h3>
          </div>
          <span>+ expands module anatomy</span>
        </div>
        ${renderArchitectureDiagram(analysis.diagram, state.selectedId, {
          expandableIds,
          expandedIds
        })}
      </section>
      <aside class="inference-steps">
        ${analysis.dataflow.edges.map((edge, index) => renderFlowStep(edge, index)).join("")}
      </aside>
      ${expandedNodes.length > 0
        ? `<section class="dataflow-expansions">${expandedNodes.map((node) => renderModuleDetailCard(node, analysis)).join("")}</section>`
        : ""}
    </div>
  `;
}

function renderFlowStep(edge, index) {
  return `
    <article class="flow-step">
      <span>${escapeHtml(String(index + 1).padStart(2, "0"))}</span>
      <strong>${escapeHtml(edge.from)} -> ${escapeHtml(edge.to)}</strong>
      <small>${escapeHtml(edge.label)}</small>
    </article>
  `;
}

function renderWeights(analysis) {
  const groups = Object.entries(analysis.weights.groups);
  const tensors = analysis.weights.tensors.slice(0, 16);
  const parameterRows = Object.entries(analysis.weights.parameterBreakdown || {});
  const byteRows = analysis.weights.parameterByteBreakdown || {};
  const weightFiles = analysis.storage.files.filter((file) =>
    ["safetensors", "gguf", "pytorch-bin"].includes(file.format)
  );
  const activeWeightBytes = weightFiles
    .filter((file) => file.active !== false)
    .reduce((total, file) => total + file.size, 0);
  const hasTensorRows = tensors.length > 0;
  const hasExternalSummary = analysis.weights.externalParameters > 0;
  const hasWeightFiles = weightFiles.length > 0;
  return `
    <div class="split-view">
      <section class="bars-panel">
        ${hasExternalSummary ? renderValueRow("HF parameters", formatNumber(analysis.weights.externalParameters)) : ""}
        ${analysis.weights.externalWeightBytes > 0 ? renderValueRow("Estimated weight bytes", formatBytes(analysis.weights.externalWeightBytes)) : ""}
        ${!hasExternalSummary && hasWeightFiles ? renderValueRow("Weight files", weightFiles.length) : ""}
        ${!hasExternalSummary && hasWeightFiles ? renderValueRow("Active weight bytes", formatBytes(activeWeightBytes)) : ""}
        ${parameterRows.length > 0
          ? parameterRows.map(([dtype, count]) => renderBar(dtype, count, analysis.weights.externalParameters, formatNumber(count))).join("")
          : groups.map(([group, count]) => renderBar(group, count, analysis.weights.tensors.length)).join("")}
        ${analysis.storage.shards?.length > 0 ? renderValueRow("Indexed shards", analysis.storage.shards.length) : ""}
        ${!hasExternalSummary && groups.length === 0 && !hasWeightFiles ? `<p class="quiet">No tensor metadata loaded.</p>` : ""}
      </section>
      <section class="table-panel">
        ${hasTensorRows
          ? `
            <table>
              <thead><tr><th>Tensor</th><th>DType</th><th>Shape</th><th>Params</th><th>Source</th></tr></thead>
              <tbody>
                ${tensors.map(renderTensorRow).join("")}
              </tbody>
            </table>
          `
          : parameterRows.length > 0
            ? renderWeightSummaryTable(parameterRows, byteRows)
            : renderWeightFileTable(weightFiles)}
      </section>
    </div>
  `;
}

function renderWeightSummaryTable(parameterRows, byteRows) {
  if (parameterRows.length === 0) {
    return `<div class="empty-state"><strong>No weight metadata</strong><span>Load safetensors headers, an index file, or Hugging Face parameter metadata.</span></div>`;
  }
  return `
    <table>
      <thead><tr><th>DType</th><th>Parameters</th><th>Estimated Bytes</th><th>Source</th></tr></thead>
      <tbody>
        ${parameterRows
          .map(
            ([dtype, count]) => `
              <tr>
                <td>${escapeHtml(dtype)}</td>
                <td>${escapeHtml(formatNumber(count))}</td>
                <td>${escapeHtml(formatBytes(byteRows[dtype] || 0))}</td>
                <td>huggingface</td>
              </tr>
            `
          )
          .join("")}
      </tbody>
    </table>
    <p class="quiet table-note">Per-tensor shape rows require safetensors headers or index metadata. This summary comes from repository parameter metadata.</p>
  `;
}

function renderWeightFileTable(weightFiles) {
  if (weightFiles.length === 0) {
    return `<div class="empty-state"><strong>No weight metadata</strong><span>Load safetensors headers, an index file, or Hugging Face parameter metadata.</span></div>`;
  }
  return `
    <table>
      <thead><tr><th>Weight file</th><th>Format</th><th>Size</th><th>Use</th></tr></thead>
      <tbody>
        ${weightFiles
          .map(
            (file) => `
              <tr class="selectable-row" data-select-id="file:${escapeHtml(encodeURIComponent(file.path))}">
                <td>${escapeHtml(file.path)}</td>
                <td>${escapeHtml(file.format)}</td>
                <td>${escapeHtml(formatBytes(file.size))}</td>
                <td>${escapeHtml(file.active === false ? "alternative" : "active")}</td>
              </tr>
            `
          )
          .join("")}
      </tbody>
    </table>
    <p class="quiet table-note">Tensor shapes were not available from headers or indexes, so this view falls back to checkpoint file metadata.</p>
  `;
}

function renderStorage(analysis) {
  const formats = Object.entries(analysis.storage.formats);
  const shardRows = analysis.storage.shards || [];
  return `
    <div class="split-view">
      <section class="bars-panel">
        ${renderValueRow("Basis", analysis.storage.totalBasis)}
        ${analysis.storage.activeFileTotalBytes !== analysis.storage.fileTotalBytes ? renderValueRow("Active footprint", formatBytes(analysis.storage.activeFileTotalBytes)) : ""}
        ${renderValueRow("All repo files", formatBytes(analysis.storage.fileTotalBytes))}
        ${analysis.storage.alternativeBytes > 0 ? renderValueRow("Alternative artifacts", formatBytes(analysis.storage.alternativeBytes)) : ""}
        ${analysis.storage.repositoryStorageBytes > 0 ? renderValueRow("Repo usedStorage", formatBytes(analysis.storage.repositoryStorageBytes)) : ""}
        ${analysis.storage.missingSizeCount > 0 ? renderValueRow("Missing sizes", analysis.storage.missingSizeCount) : ""}
        ${formats.map(([format, details]) => renderBar(format, details.bytes, analysis.storage.totalBytes, formatBytes(details.bytes))).join("")}
        ${renderValueRow("Quantization", analysis.storage.quantization)}
        ${analysis.storage.gguf ? renderValueRow("GGUF tensors", analysis.storage.gguf.tensorCount) : ""}
        ${shardRows.length > 0 ? renderValueRow("Shards", shardRows.length) : ""}
        ${analysis.storage.adapter ? renderValueRow("Adapter", analysis.storage.adapter.type) : ""}
      </section>
      <section class="table-panel">
        <table>
          <thead><tr><th>File</th><th>Format</th><th>Size</th><th>Use</th></tr></thead>
          <tbody>
            ${analysis.storage.files.slice(0, 18).map(renderFileRow).join("")}
          </tbody>
        </table>
        ${renderShardTable(shardRows)}
        ${analysis.storage.gguf ? renderGgufSummary(analysis.storage.gguf) : ""}
      </section>
    </div>
  `;
}

function renderDiff(diff) {
  if (!diff) {
    return `<div class="empty-state"><strong>No diff pinned</strong><span>Pin a baseline, then compare.</span></div>`;
  }
  const summary = [
    ["Config changes", diff.summary.changedConfigs],
    ["Added tensors", diff.summary.addedTensors],
    ["Removed tensors", diff.summary.removedTensors],
    ["Storage delta", formatBytes(diff.storageDeltaBytes)]
  ];
  return `
    <div class="diff-grid">
      ${summary
        .map(
          ([label, value]) => `
            <article class="metric-card">
              <span>${escapeHtml(label)}</span>
              <strong>${escapeHtml(value)}</strong>
            </article>
          `
        )
        .join("")}
    </div>
    <div class="diff-lists">
      <section>
        <h3>Structure</h3>
        ${diff.structureChanges.map(renderChange).join("") || `<p class="quiet">No config structure changes.</p>`}
      </section>
      <section>
        <h3>Tensors</h3>
        ${diff.tensorChanges.slice(0, 12).map(renderChange).join("") || `<p class="quiet">No tensor changes.</p>`}
      </section>
    </div>
  `;
}

function renderDetail(analysis, selectedId) {
  const tensor = selectedId?.startsWith("tensor:") ? findTensor(analysis, selectedId) : undefined;
  if (tensor) {
    return `
      ${renderValueRow("Tensor", tensor.name)}
      ${renderValueRow("Source", tensor.source || "weights")}
      ${renderValueRow("File", tensor.sourceFile || "unknown")}
      ${renderValueRow("DType", tensor.dtype || "metadata-only")}
      ${renderValueRow("Shape", tensor.shape?.length ? tensor.shape.join(" x ") : "metadata-only")}
      ${renderValueRow("Parameters", formatNumber(tensor.parameters))}
      ${renderValueRow("Metadata only", tensor.metadataOnly ? "yes" : "no")}
    `;
  }
  const file = selectedId?.startsWith("file:") ? findFile(analysis, selectedId) : undefined;
  if (file) {
    return `
      ${renderValueRow("File", file.path)}
      ${renderValueRow("Format", file.format)}
      ${renderValueRow("Size", formatBytes(file.size))}
      ${renderValueRow("Use", file.active === false ? "alternative artifact" : "active footprint")}
    `;
  }
  const shard = selectedId?.startsWith("shard:") ? findShard(analysis, selectedId) : undefined;
  if (shard) {
    return `
      ${renderValueRow("Shard", shard.path)}
      ${renderValueRow("Size", formatBytes(shard.size))}
      ${renderValueRow("Tensor count", shard.tensorCount)}
      ${renderValueRow("Sample tensors", shard.tensors.slice(0, 3).join(", "))}
    `;
  }
  if (selectedId === "gguf" && analysis.storage.gguf) {
    const metadata = analysis.storage.gguf.metadata;
    return `
      ${renderValueRow("GGUF version", analysis.storage.gguf.version)}
      ${renderValueRow("Tensor count", analysis.storage.gguf.tensorCount)}
      ${renderValueRow("Architecture", metadata["general.architecture"] || "unknown")}
      ${renderValueRow("Name", metadata["general.name"] || "unknown")}
    `;
  }
  const diagramNode = findDiagramNode(analysis, selectedId);
  if (diagramNode) {
    const relatedEdges = analysis.diagram.edges.filter(
      (edge) => edge.from === selectedId || edge.to === selectedId
    );
    return `
      ${renderValueRow("Module", diagramNode.label)}
      ${renderValueRow("Kind", diagramNode.kind)}
      ${renderValueRow("Role", diagramNode.role)}
      ${renderValueRow("Lane", diagramNode.lane)}
      ${renderValueRow("Connected edges", relatedEdges.length)}
      ${Object.entries(diagramNode.metrics || {}).map(([key, value]) => renderValueRow(key, value || "unknown")).join("")}
    `;
  }
  const node = analysis.structure.nodes.find((item) => item.id === selectedId);
  if (!node && analysis.dataflow.nodes.includes(selectedId)) {
    return `
      ${renderValueRow("Dataflow node", selectedId)}
      ${renderValueRow("Incoming", analysis.dataflow.edges.filter((edge) => edge.to === selectedId).length)}
      ${renderValueRow("Outgoing", analysis.dataflow.edges.filter((edge) => edge.from === selectedId).length)}
    `;
  }
  if (!node) {
    return renderValueRow("Model", analysis.overview.displayName);
  }
  return `
    ${renderValueRow("Label", node.label)}
    ${renderValueRow("Kind", node.kind)}
    ${renderValueRow("Source", node.source)}
    ${renderValueRow("Status", node.status)}
    ${Object.entries(node.metrics || {}).map(([key, value]) => renderValueRow(key, value || "unknown")).join("")}
  `;
}

function renderFacts(facts) {
  return facts
    .slice(0, 16)
    .map(
      (item) => `
        <article class="fact-item ${item.status}">
          <strong>${escapeHtml(item.label)}</strong>
          <span>${escapeHtml(formatFactValue(item.value))}</span>
          <small>${escapeHtml(item.source)} / ${escapeHtml(item.status)}</small>
        </article>
      `
    )
    .join("");
}

function renderTensorRow(tensor) {
  return `
    <tr class="selectable-row" data-select-id="tensor:${escapeHtml(encodeURIComponent(tensor.name))}">
      <td>${escapeHtml(tensor.name)}</td>
      <td>${escapeHtml(tensor.dtype || "unknown")}</td>
      <td>${escapeHtml((tensor.shape || []).join(" x "))}</td>
      <td>${escapeHtml(formatNumber(tensor.parameters))}</td>
      <td>${escapeHtml(tensor.source || "weights")}</td>
    </tr>
  `;
}

function renderFileRow(file) {
  return `
    <tr class="selectable-row" data-select-id="file:${escapeHtml(encodeURIComponent(file.path))}">
      <td>${escapeHtml(file.path)}</td>
      <td>${escapeHtml(file.format)}</td>
      <td>${escapeHtml(formatBytes(file.size))}</td>
      <td>${escapeHtml(file.active === false ? "alternative" : "active")}</td>
    </tr>
  `;
}

function renderShardTable(shards) {
  if (shards.length === 0) {
    return "";
  }
  return `
    <table class="secondary-table">
      <thead><tr><th>Shard</th><th>Tensors</th><th>Size</th></tr></thead>
      <tbody>
        ${shards
          .map(
            (shard) => `
              <tr class="selectable-row" data-select-id="shard:${escapeHtml(encodeURIComponent(shard.path))}">
                <td>${escapeHtml(shard.path)}</td>
                <td>${escapeHtml(shard.tensorCount)}</td>
                <td>${escapeHtml(formatBytes(shard.size))}</td>
              </tr>
            `
          )
          .join("")}
      </tbody>
    </table>
  `;
}

function renderGgufSummary(gguf) {
  return `
    <button class="gguf-summary" type="button" data-select-id="gguf">
      <span>GGUF v${escapeHtml(gguf.version)}</span>
      <strong>${escapeHtml(gguf.tensorCount)} tensors</strong>
      <small>${escapeHtml(gguf.metadata["general.architecture"] || "metadata parsed")}</small>
    </button>
  `;
}

function renderChange(change) {
  return `
    <article class="change-item ${escapeHtml(change.status)}">
      <strong>${escapeHtml(change.key || change.name)}</strong>
      <span>${escapeHtml(change.status)}</span>
    </article>
  `;
}

function renderBar(label, value, total, displayValue = value) {
  const percent = total > 0 ? Math.max(4, Math.round((value / total) * 100)) : 0;
  return `
    <div class="bar-row">
      <span>${escapeHtml(label)}</span>
      <div class="bar-track"><i style="width:${percent}%"></i></div>
      <strong>${escapeHtml(displayValue)}</strong>
    </div>
  `;
}

function renderFactChip(item) {
  return `
    <span class="fact-chip ${item.status}">
      ${escapeHtml(item.label)}: ${escapeHtml(formatFactValue(item.value))}
    </span>
  `;
}

function renderValueRow(label, value) {
  return `
    <div class="value-row">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </div>
  `;
}

function renderEmptyMetrics() {
  return ["Architecture", "Modality", "Precision", "Storage"].map((label) => `
    <article class="metric-card muted">
      <span>${label}</span>
      <strong>--</strong>
    </article>
  `).join("");
}

function renderEmptyTree() {
  return `<div class="empty-state"><strong>No structure</strong><span>Load a model package.</span></div>`;
}

function renderEmptyCanvas() {
  return `<div class="empty-state large"><strong>Layerdex workspace</strong><span>Local files stay in this browser session.</span></div>`;
}

function renderEmptyDetail() {
  return `<div class="empty-state"><strong>No selection</strong><span>Nothing loaded.</span></div>`;
}

function setText(id, value) {
  const element = document.getElementById(id);
  if (element) {
    element.textContent = value;
  }
}

function setHtml(id, value) {
  const element = document.getElementById(id);
  if (element) {
    element.innerHTML = value;
  }
}

function formatFactValue(value) {
  return Array.isArray(value) ? value.join(", ") : String(value);
}

function findTensor(analysis, selectedId) {
  const name = decodeSelectionValue(selectedId, "tensor:");
  return analysis.weights.tensors.find((tensor) => tensor.name === name);
}

function findFile(analysis, selectedId) {
  const path = decodeSelectionValue(selectedId, "file:");
  return analysis.storage.files.find((file) => file.path === path);
}

function findShard(analysis, selectedId) {
  const path = decodeSelectionValue(selectedId, "shard:");
  return analysis.storage.shards?.find((shard) => shard.path === path);
}

function findDiagramNode(analysis, selectedId) {
  return analysis.diagram?.nodes.find((node) => node.id === selectedId);
}

function decodeSelectionValue(selectedId, prefix) {
  return decodeURIComponent(selectedId.slice(prefix.length));
}

export function formatNumber(value) {
  return Number.isFinite(value) ? new Intl.NumberFormat("en").format(value) : "--";
}

export function formatBytes(value) {
  if (!Number.isFinite(value)) {
    return "--";
  }
  const sign = value < 0 ? "-" : "";
  const absolute = Math.abs(value);
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(Math.floor(Math.log(Math.max(absolute, 1)) / Math.log(1024)), units.length - 1);
  const scaled = absolute / 1024 ** index;
  return `${sign}${scaled.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

export function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
