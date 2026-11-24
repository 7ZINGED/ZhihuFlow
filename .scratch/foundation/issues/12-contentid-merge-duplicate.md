# 12: contentId 回退匹配会留下旧 id 的重复行

**What to build:** 确认并修正一个在 ticket 05 特征测试中暴露的行为：当新数据的 `id` 与本地不同、但 `contentId` 相同（典型场景：同一篇回答被归入另一个收藏夹）时，`safeUpsertArticles` 合并后采用**远端 id** 写入，本地旧 id 的记录不会被删除，于是同一 `contentId` 出现两行。

**Blocked by:** 05（已完成）

**Status:** ready-for-human

- [ ] 先判断这是缺陷还是预期：跨收藏夹同一内容是否应该各存一行（当前 `id = ${collectionId}_${contentId}` 的设计暗示「应该」）
- [ ] 若为缺陷：删除旧 id 行或统一主键语义，并补一条回归测试
- [ ] 若为预期：在 `safeUpsertArticles` 注释与 `GLOSSARY.md` 中写明，避免后来者误判

## Comments

- 2026-11-24: 由 `src/db/safeUpsertArticles.test.ts` 的「id 不匹配但 contentId 相同时沿用本地 AI 产物」发现。测试只锁住了「AI 产物被继承」，没有断言旧行是否残留。
- 2026-11-24: 影响面：文章总数统计、按收藏夹筛选、回收站操作可能看到重复条目。
