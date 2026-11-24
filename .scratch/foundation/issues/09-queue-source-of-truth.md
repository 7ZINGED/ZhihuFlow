# 09: 决定队列状态的唯一真相源

**What to build:** 目前文章在 IndexedDB、队列在 localStorage；刷新恢复靠 `loadQueueFromStorage`，而任务结果写回 Dexie。这个双源结构在暂停 / 恢复与多面板场景下容易分叉。本票产出一份 ADR-0004，明确队列状态的唯一真相源、迁移路径与回滚方式。

**Blocked by:** None (can start immediately)

**Status:** done

- [x] ADR-0004 比较两种方案：保留 localStorage 作为队列真相源，或迁入 Dexie
- [x] 明确任务状态与文章分析结果的边界，避免同一事实存两处
- [x] 给出迁移步骤（含旧数据兼容）与回滚条件
- [x] 若结论是迁移，另开实现 ticket，并把它挂到 ticket 07 之前 → 结论为不迁移，无需新票
- [x] 决策由人确认，不由 agent 自行拍板

## 结论（2026-11-24，人工确认）

**降权 + 对账**：localStorage 保留为「运行检查点」，不作为进度真相；每篇进度只认 Dexie 文章字段。

- quick → `aiTriageRating`，categorize → `aiClassifiedAt`，deep → `aiDeepReadAt`；刻意不用 `tags`（可被手工填写）。
- `task.status` 降级为提示：`processing → pending`；非 done 但有完成字段 → 补标 done；done 但缺字段 → **保持 done，不自动回退**（避免启动时静默重烧额度）。
- 单写者用 Web Locks（`zhihuflow-ai-queue`）：获取失败提示"另一标签页正在运行"，暂停不释放，循环退出与清空时释放。

## Comments

- 2026-11-24: 这是产品 / 架构判断，不是代码量问题；建议在跑 ticket 07 前用 30 分钟定下来。
- 2026-11-24: 核对代码后修正了本票的一个前提——写入顺序已是「先文章、后队列」（`Dashboard.tsx:663-697`、`567-575`），因此分叉方向是"文章已写、队列仍 pending"，不是反向。对账规则据此设计为不对称。
- 2026-11-24: 不迁 Dexie 的理由已写入 ADR：事务覆盖不了 AI 调用、需为 `chunkInfo`/`synthesizedTaxonomy` 新建运行态表、启动路径要改异步、且解决不了双标签页。实现见 `src/services/queueReconcile.ts` 与 `src/services/queueLock.ts`。
