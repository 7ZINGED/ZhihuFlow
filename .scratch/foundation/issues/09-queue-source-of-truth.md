# 09: 决定队列状态的唯一真相源

**What to build:** 目前文章在 IndexedDB、队列在 localStorage；刷新恢复靠 `loadQueueFromStorage`，而任务结果写回 Dexie。这个双源结构在暂停 / 恢复与多面板场景下容易分叉。本票产出一份 ADR-0004，明确队列状态的唯一真相源、迁移路径与回滚方式。

**Blocked by:** None (can start immediately)

**Status:** ready-for-human

- [ ] ADR-0004 比较两种方案：保留 localStorage 作为队列真相源，或迁入 Dexie
- [ ] 明确任务状态与文章分析结果的边界，避免同一事实存两处
- [ ] 给出迁移步骤（含旧数据兼容）与回滚条件
- [ ] 若结论是迁移，另开实现 ticket，并把它挂到 ticket 07 之前
- [ ] 决策由人确认，不由 agent 自行拍板

## Comments

- 2026-11-24: 这是产品 / 架构判断，不是代码量问题；建议在跑 ticket 07 前用 30 分钟定下来。
