# Layerdex

Capture Hugging Face model architecture diagrams as PNG and structured JSON, powered by [hfviewer](https://hfviewer.com/).

[English](./README.md) · [简体中文](./README.zh-CN.md)

| | |
|---|---|
| **GitHub** | [ingeniousfrog/Layerdex](https://github.com/ingeniousfrog/Layerdex) |
| **npm** | [`hf-model-architecture-skill`](https://www.npmjs.com/package/hf-model-architecture-skill) |
| **License** | [Apache-2.0](./LICENSE) |

Layerdex ships one agent skill — **hf-model-architecture** — that turns a Hugging Face model id or URL into reproducible architecture artifacts: a cropped graph PNG and a normalized metadata JSON file. It runs as a standalone CLI or installs into Claude Code, Codex CLI, and Cursor.

## Features

- Renders any **public** Hugging Face model through hfviewer
- Exports architecture graphs at configurable granularity (Block / Detailed / Fine / Level 4+)
- Parses the hfviewer info panel into structured JSON (nodes, op types, vocab, attributes, distributions)
- Playwright automation with hfviewer native export and screenshot fallback
- JSON output validated against a published schema

## Example

Model: [`black-forest-labs/FLUX.1-dev`](https://hfviewer.com/black-forest-labs/FLUX.1-dev) · granularity: Fine

```sh
npx hf-model-architecture-skill black-forest-labs/FLUX.1-dev --out ./artifacts --level fine
```

![FLUX.1-dev architecture graph](./skills/hf-model-architecture/examples/flux1-dev-level3-structure.png)

```json
{
  "model": { "title": "FLUX.1-dev model", "nodeCount": 27, "operationTypeCount": 25, "tokenVocab": 49408 },
  "operationTypes": [
    { "name": "Linear", "percent": 11.1 },
    { "name": "Input", "percent": 3.7 }
  ]
}
```

Full sample: [`examples/flux1-dev-level3-info.json`](./skills/hf-model-architecture/examples/flux1-dev-level3-info.json)

## Installation

**Requirements:** Node.js 18+, Playwright Chromium (`npx playwright install chromium`)

### npm

```sh
npx hf-model-architecture-skill <owner/model> --out <dir> [--level 4]
npx hf-model-architecture-skill@latest <owner/model> --out <dir>   # pin latest release
npx playwright install chromium   # first run only
```

### Source

```sh
git clone https://github.com/ingeniousfrog/Layerdex
cd Layerdex
npm install && npx playwright install chromium
npm run capture -- zai-org/GLM-5.2 --out artifacts/glm --level 4
```

### Agent skill

Install into Claude Code, Codex CLI, and/or Cursor:

```sh
git clone https://github.com/ingeniousfrog/Layerdex /tmp/layerdex
/tmp/layerdex/skills/hf-model-architecture/install.sh --all
```

| Host | Path |
|------|------|
| Claude Code | `~/.claude/skills/hf-model-architecture/` |
| Codex CLI | `~/.codex/skills/hf-model-architecture/` |
| Cursor | `~/.cursor/skills/hf-model-architecture/` |

Do not install into `~/.cursor/skills-cursor/` (reserved for Cursor built-ins).

## Usage

### CLI

```sh
# from npm
npx hf-model-architecture-skill zai-org/GLM-5.2 --out artifacts/glm --level 4

# slow or rarely viewed models — allow more time
npx hf-model-architecture-skill qualcomm/MaskRCNN --out artifacts/maskrcnn --timeout 300

# from repo
npm run capture -- zai-org/GLM-5.2 --out artifacts/glm --level 4
```

**Accepted inputs:** `owner/model`, `https://huggingface.co/<owner>/<model>`, `https://hfviewer.com/<owner>/<model>`

| Flag | Default | Description |
|------|---------|-------------|
| `--out <dir>` | `.` | Output directory |
| `--level <n\|block\|detailed\|fine>` | `4` | Granularity level |
| `--timeout <sec>` | `120` | Total render wait budget in seconds. Use `300` or more for large or rarely viewed models. |
| `--headed` | off | Show browser (debug) |
| `--help` | | Full option list |

### Agent

**Automatic** — mention a model id or hfviewer URL:

> Capture a Level 4 architecture graph for zai-org/GLM-5.2.

**Explicit:**

> Use hf-model-architecture to capture black-forest-labs/FLUX.1-dev at Fine granularity.

Agent workflow: [`skills/hf-model-architecture/SKILL.md`](./skills/hf-model-architecture/SKILL.md)

## Output

Each run produces:

| File | Content |
|------|---------|
| `<slug>-level<N>-structure.png` | Cropped architecture graph |
| `<slug>-level<N>-info.json` | Structured metadata |

Schema: [`references/hfviewer-output.schema.json`](./skills/hf-model-architecture/references/hfviewer-output.schema.json) · Field guide: [`references/output-json.md`](./skills/hf-model-architecture/references/output-json.md)

## Troubleshooting

| Issue | Resolution |
|-------|------------|
| `Playwright is required` | `npm install` |
| Browser launch fails | `npx playwright install chromium` |
| `hfviewer only exposes levels 0-N` | Lower `--level` |
| Gated / private model | Not supported by hfviewer |
| Timeout / processing dialog | Increase `--timeout` (seconds), e.g. `--timeout 300`. If hfviewer shows a **Processing model** email dialog, it is still rendering in the background — Layerdex does not submit email; wait longer or open the hfviewer URL manually — the model may not be indexed yet |
| `exportMethod: element-screenshot` | Non-fatal; PNG is still valid |

## Project structure

```
Layerdex/
├── README.md · README.zh-CN.md
├── package.json                  # npm test, npm run capture
└── skills/hf-model-architecture/
    ├── SKILL.md                  # agent instructions
    ├── scripts/                  # Playwright capture CLI
    ├── references/               # JSON schema + field docs
    ├── examples/                 # FLUX.1-dev sample output
    ├── install.sh                # agent host installer
    └── test/
```

## Scope

Layerdex depends on hfviewer for rendering and metadata. It does not download model weights, infer architecture from tensor names, or ship a separate visualization engine.
