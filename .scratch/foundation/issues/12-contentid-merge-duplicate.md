# 12: contentId 回退匹配会留下旧 id 的重复行

**What to build:** 确认并修正一个在 ticket 05 特征测试中暴露的行为：当新数据的 `id` 与本地不同、但 `contentId` 相同（典型场景：同一篇回答被归入另一个收藏夹）时，`safeUpsertArticles` 合并后采用**远端 id** 写入，本地旧 id 的记录不会被删除，于是同一 `contentId` 出现两行。

**Blocked by:** 05（已完成）

**Status:** done

- [x] 先判断这是缺陷还是预期：跨收藏夹同一内容是否应该各存一行（当前 `id = ${collectionId}_${contentId}` 的设计暗示「应该」）
- [x] 若为缺陷：删除旧 id 行或统一主键语义，并补一条回归测试 → 结论为预期，不删行
- [x] 若为预期：在 `safeUpsertArticles` 注释与 `GLOSSARY.md` 中写明，避免后来者误判

## 定性结论（2026-11-24）：不是缺陷，是「收藏夹成员」模型

**多行是设计意图，不是重复数据。**

| 证据 | 位置 |
| :--- | :--- |
| 主键按成员构造：`id = ${collectionId}_${contentId}` | `src/services/zhihuApi.ts:262` |
| 失效条目另有前缀，不会与正常成员冲突：`${collectionId}_deleted_${rawId}` | `src/services/zhihuApi.ts:212` |
| 卡片上直接显示所属收藏夹，两行在「全部」视图里可区分 | `src/components/ArticleCard.tsx:157` |
| 收藏夹数量按 `collectionId` 统计，语义是成员数 | `Dashboard.tsx:255`、`289` |
| 回收站、移动、取消收藏都按「某收藏夹里的这篇」操作 | `Dashboard.tsx:862`、`886` |

因此：**一行 = 一条收藏夹成员关系**，同一内容收进两个收藏夹就该有两行；删掉旧行反而会丢失该收藏夹的阅读记录与标签。已在 `GLOSSARY.md` 增补「收藏夹成员」词条，并在 `safeUpsertArticles` 注释中写明「行数不等于内容数」。

## 但确实发现一个缺陷（已修）

**继承来源不确定**：新增成员要从同 `contentId` 的旧行继承 AI 产物，原实现 `new Map(list.map(a => [a.contentId, a]))` 取查询结果里的最后一行。多行时选中哪一行取决于索引顺序，可能继承到一条**还没分析过的空行**。

修法：新增纯函数 `pickInheritanceSource(rows)`（`src/db/mergeArticle.ts`），按 `max(aiDeepReadAt, aiClassifiedAt, aiProcessedAt)` 选产物最完整的一行，同分时按 `id` 字典序取最小以保证与输入顺序无关。`safeUpsertArticles` 改为先按 `contentId` 分组再挑选，回归测试断言「新成员继承精读行而不是空行」。

## Comments

- 2026-11-24: 由 `src/db/safeUpsertArticles.test.ts` 的「id 不匹配但 contentId 相同时沿用本地 AI 产物」发现。测试只锁住了「AI 产物被继承」，没有断言旧行是否残留。
- 2026-11-24: 影响面修正：文章总数统计、按收藏夹筛选、回收站操作看到的多行**都是成员关系的正确表现**，不是缺陷。
- 2026-11-24: 未在此票处理：同一内容的多行会被各分析一次（成本翻倍，ticket 13）；知乎端取消收藏后本地成员行不会清理（ticket 14）。
