# 08: Dashboard 接入 queueEngine

**What to build:** 用 `queueEngine` 替换 `Dashboard` 内部的队列循环，组件只负责渲染进度、转发用户操作、显示 toast。完成标准是行为完全不变，但编排逻辑不再藏在 1800 行的组件里。

**Blocked by:** 07

**Status:** ready-for-agent

- [ ] `runQueueLoop` 的内部实现被引擎调用替代，组件不再直接维护分片 / 熔断 / 重试状态
- [ ] 队列持久化仍通过现有存储层完成，刷新恢复行为不变
- [ ] 手工冒烟：粗读、整批分类、精读三种模式各跑一轮
- [ ] 手工冒烟：暂停、继续、清空、失败重试、刷新后恢复
- [ ] `Dashboard.tsx` 降到 800 行以内
- [ ] `npm run check` 通过

## Comments

- 2026-11-24: 冒烟清单要贴在本票的 Comments 里，记录日期与结果。
