# Layerdex

通过 [hfviewer](https://hfviewer.com/) 将 Hugging Face 模型架构图导出为 PNG 和结构化 JSON。

[English](./README.md) · 简体中文

| | |
|---|---|
| **GitHub** | [ingeniousfrog/Layerdex](https://github.com/ingeniousfrog/Layerdex) |
| **npm** | [`hf-model-architecture-skill`](https://www.npmjs.com/package/hf-model-architecture-skill) |
| **许可证** | [Apache-2.0](./LICENSE) |

Layerdex 提供一个 Agent Skill — **hf-model-architecture** — 将 Hugging Face 模型 id 或 URL 转换为可复现的架构产物：裁剪后的架构图 PNG 和标准化元数据 JSON。可作为独立 CLI 运行，也可安装到 Claude Code、Codex CLI 和 Cursor。

## 功能

- 通过 hfviewer 渲染任意**公开** Hugging Face 模型
- 支持可配置粒度导出架构图（Block / Detailed / Fine / Level 4+）
- 将 hfviewer 信息面板解析为结构化 JSON（节点数、算子类型、词表、属性、分布等）
- Playwright 自动化，支持 hfviewer 原生导出与截图回退
- JSON 输出符合已发布的 schema 规范

## 效果示例

模型：[`black-forest-labs/FLUX.1-dev`](https://hfviewer.com/black-forest-labs/FLUX.1-dev) · 粒度：Fine

```sh
npx hf-model-architecture-skill black-forest-labs/FLUX.1-dev --out ./artifacts --level fine
```

![FLUX.1-dev 架构图](./skills/hf-model-architecture/examples/flux1-dev-level3-structure.png)

```json
{
  "model": { "title": "FLUX.1-dev model", "nodeCount": 27, "operationTypeCount": 25, "tokenVocab": 49408 },
  "operationTypes": [
    { "name": "Linear", "percent": 11.1 },
    { "name": "Input", "percent": 3.7 }
  ]
}
```

完整样例：[`examples/flux1-dev-level3-info.json`](./skills/hf-model-architecture/examples/flux1-dev-level3-info.json)

## 安装

**环境要求：** Node.js 18+、Playwright Chromium（`npx playwright install chromium`）

### npm

```sh
npx hf-model-architecture-skill <owner/model> --out <dir> [--level 4]
npx hf-model-architecture-skill@latest <owner/model> --out <dir>   # 使用最新发布版
npx playwright install chromium   # 首次运行
```

### 源码

```sh
git clone https://github.com/ingeniousfrog/Layerdex
cd Layerdex
npm install && npx playwright install chromium
npm run capture -- zai-org/GLM-5.2 --out artifacts/glm --level 4
```

### Agent Skill

安装到 Claude Code、Codex CLI 和/或 Cursor：

```sh
git clone https://github.com/ingeniousfrog/Layerdex /tmp/layerdex
/tmp/layerdex/skills/hf-model-architecture/install.sh --all
```

| 宿主 | 路径 |
|------|------|
| Claude Code | `~/.claude/skills/hf-model-architecture/` |
| Codex CLI | `~/.codex/skills/hf-model-architecture/` |
| Cursor | `~/.cursor/skills/hf-model-architecture/` |

请勿安装到 `~/.cursor/skills-cursor/`（Cursor 内建 skill 保留目录）。

## 使用

### CLI

```sh
# npm
npx hf-model-architecture-skill zai-org/GLM-5.2 --out artifacts/glm --level 4

# 大模型或冷门模型 — 适当加长等待
npx hf-model-architecture-skill qualcomm/MaskRCNN --out artifacts/maskrcnn --timeout 300

# 源码
npm run capture -- zai-org/GLM-5.2 --out artifacts/glm --level 4
```

**支持的输入：** `owner/model`、`https://huggingface.co/<owner>/<model>`、`https://hfviewer.com/<owner>/<model>`

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `--out <dir>` | `.` | 输出目录 |
| `--level <n\|block\|detailed\|fine>` | `4` | 粒度 |
| `--timeout <sec>` | `120` | 总渲染等待时间（秒）。大模型或冷门模型建议 `300` 或更长。 |
| `--headed` | 关闭 | 显示浏览器（调试） |
| `--help` | | 完整参数列表 |

### Agent

**自动触发** — 对话中出现模型 id 或 hfviewer URL：

> 帮我拿到 zai-org/GLM-5.2 的 Level 4 结构图。

**显式调用：**

> Use hf-model-architecture to capture black-forest-labs/FLUX.1-dev at Fine granularity.

Agent 工作流：[`skills/hf-model-architecture/SKILL.md`](./skills/hf-model-architecture/SKILL.md)

## 输出

每次运行生成：

| 文件 | 内容 |
|------|------|
| `<slug>-level<N>-structure.png` | 裁剪后的架构图 |
| `<slug>-level<N>-info.json` | 结构化元数据 |

Schema：[`references/hfviewer-output.schema.json`](./skills/hf-model-architecture/references/hfviewer-output.schema.json) · 字段说明：[`references/output-json.md`](./skills/hf-model-architecture/references/output-json.md)

## 故障排查

| 现象 | 处理 |
|------|------|
| `Playwright is required` | `npm install` |
| 浏览器启动失败 | `npx playwright install chromium` |
| `hfviewer only exposes levels 0-N` | 降低 `--level` |
| Gated / 私有模型 | hfviewer 不支持 |
| 超时 / Processing 弹窗 | 增大 `--timeout`（秒），例如 `--timeout 300`。若 hfviewer 出现 **Processing model** 邮箱弹窗，表示仍在后台处理 — Layerdex 不会代填邮箱；可继续等待或手动打开 hfviewer 链接 — 该模型可能尚未被收录 |
| `exportMethod: element-screenshot` | 非致命回退，PNG 仍有效 |

## 项目结构

```
Layerdex/
├── README.md · README.zh-CN.md
├── package.json                  # npm test, npm run capture
└── skills/hf-model-architecture/
    ├── SKILL.md                  # Agent 指令
    ├── scripts/                  # Playwright 捕获 CLI
    ├── references/               # JSON schema + 字段文档
    ├── examples/                 # FLUX.1-dev 样例输出
    ├── install.sh                # Agent 宿主安装脚本
    └── test/
```

## 边界

Layerdex 依赖 hfviewer 进行渲染与元数据提取，不下载模型权重，不从 tensor 名称推断架构，也不维护独立的可视化引擎。
