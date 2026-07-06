# Layerdex

**HF Model Architecture** — 通过 [hfviewer](https://hfviewer.com/) 将 Hugging Face 模型架构图导出为 PNG 和结构化 JSON。

[English](./README.md) | 简体中文

**仓库地址：** [github.com/ingeniousfrog/Layerdex](https://github.com/ingeniousfrog/Layerdex) · **npm：** [`hf-model-architecture-skill`](https://www.npmjs.com/package/hf-model-architecture-skill)

---

## 功能概述

- 为任意公开的 Hugging Face 模型打开 `https://hfviewer.com/<owner>/<model>`
- 设置粒度（Block / Detailed / Fine / Level 4+）
- 导出裁剪后的架构图 PNG
- 将右侧信息面板解析为 JSON（节点数、算子类型、词表、属性、算子分布等）
- 可作为 Agent Skill（Claude Code、Codex CLI、Cursor）使用，也可作为独立 CLI 运行

输入模型 id（如 `zai-org/GLM-5.2`）或 Hugging Face / hfviewer URL 即可。

## 效果示例

**输入：** `black-forest-labs/FLUX.1-dev`，Fine 粒度（`--level fine`）

**命令：**

```sh
npm install
npm run capture -- black-forest-labs/FLUX.1-dev --out artifacts/flux --level fine
```

**输出架构图：**

![FLUX.1-dev 在 Fine 粒度下的架构图](./skills/hf-model-architecture/examples/flux1-dev-level3-structure.png)

**输出 JSON（节选）：**

```json
{
  "schemaVersion": "1.0.0",
  "source": {
    "modelId": "black-forest-labs/FLUX.1-dev",
    "hfviewerUrl": "https://hfviewer.com/black-forest-labs/FLUX.1-dev",
    "requestedLevel": 3,
    "granularityLabel": "Fine"
  },
  "model": {
    "title": "FLUX.1-dev model",
    "nodeCount": 27,
    "operationTypeCount": 25,
    "tokenVocab": 49408
  },
  "operationTypes": [
    { "name": "Linear", "percent": 11.1 },
    { "name": "Input", "percent": 3.7 },
    { "name": "CLIPTokenizer", "percent": 3.7 },
    { "name": "CLIPTextEmbeddings", "percent": 3.7 },
    { "name": "CLIPEncoderLayer", "percent": 3.7 }
  ]
}
```

完整样例：[`skills/hf-model-architecture/examples/flux1-dev-level3-info.json`](./skills/hf-model-architecture/examples/flux1-dev-level3-info.json)

## 快速开始

**通过 npm（无需 clone 仓库）：**

```sh
npx hf-model-architecture-skill zai-org/GLM-5.2 --out artifacts/glm-5.2 --level 4
npx playwright install chromium
```

**从源码安装：**

```sh
git clone https://github.com/ingeniousfrog/Layerdex
cd Layerdex
npm install
npx playwright install chromium
npm test
npm run capture -- zai-org/GLM-5.2 --out artifacts/glm-5.2 --level 4
```

## 安装为 Agent Skill

### 前置条件

- Node.js 18+
- 在仓库根目录执行 `npm install`
- `npx playwright install chromium`

### Claude Code / Codex CLI / Cursor

```sh
git clone https://github.com/ingeniousfrog/Layerdex /tmp/layerdex
/tmp/layerdex/skills/hf-model-architecture/install.sh --all
```

或只安装到单个宿主：

```sh
./skills/hf-model-architecture/install.sh --claude   # ~/.claude/skills/
./skills/hf-model-architecture/install.sh --codex    # ~/.codex/skills/
./skills/hf-model-architecture/install.sh --cursor   # ~/.cursor/skills/
```

**注意：** 请勿安装到 `~/.cursor/skills-cursor/`，该目录为 Cursor 内建 skill 保留目录。

### 一键安装

```sh
curl -fsSL https://raw.githubusercontent.com/ingeniousfrog/Layerdex/main/skills/hf-model-architecture/install.sh | bash
```

使用 `--link` 可改为软链而非复制。

## 调用方式

### 通过 Agent 自动触发

当对话中出现 Hugging Face 模型 id、架构图或 hfviewer URL 时，skill 的 description 会自动匹配：

> 帮我拿到 zai-org/GLM-5.2 的 Level 4 结构图，并总结算子类型分布。

### 通过 Agent 显式调用

> Use hf-model-architecture to capture black-forest-labs/FLUX.1-dev at Fine granularity.

Agent 指令见 [`skills/hf-model-architecture/SKILL.md`](./skills/hf-model-architecture/SKILL.md)。

### 独立 CLI

通过 npm：

```sh
npx hf-model-architecture-skill zai-org/GLM-5.2 --out artifacts/glm-5.2 --level 4
```

从 clone 的仓库：

```sh
npm run capture -- zai-org/GLM-5.2 --out artifacts/glm-5.2 --level 4
```

## CLI 参数

```
Usage:
  npm run capture -- <model-id-or-url> [options]

Options:
  --out <dir>       输出目录（默认：当前目录）
  --level <value>   粒度数字或 block/detailed/fine（默认：4）
  --width <px>      浏览器视口宽度（默认：2048）
  --height <px>     浏览器视口高度（默认：1152）
  --scale <n>       截图回退时的设备缩放因子（默认：2）
  --timeout <ms>    hfviewer 渲染等待时间（默认：120000）
  --padding <px>    hfviewer API 导出时的裁剪边距（默认：24）
  --headed          显示浏览器窗口（调试用）
  --help            显示帮助
```

支持的输入格式：`owner/model`、`https://huggingface.co/<owner>/<model>`、`https://hfviewer.com/<owner>/<model>`。

## 输出格式

每次 capture 生成两个文件：

- `<slug>-level<N>-structure.png` — 裁剪后的架构图
- `<slug>-level<N>-info.json` — 结构化元数据

主要 JSON 字段：

| 字段 | 说明 |
|------|------|
| `source.modelId` | 标准化后的 Hugging Face 模型 id |
| `source.hfviewerUrl` | hfviewer 直链 |
| `source.requestedLevel` / `source.hfviewerLevel` | 用户可见粒度 vs hfviewer 内部粒度 |
| `artifacts.diagramPng` | PNG 文件路径 |
| `model.nodeCount` / `model.operationTypeCount` / `model.tokenVocab` | 解析后的摘要统计 |
| `model.attributes` | 右侧面板的键值对 |
| `operationTypes[]` | 算子名称与占比 |
| `warnings[]` | 非致命警告 |

完整 schema：[`skills/hf-model-architecture/references/hfviewer-output.schema.json`](./skills/hf-model-architecture/references/hfviewer-output.schema.json)  
字段说明：[`skills/hf-model-architecture/references/output-json.md`](./skills/hf-model-architecture/references/output-json.md)

## 故障排查

| 现象 | 处理方式 |
|------|----------|
| `Playwright is required` | 在仓库根目录执行 `npm install` |
| 浏览器启动失败 | 执行 `npx playwright install chromium` |
| `hfviewer only exposes levels 0-N` | 降低 `--level` 到模型支持的粒度 |
| `hfviewer info panel was not found` | 确认模型公开且 hfviewer 可渲染 |
| JSON 中 `exportMethod: element-screenshot` | 非致命回退，PNG 仍然有效 |
| Gated / 私有模型 | 不支持，hfviewer 无法渲染 |

调试时可加 `--headed` 观察浏览器，或对慢模型使用 `--timeout 180000`。

## 发布与分享

### GitHub

1. 推送到 `main` 并添加 topics：`claude-skill`、`codex-skill`、`cursor-skill`、`agent-skill`、`huggingface`、`model-visualization`。
2. 更新 GitHub 仓库 **About** 描述，使其与当前 skill 定位一致。

### Claude Code 市场

**不要**向 [obra/superpowers](https://github.com/obra/superpowers) 核心库提 PR — 第三方集成会被拒绝。

应提交到 [obra/superpowers-marketplace](https://github.com/obra/superpowers-marketplace)。Fork 后添加指向 `https://github.com/ingeniousfrog/Layerdex.git` 的插件条目，并附上安装证据和示例 PNG。

用户也可以直接安装：

```sh
git clone https://github.com/ingeniousfrog/Layerdex /tmp/layerdex
/tmp/layerdex/skills/hf-model-architecture/install.sh --all
```

### npm

已发布至 npm：[hf-model-architecture-skill](https://www.npmjs.com/package/hf-model-architecture-skill)（v0.1.0）。无需 clone 仓库即可运行：

```sh
npx hf-model-architecture-skill zai-org/GLM-5.2 --out ./artifacts --level 4
npx playwright install chromium
```

安装后仍需单独安装 Playwright Chromium — 浏览器不会随 npm 包一起分发。

## 仓库结构

```
Layerdex/
├── README.md                          # 文档（本文件）
├── README.zh-CN.md                    # 中文文档
├── skills/hf-model-architecture/
│   ├── SKILL.md                       # Agent 指令（非用户文档）
│   ├── scripts/capture-hfviewer.mjs   # Playwright 自动化
│   ├── examples/                      # 样例 PNG + JSON
│   ├── references/                    # 输出 schema
│   ├── install.sh                     # 安装到 Claude/Codex/Cursor
│   └── test/                          # 单元测试
└── package.json                       # 根脚本：npm test、npm run capture
```

## 边界说明

Layerdex 依赖 hfviewer 的渲染与元数据，不会下载模型权重、不会从 tensor 名称推断架构，也不维护独立的可视化引擎。

## 许可证

Apache-2.0 — 见 [LICENSE](./LICENSE)。
