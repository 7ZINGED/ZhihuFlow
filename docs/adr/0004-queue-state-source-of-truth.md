# ADR-0004：队列状态降权为运行检查点，进度只认文章字段

- **状态**：已接受
- **日期**：2026-11-24
- **决策者**：项目所有者（人工确认）
- **相关工单**：`.scratch/foundation/issues/09-queue-source-of-truth.md`

## 背景

应用有两处持久化：

| 存储 | 内容 | 位置 |
| :--- | :--- | :--- |
| IndexedDB `ZhihuDigestDB.articles` | 文章条目与全部 AI 产物（`aiTriageRating`、`tags`、`aiClassifiedAt`、`aiDeepReadAt`、摘要、回收站状态等） | `src/db/index.ts` |
| `localStorage['zh_ai_batch_queue_v1']` | 队列快照 `AIQueueState`：状态、模式、任务列表、`chunkInfo`、`currentTitle`、`synthesizedTaxonomy` | `src/services/aiQueue.ts` |

两份数据都在描述"这篇处理过没有"，因此存在同一事实存两处的风险。核对代码后得到四条事实：

1. **新批次是从文章字段筛出来的**，不是从队列。`Dashboard.tsx:725-780` 依次用 `aiTriageRating` / `tags` / `aiDeepReadAt` 判断"已处理"，说明文章字段事实上已是权威。
2. **写入顺序已是先文章、后队列**。单篇流程：`handleAnalyzeSingle` 写库 → `task.status = 'done'` → `saveQueueToStorage`（`Dashboard.tsx:663-697`）；整批分类：`db.articles.update` → 标 `done` → 存队列（`Dashboard.tsx:567-575`）。故崩溃窗口是"文章已写、队列仍 pending"，而非"队列说完成、文章没有"。
3. **队列里有三样东西在 Dexie 中无处安放**：`chunkInfo`、`currentTitle`、`synthesizedTaxonomy`。它们是"本次运行"的元数据，不是文章属性。
4. **没有任何单写者约束**。两个标签页可同时以 `running` 状态跑同一队列，重复消耗 API 额度，且 `localStorage.setItem` 后写覆盖先写。

## 决策

**队列是运行检查点，不是进度真相源。**

1. **文章行是每篇进度的唯一真相。** 完成判定按模式固定为：`quick → aiTriageRating`、`categorize → aiClassifiedAt`、`deep → aiDeepReadAt`。不使用 `tags` 判定分类完成——标签可被用户手工填写，`aiClassifiedAt` 才代表 AI 真的处理过。
2. **队列只记录意图与游标。** 它回答"这次要处理哪些 id、什么模式、怎么分片、现在跑到哪"，并保存 `synthesizedTaxonomy` 这类运行态元数据。队列可以整体丢弃而不损失任何分析结果。
3. **`task.status` 降级为提示，不是断言。** 载入时按文章字段对账，规则是不对称的：
   - `processing` → `pending`（上次运行被中断，必然重跑）；
   - 非 `done` 但文章已有该模式的完成字段 → 补标 `done`（崩溃窗口自愈，省掉一次重复 AI 调用）；
   - `done` 但文章缺少完成字段 → **保持 `done`，不自动回退**。宁可漏跑一篇由用户显式重试，也不要在启动时静默重烧额度。
   - 对账后若无 `pending`/`processing`，队列状态转为 `completed`。
4. **单写者用 Web Locks 保证。** 锁名 `zhihuflow-ai-queue`，`ifAvailable: true` 获取失败即提示"另一个标签页正在运行"。暂停不释放锁（该标签页仍持有队列），清空队列与循环结束时释放。运行环境不支持 Web Locks 时降级为不限制，并在控制台告警一次。

## 为什么不迁入 Dexie

迁入 Dexie 的唯一实质收益是"文章写入 + 队列标记"可同事务提交。但这笔收益买不到想要的东西：

- **事务覆盖不了 AI 调用。** Dexie 事务在等待网络期间会自动提交，无法把"调用大模型 + 写文章 + 标任务"包成一个原子单元。能原子化的只有每个任务末尾的两步写入。
- **要靠新建表承载运行态。** `chunkInfo`、`synthesizedTaxonomy` 需要一个只为运行存在的表，而它们本来就是可丢弃的。
- **启动路径要从同步变异步。** 现在是 `useState(() => loadQueueFromStorage())` 同步取初值；迁库后必须加 hydrate 阶段与加载态，Dashboard 首屏逻辑跟着改。
- **解决不了双标签页。** IndexedDB 本身不提供跨标签页互斥，仍需锁。

对账 + 锁能以更小的改动拿到同样的正确性，因此不迁。

## 兼容与回滚

- **不做数据迁移。** 存储键与 `AIQueueState` 结构都不变，旧快照可直接读取；对账在载入时计算，不写回额外字段，因此降级回旧版本也是安全的。
- **回滚条件**：若对账出现"补标 done 但文章实际没有 AI 产物"且一周内超过 1 例，回滚为只信任 `task.status`（删除对账调用即可，存储层无需改动）。若单标签页场景下锁造成误拦截，移除锁获取或改为可配置开关。
- **保留未来迁移的接口。** ticket 07 抽取 `queueEngine` 时，存储必须以 `QueueStore` 端口（`load/save/clear`）注入，使 Dexie 实现仍可替换，不必改引擎。

## 后果

- 崩溃后恢复不再重复调用已成功文章的 AI 接口，只重跑真正的 `pending`。
- 启动多一次按 id 的索引读（`where('id').anyOf`），仅在队列非空时发生。
- 新增一种用户可见状态："另一个标签页正在运行队列"，需要给出明确文案而不是静默失败。
- `task.status` 与文章字段仍可能短暂不一致，这是被接受的：不一致由载入对账收敛，而不是靠双重写入维持。
