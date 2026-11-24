# 05: 抽出 mergeArticle 并写特征测试

**What to build:** 把“远端刷新时保留本地 AI 产物”的规则从 Dexie 写入中分离成一个纯函数 `mergeArticle(existing, incoming)`，并用特征测试锁住当前行为。以后任何同步逻辑改动都能先在这个缝上看到红灯，而不是等用户发现标签和摘要被清空。

**Blocked by:** 04

**Status:** done

- [x] 纯函数 `mergeArticle(existing, incoming)` 返回合并后的文章，不触碰数据库
- [x] `safeUpsertArticles` 只负责批量读取、调用合并、`bulkPut`，行为与现在一致
- [x] 覆盖：新文章直接写入；本地已有标签优先；远端点赞 / 评论 / 正文更新生效；本地 AI 摘要、金句、评论洞察、时间戳、回收站状态保留
- [x] 覆盖：`id` 不匹配但 `contentId` 相同的回退匹配
- [x] `npm run check` 通过，且测试不依赖具体数据库实现

## Comments

- 2026-11-24: 这是风险最高、成本最低的第一条缝；`safeUpsertArticles` 目前手写合并 20 多个字段，且历史上有多次数据被覆盖的修复。
- 2026-11-24: 实现见 `src/db/mergeArticle.ts`，`safeUpsertArticles` 现在只做「读旧值 → 合并 → bulkPut」。纯函数测试 6 条（`mergeArticle.test.ts`，不加载 Dexie），仓储测试 4 条（`safeUpsertArticles.test.ts`，用 fake-indexeddb）。
- 2026-11-24: 特征测试锁住一个既有事实：`id` 不同但 `contentId` 相同时，合并结果采用**远端 id**，因此旧 id 的行不会被删除。见 ticket 12。
