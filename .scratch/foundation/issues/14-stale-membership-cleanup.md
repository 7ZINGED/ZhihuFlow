# 14: 成员关系失效后本地行不会清理

**What to build:** 决定「知乎端取消收藏某篇内容」后本地那一行怎么处理。当前同步只处理收藏夹被删除的情况（整夹文章移入回收站），对「收藏夹还在、但里面少了几篇」不做任何处理。

**Blocked by:** 12（已定性）

**Status:** done

- [x] 拍板语义：**移入回收站**（`inTrash` + `trashedAt`），不标 `isDeletedOrInvalid`、不物理删除 → ADR-0006
- [x] 实现：同步某收藏夹时对比远端 id 集合与本地 `collectionId` 下的 id 集合，差集行移入回收站
- [x] 保护：不动任何 AI 字段；成员级隔离不误伤同内容其他收藏夹；跳过已在回收站的行
- [x] 完整性护栏：仅在抓取完整（主接口分页 `is_end=true`）时执行差集，避免误判
- [x] 回归测试：差集纯函数 6 条 + 抓取完整性 7 条 + 仓储集成 4 条

## 决策依据

差集捕捉的是「成员关系消失」，不是「内容失效」：

- 真正的内容失效由 `formatRawContent` 在抓取阶段识别（幽灵条目 → `isDeletedOrInvalid`），远端仍返回占位 id；差集不该重复这个判断。
- 同一内容可有多条成员行（ticket 12），A 夹取消收藏不该影响 B 夹那行；`inTrash` 是成员特有字段，不参与 ADR-0005 的传播，正好合适。
- 回收站一键可恢复；`isDeletedOrInvalid` 没有一键清除路径，误判代价高。
- 物理删除是用户显式权限（`handlePermanentDeleteSingle` 要 confirm），同步副作用不该获得。

## 完整性护栏（关键）

`fetchCollectionContents` 原有 fallback：主接口失败 → `/contents` 备用接口取第一页 → `break`。若在此状态做差集，未抓到的正常成员会被批量误判为已取消收藏并移入回收站。

- 新增 `fetchCollectionContentsDetailed` 返回 `{ items, complete }`：仅主接口分页走到 `is_end=true` 为 `complete`；备用接口 / 响应结构异常 / 缺分页信息均为 `false`。
- `fetchCollectionContents` 保留原签名，作为只读场景（简介生成、自动整理）的薄封装，三个调用点零改动。
- Dashboard 仅在 `complete=true` 时执行差集；否则 toast 提示「抓取未完整，本次跳过成员失效检查」。

## Comments

- 2026-11-24: 现状证据：`handleFetchArticles` 只做 `safeUpsertArticles(items)` 与数量统计，没有差集处理；`safeUpsertArticles` 只增不改不删。
- 2026-11-24: 与 ticket 12 的区别：12 讲「同一内容多行是否合理」（结论：合理），本票讲「成员关系消失后要不要留行」。两者共用 `id = ${collectionId}_${contentId}` 这一前提。
- 2026-11-24: 潜在风险：批量取消收藏较常见（用户在知乎整理收藏夹），若永远保留，本地会持续累积已不存在的成员，且「全部」视图会显示过期内容。
