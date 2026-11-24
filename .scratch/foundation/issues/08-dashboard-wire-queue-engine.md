# 08: Dashboard 接入 queueEngine

**What to build:** 用 `queueEngine` 替换 `Dashboard` 内部的队列循环，组件只负责渲染进度、转发用户操作、显示 toast。完成标准是行为完全不变，但编排逻辑不再藏在 1800 行的组件里。

**Blocked by:** 07

**Status:** ready-for-human（自动化项已完成，仅剩 Chrome 人工冒烟）

- [x] `runQueueLoop` 的内部实现被引擎调用替代，组件不再直接维护分片 / 熔断 / 重试状态
- [x] 队列持久化仍通过现有存储层完成，刷新恢复行为不变
- [ ] **手工冒烟：粗读、整批分类、精读三种模式各跑一轮**（需 Chrome，见下方清单）
- [ ] **手工冒烟：暂停、继续、清空、失败重试、刷新后恢复**（需 Chrome，见下方清单）
- [x] `Dashboard.tsx` 降到 800 行以内：**772 行**
- [x] `npm run check` 通过（严格索引检查已恢复，142 条测试全绿）

## 本轮完成的拆分（Dashboard 1739 → 772 行）

按职责拆出 6 个纯展示/编排组件与 3 个 hook，全部为行为不变的物理搬移：

| 类别 | 文件 | 移出行数 |
| :--- | :--- | :--- |
| 组件 | `src/components/QueueStatusPanel.tsx` | 140 |
| 组件 | `src/components/FilterBar.tsx` | 86 |
| 组件 | `src/components/TagFilterBar.tsx` | 65 |
| 组件 | `src/components/BatchActionBar.tsx` | 111 |
| 组件 | `src/components/Sidebar.tsx` | 219 |
| 组件 | `src/components/ArticleList.tsx` | 65 |
| hook | `src/hooks/useArticleActions.ts` | 163 |
| hook | `src/hooks/useSingleAnalysis.ts`（工厂函数） | 85 |
| hook | `src/hooks/useCollectionSync.ts` | 135 |

拆分后 Dashboard 只保留状态持有、派生数据与顶层组装；队列生命周期 `runQueueLoop` / `handlePauseQueue` / `handleClearQueue` / `handleRetryFailed` 与 ticket 14 的差集逻辑均未移动，保持原样。

**未解决的已知点（不阻塞本票）**：`handleRetryFailed` 仍由组件把 failed 翻成 pending 后启动新引擎，未走 `engine.retryFailed()`（引擎每次 `run` 后被丢弃）。统一需要把引擎提升为常驻实例，另开票。

## 人工冒烟清单（需在 Chrome 加载扩展执行，agent 无法替代）

执行前：加载 `dist/` 构建产物到 Chrome，登录知乎并打开至少一个有内容的收藏夹。

**三种模式**
1. 勾选 2–3 篇 → 批量操作浮条「1. 批量粗读初筛」→ 确认跳过去重提示 → 队列跑完，文章出现 `aiTriageRating` 与摘要。
2. 勾选若干篇 → 「2. 批量词条分类」→ 观察左侧面板显示「分类」标签 → 完成后文章有 1–2 个规范标签与 `aiCategory`。
3. 勾选 1–2 篇 → 「3. 批量全文精读」→ 观察热评抓取 → 完成后有 `aiDeepReadAt` 与 `commentsInsight`。

**生命周期**
4. 跑一个较长队列 → 左侧面板点「暂停任务」→ 确认状态变黄且不再推进 → 点「继续分析」确认续跑。
5. 队列暂停态点「清空队列」→ 确认面板消失、localStorage 检查点清除。
6. 制造一次失败（填错误 API Key）→ 完成后点「重试失败项」→ 确认 failed 转 pending 并重跑。
7. 队列运行中刷新页面 → 确认从检查点恢复，提示「已从本地安全恢复」，未完成项继续。

**结果记录格式**：在下方 Comments 追加 `YYYY-MM-DD · 环境 · 通过/失败项 · 截图或复现步骤`。

## Comments

- 2026-11-24: 冒烟清单要贴在本票的 Comments 里，记录日期与结果。
- 2026-11-24: 已完成接线：`runQueueLoop` 现在只构造引擎、传端口、等 `run` 结束并释放锁，约 40 行（原 243 行）。`handlePauseQueue` / `handleClearQueue` 额外调用 `engine.pause()`，暂停与清空由引擎自己判断退出点。
- 2026-11-24: 原记录称「Dashboard 1700 行应另开票，不再压在 08」；用户要求继续完成，本轮已直接拆到 772 行，达标。
- 2026-11-24: 拆分期间验证 142 条测试始终全绿；每步抽取后都跑 `npm run check`，未引入行为变化。
