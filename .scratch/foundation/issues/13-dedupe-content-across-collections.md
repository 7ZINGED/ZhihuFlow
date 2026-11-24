# 13: 同一内容的多条收藏夹成员会被各分析一次

**What to build:** 同一 `contentId` 在多个收藏夹各占一行时，AI 阶段只分析一次，并让成员之间的产物保持一致。

**Blocked by:** 12（已定性）、07（已完成）

**Status:** done

## 决策（2026-11-24）

原票的三选一是伪选择：A（构建期折叠）单独做不能跨批次生效，B（写回传播）单独做省不下费用——两行仍会各调一次 AI。真正的方案是两者的组合，各放在唯一正确的位置：

| 放在哪 | 做什么 | 为什么必须在这一层 |
| :--- | :--- | :--- |
| `handleBatchAI`（构建队列前） | 按 `contentId` 折叠，同内容只派一个代表任务 | 执行期折叠要在 `queueEngine` 里维护运行态映射、处理分片内重复与断点恢复重建；构建期一行过滤就够 |
| `applyAIResult`（仓储层） | 目标行整体写入，同内容其他成员**只补空、不覆盖** | 三个单篇分支都直接写 `db.articles.update`，只有分类批处理走引擎端口；放端口上要写四遍，新增入口必漏 |

代表行的选择：优先取「尚未完成当前模式」的成员（复用 `isModeCompleted`，字段映射与 ADR-0004 一致），全部已完成时取选择顺序中的第一行。这样折叠不会把真正缺结果的那行藏起来。

用户显式选择「全部重跑」时不折叠——显式重跑意味着接受 N 次调用，折叠会让「我选了三篇只变了一篇」无法解释。判定条件：选中集合里存在已完成项，且过滤后没有缩小。

详见 `docs/adr/0005-ai-output-belongs-to-content.md`。

## 落地

- `src/db/aiPropagation.ts`：`AI_PRODUCT_FIELDS`、`isEmptyValue`、`buildFillPatch`（纯函数）、`collapseByContentId`（纯函数）
- `src/db/index.ts`：`applyAIResult(articleId, patch, { propagate })` → `{ updated, filled }`
- `src/views/Dashboard.tsx`：四处 AI 写库改走 `applyAIResult`（粗读 / 分类 / 精读 / 引擎分类分片）；`handleBatchAI` 增加折叠与去重提示
- 测试：`aiPropagation.test.ts`（13 条）、`applyAIResult.test.ts`（7 条）

## 验收

- [x] 同内容两行同批只产生一次 AI 调用（折叠在队列构建，任务数 = 真实调用数）
- [x] 被折叠掉的成员在代表行写回后立即补齐，不停留在「未处理」
- [x] 兄弟行已有的产物与手工标签不被覆盖（`false` / `0` 视为有效值）
- [x] 成员特有字段（`collectionId`、`inTrash`、`selected`）不参与传播
- [x] 不同内容互不影响；文章不存在时安全返回

## 边界与遗留

- 功能上线前已存在的重复行，会在任一同内容成员下次被分析时补齐；队列里已经存在的重复任务不会被自动删除，随自然消化退出。
- 「全部重跑」时不折叠，因此重跑同一内容的两个成员仍会各付一次费用——这是用户显式选择的结果。
- 未做：历史库存的一次性清理（按 `contentId` 合并已有重复行）。它属于数据修复而非调度规则，若需要另开票。
