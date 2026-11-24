# 07: 抽出 queueEngine 深模块（行为不变）

**What to build:** 把 `Dashboard` 里的队列推进逻辑抽成一个不依赖 React、DOM 或 IndexedDB 的深模块。调用方只说“跑这批任务、这个模式”，引擎负责分片、跳过已完成、暂停 / 恢复、连续失败熔断、失败重试与状态回调；副作用全部通过注入的端口发生。

**Blocked by:** 04, 06, 09

**Status:** ready-for-agent

- [ ] 接口至少包含 `start`、`pause`、`resume`、`clear`、`retryFailed`，以及一个状态订阅回调
- [ ] 端口至少包含：读取文章、写回分析结果、读取设置、调用对应 AI 能力、通知 UI、读取当前时间
- [ ] 引擎内部不 import React、Dexie、`chrome.*` 或 `localStorage`
- [ ] fake ports 覆盖：按设置分片；跳过 `done`；暂停后不再调度新任务；恢复从断点继续；连续 3 次失败自动暂停；失败项重试
- [ ] 原有 UI 行为与提示文案不变
- [ ] `npm run check` 通过

## Comments

- 2026-11-24: 接入方式见 ticket 08；本票只保证引擎可独立测试，不要求 Dashboard 行数下降。
