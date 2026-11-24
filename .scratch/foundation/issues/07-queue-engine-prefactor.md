# 07: 抽出 queueEngine 深模块（行为不变）

**What to build:** 把 `Dashboard` 里的队列推进逻辑抽成一个不依赖 React、DOM 或 IndexedDB 的深模块。调用方只说“跑这批任务、这个模式”，引擎负责分片、跳过已完成、暂停 / 恢复、连续失败熔断、失败重试与状态回调；副作用全部通过注入的端口发生。

**Blocked by:** 04, 06, 09

**Status:** done

- [x] 接口至少包含 `start`、`pause`、`resume`、`clear`、`retryFailed`，以及一个状态订阅回调
- [x] 端口至少包含：读取文章、写回分析结果、读取设置、调用对应 AI 能力、通知 UI、读取当前时间
- [x] 引擎内部不 import React、Dexie、`chrome.*` 或 `localStorage`
- [x] fake ports 覆盖：按设置分片；跳过 `done`；暂停后不再调度新任务；恢复从断点继续；连续 3 次失败自动暂停；失败项重试
- [x] 原有 UI 行为与提示文案不变
- [x] `npm run check` 通过

## Comments

- 2026-11-24: 接入方式见 ticket 08；本票只保证引擎可独立测试，不要求 Dashboard 行数下降。
- 2026-11-24: 实现见 `src/services/queueEngine.ts`。端口：`loadSettings` / `collections` / `analyzeSingle` / `loadArticle` / `loadArticles` / `updateArticle` / `synthesizeTaxonomy` / `batchCategorize` / `notify` / `commit` / `now` / `sleep` / `log`。生命周期：`start` / `pause` / `resume` / `clear` / `retryFailed` / `subscribe`。
- 2026-11-24: 引擎只对 `../db` 做 `import type`，编译后没有运行时依赖；React、Dexie、`chrome.*`、`localStorage` 均未引用。
- 2026-11-24: **一处刻意的行为差异**：原单篇分支的每次提交都会丢掉 `synthesizedTaxonomy`（`stepState` 未带该字段），引擎改为保留。这与 ADR-0004「运行态元数据随队列存活」一致，粗读 / 精读不使用标签池，因此对输出无影响。
- 2026-11-24: 测试 10 条（`queueEngine.test.ts`）：分片 3 批、跳过 done、暂停后不再调用、resume 续跑、熔断 3 次、失败重试、clear、subscribe、文章缺失、标签池注入。
