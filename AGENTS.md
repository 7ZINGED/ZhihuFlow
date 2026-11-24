# AGENTS.md

ZhihuFlow（知流）是一个 WXT + React 19 的 Chrome MV3 扩展：把知乎收藏夹同步到本地 IndexedDB，用三阶段 AI 流水线完成粗读、词条分类与全文精读，并支持跨收藏夹重分类与 Markdown / Obsidian 导出。

## Commands

| Command | Purpose |
| :--- | :--- |
| `npm run dev` | WXT 开发模式，Chrome 中加载 `.output/chrome-mv3-dev` |
| `npm run build` | 生产构建到 `.output/chrome-mv3` |
| `npm run compile` | `tsc --noEmit` 类型检查 |
| `npm run test` | Vitest 单次运行 |
| `npm run test:watch` | Vitest 监听模式 |
| `npm run check` | 类型检查 + 测试，提交前必须通过 |

## Layout

- `entrypoints/` — WXT 入口：`background.ts`、`content.ts`、`dashboard/`、`sidepanel/`
- `src/views/Dashboard.tsx` — 分拣台主界面（当前承担较多编排逻辑，正在按票拆分）
- `src/components/` — 文章卡片、设置、自动重分类、队列进度条等
- `src/services/ai.ts` — OpenAI 兼容客户端、粗读 / 分类 / 精读的编排与结果解析
- `src/services/aiPrompts.ts` — 三阶段提示词的唯一来源：配置解析 + 消息数组构造（纯函数，模板改动必须过快照）
- `src/services/aiParse.ts` — 模型响应的纯解析层：围栏、JSON 提取、标签清洗、HTTP 错误文案
- `src/services/aiQueue.ts` — 队列检查点的持久化与恢复
- `src/services/queueEngine.ts` — 队列推进深模块：分片、暂停、熔断、重试（端口注入，不依赖 React / Dexie）
- `src/services/queueReconcile.ts` — 按文章字段对账队列状态（ADR-0004）
- `src/services/queueLock.ts` — 队列单写者锁
- `src/services/zhihuApi.ts` — 知乎登录态、收藏夹抓取、移动 / 删除 / 评论接口
- `src/services/exporter.ts`、`backup.ts` — Markdown / Obsidian 导出与本地备份
- `src/db/index.ts` — Dexie 数据库、`safeUpsertArticles` 增量合并
- `GLOSSARY.md` — 领域词汇表，写票 / 测试名 / UI 文案前先查
- `docs/agents/` — 工程技能使用的仓库约定
- `.scratch/` — 本地 issue tracker（spec 与 tickets）
- `docs/adr/` — 架构决策记录，索引见 `docs/adr/README.md`

## Architecture rules

1. **远端刷新只走 `safeUpsertArticles`。** 任何从知乎拉取的数据都必须经过它合并，禁止用远端数据整表覆盖本地文章；本地 AI 产物（tags、评级、摘要、金句、评论洞察、时间戳、回收站状态）不得丢失。
2. **AI 调用只从 `src/services/ai.ts` 发出。** 组件不得直接 `fetch` 大模型端点；提示词必须来自用户可覆盖的设置，且只在 `aiPrompts.ts` 里拼装，不要在调用点硬编码。
3. **队列只有一个写入者。** 队列状态统一由 `aiQueue.ts` 的存储键管理；UI 不另写 storage key。队列是**运行检查点**而非进度真相——每篇是否处理完只看文章字段（`aiTriageRating` / `aiClassifiedAt` / `aiDeepReadAt`），载入时由 `queueReconcile.ts` 对账，运行中用 `queueLock.ts` 保证单写者。详见 ADR-0004。
4. **行为改动必须落在公共缝上。** 测试只测公共接口，不测私有函数、不绕过接口查数据库。没有合适的缝时，先做 prefactor 票，再写行为。
5. **本地优先、无后端。** 不引入自建服务器、遥测或第三方中转；API Key 只存 `chrome.storage.local`，不得写入源码、日志或提交历史。
6. **语言约定。** UI 文案与注释用中文；标识符、类型名、测试名用英文。领域术语以 `GLOSSARY.md` 为准，不造同义词。
7. **不提交产物。** `.output/`、`.wxt/`、`node_modules/` 已在 `.gitignore` 中，不要强制加入。

## Definition of done

- `npm run check` 通过（CI 也会跑 `npm run build`）。
- 新行为在公共缝上有测试；修 bug 必须先有能复现的红灯测试。
- 新增或变更领域术语、架构决策时，同步更新 `GLOSSARY.md` / `docs/adr/`。
- 在 `feat/<ticket>` 或 `fix/<ticket>` 分支上提交，不直接改 `main`。
- 提交信息用 `type(scope): summary`，与现有历史保持一致。

## Current testing seams

| 缝 | 覆盖 |
| :--- | :--- |
| `src/services/aiParse.ts` | 围栏 / 杂质 / 空响应 / 非法 JSON / HTML 错误页 / 截断 |
| `src/services/queueEngine.ts` | 分片、跳过 done、暂停、resume、熔断、retryFailed、clear、subscribe |
| `src/services/queueReconcile.ts` | 按文章字段补标 done、processing 回退、不回退已 done |
| `src/services/queueLock.ts` | 单写者获取 / 冲突 / 释放 / 不支持时降级 |
| `src/db/mergeArticle.ts` | 远端覆盖与本地 AI 产物保留（含 false 值） |
| `src/db/aiPropagation.ts` | 按 contentId 折叠（偏好待处理行）、补空不覆盖、false/0 视为有效值 |
| `src/services/aiQueue.ts` | 持久化与刷新恢复 |
| `src/services/aiPrompts.ts` | 截断 3000 字、标签上限钳制、标签池 / 备选收藏夹注入、描述开关、精读全文与热评 |
| `src/services/ai.prompts.snapshot.test.ts` | 9 组请求体逐字快照：证明提示词搬移「只搬不改」 |

待补（见 `.scratch/foundation/`）：`formatRawContent`。

类型检查基线：`tsconfig.json` 暂时关闭 `noUncheckedIndexedAccess`。实测恢复后有 37 处错误（`queueEngine.ts` 14、`ai.ts` 8、`queueEngine.test.ts` 5 等），比 Phase 0 记录的 23 处更多——新增模块也带入了数组访问。恢复计划见 `.scratch/foundation/issues/10-restore-index-check.md`。

## Agent skills

### Issue tracker

Issues and specs live as local markdown under `.scratch/<feature>/`; one ticket per file in `issues/`. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical roles map 1:1 to `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.

## Workflow

This repo uses the engineering skills installed at user level. The default flow for multi-session work:

`grill-with-docs` → `to-spec` → `to-tickets` → `implement`（每票新上下文，内部走 `tdd`）→ `code-review` → `pr`

Small, already-aligned changes go straight to `implement` with a regression test. Bugs start with `diagnosing-bugs` and a red feedback loop. Architecture rot goes through `improve-codebase-architecture` before any refactor ticket is written. Session handoffs use `handoff`; environment improvements use `retro`.
