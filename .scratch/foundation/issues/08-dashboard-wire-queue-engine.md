# 08: Dashboard 接入 queueEngine

**What to build:** 用 `queueEngine` 替换 `Dashboard` 内部的队列循环，组件只负责渲染进度、转发用户操作、显示 toast。完成标准是行为完全不变，但编排逻辑不再藏在 1800 行的组件里。

**Blocked by:** 07

**Status:** ready-for-human

- [x] `runQueueLoop` 的内部实现被引擎调用替代，组件不再直接维护分片 / 熔断 / 重试状态
- [x] 队列持久化仍通过现有存储层完成，刷新恢复行为不变
- [ ] 手工冒烟：粗读、整批分类、精读三种模式各跑一轮
- [ ] 手工冒烟：暂停、继续、清空、失败重试、刷新后恢复
- [ ] `Dashboard.tsx` 降到 800 行以内
- [x] `npm run check` 通过

## Comments

- 2026-11-24: 冒烟清单要贴在本票的 Comments 里，记录日期与结果。
- 2026-11-24: 已完成接线：`runQueueLoop` 现在只构造引擎、传端口、等 `run` 结束并释放锁，约 40 行（原 243 行）。`handlePauseQueue` / `handleClearQueue` 额外调用 `engine.pause()`，暂停与清空由引擎自己判断退出点。
- 2026-11-24: **未完成**：
  - 冒烟需在 Chrome 中加载扩展人工执行，agent 无法替代。
  - `Dashboard.tsx` 目前 1700 行，未达 800。队列循环已移出，剩余体积来自文章卡片工具栏、筛选、批量移动 / 回收站、导出等独立职责，应另开票按块拆分，不再压在 08。
  - `handleRetryFailed` 仍由组件把 failed 翻成 pending 后启动新引擎，未走 `engine.retryFailed()`；因为引擎在每次 `run` 结束后即被丢弃。若要统一，需要把引擎提升到组件级常驻（依赖用 ref 稳定），属于后续小票。
