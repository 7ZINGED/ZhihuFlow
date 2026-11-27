# GLOSSARY.md

本文件是本仓库的领域词汇表。**写 issue、测试名、重构提案、UI 文案时以此为准**；同一概念不要造第二个词。

命名总则：

- 中文文档与 UI 用中文术语；标识符、类型名、测试名用英文。
- 阶段名固定为 **粗读 / 词条分类 / 精读**，与代码枚举 `quick / categorize / deep` 一一对应，不再新增别名。
- "分拣"指整个界面的活动（分拣台），不对单篇文章使用；单篇的判定动作叫"评级"。

## 核心术语

| 术语 | 定义 | 代码锚点 | 不要写作 |
| :--- | :--- | :--- | :--- |
| **分拣台** | 扩展主界面。以卡片流呈现收藏夹内容，承载三阶段 AI 操作、批量移动与导出 | `src/views/Dashboard.tsx` | 工作台、看板、主页、dashboard（中文行文里） |
| **粗读** | 第一阶段。正文截断至 3000 字，产出分拣评级、摘要与核心要点，回答"这篇值不值得留" | `quickTriageArticleWithAI` | 快读、预读、初筛、triage |
| **分拣评级** | 粗读的三值结论：`keep` 值得留 / `discard` 可清理 / `review` 不确定。AI 只给建议，最终去留由用户决定 | `aiTriageRating` | 评分、打分、优先级 |
| **词条分类** | 第二阶段。为文章确定收藏夹归宿并打标签，依赖粗读产物作为输入 | `batchCategorizeArticlesWithAI` | 归类、整理、打标（作为阶段名时） |
| **精读** | 第三阶段。读全文并抓取热评 Top 5，产出深度摘要与评论区洞察 | `deepReadArticleWithAI` | 深读、详读、全文分析 |
| **标签池** | 一个批次内收敛出的受控标签集合。分类只能从池中选，防止标签随文章数发散 | `synthesizedTaxonomy`、`maxGlobalTags` | 标签库、标签表、tag list |
| **全局聚类** | 分类的第一遍（Pass 1）：把批内文章的主题压成有限标签集，数量可自适应 | `synthesizeBatchTaxonomy` | 聚类分析、主题建模、标签生成 |
| **整批单次打标** | 分类的第二遍（Pass 2）：**一次请求**为整批文章返回标签与归宿，而不是逐篇调用 | `batchCategorizeArticlesWithAI` | 批量分类（易被误解为多次请求）、逐篇打标 |
| **收藏夹归宿** | 文章被建议移动到的目标收藏夹 | `aiCategory` | 目标分类、归属、目录 |
| **失效条目** | 知乎侧已删除或当前账号不可访问的内容，不再进入 AI 流程。由抓取阶段的"幽灵条目"识别，与成员关系消失无关 | `isDeletedOrInvalid`、`formatRawContent` | 死链、坏数据、404 |
| **成员关系消失** | 内容仍在知乎上，但已从某收藏夹移除；差集只在抓取完整时计算，命中行移入回收站（可恢复、AI 产物保留） | `findVanishedMemberIds`、`fetchCollectionContentsDetailed`、ADR-0006 | 内容失效、删除文章 |
| **收藏夹成员** | 一条「某内容属于某收藏夹」的关系，对应一行文章记录，主键为 `${collectionId}_${contentId}`。同一内容可有多条成员关系，因此**文章行数不等于内容数** | `safeUpsertArticles`、`pickInheritanceSource` | 重复行、重复文章（作为缺陷描述时） |
| **产物归属** | AI 产物（摘要、评级、分类、标签、时间戳）属于**内容**，不属于某条成员关系。批次按内容折叠只付一次费用，写回时向同内容其他成员补空、不覆盖 | `applyAIResult`、`collapseByContentId`（ADR-0005） | 每行独立分析、按行缓存结果 |
| **增量安全合并** | 刷新收藏夹时按 `id` 与 `contentId` 合并远端数据，绝不覆盖本地 AI 产物与用户标记 | `safeUpsertArticles` | 覆盖更新、全量替换、同步（作为写入方式时） |
| **预演** | 自动整理先算出完整移动计划并持久化为草稿，用户确认后才执行真实移动 | `AutoOrganizeModal` 的 `draft.plans` | 模拟、试运行、dry run |
| **熔断** | 连续 3 次调用失败即自动暂停队列，避免持续消耗额度 | `consecutiveErrors >= 3` | 限流、退避、重试 |
| **批次** | 按 `batchLimitQuick / Categorize / Deep` 切分出的执行单元，决定分片与进度显示 | `chunkInfo` | 分片、chunk（中文行文里）、分组 |
| **队列检查点** | localStorage 中的运行快照：记录意图（哪些 id、什么模式、如何分片）与游标。**它不是进度真相**，可整体丢弃而不丢分析结果 | `src/services/aiQueue.ts` | 队列状态真相、任务库 |
| **运行态元数据** | 只在本次运行有意义、可丢弃的数据：`chunkInfo`、`currentTitle`、`synthesizedTaxonomy` | ADR-0004 | 配置、缓存 |

## API 配置与连通性

| 术语 | 定义 | 代码锚点 | 不要写作 |
| :--- | :--- | :--- | :--- |
| **API 配置档案** | 一组命名的、持久化的完整 AI 设置：接口地址、模型、Key、提示词与批次上限。切换档案等于同时切换这五项 | `ai_profiles` | 预设、preset、配置（不带"档案"时） |
| **接口预设** | 只填入接口地址与模型名的快捷按钮，不动 Key、提示词与上限。它不是配置档案 | `setPreset` | 配置档案、方案 |
| **激活档案** | 对新入队任务生效的那份配置档案。运行中切换只影响后续任务 | `active_profile_id` | 当前配置、默认配置 |
| **配置快照** | 任务入队时固定在任务上的那份档案内容；本次运行在 `pinSettings` 中钉住首个待处理任务的快照，不随激活档案变化 | `AIQueueTask.settingsSnapshot`、`pinSettings` | 配置副本、运行时配置 |
| **连通性测试** | 用目标档案发一次极小真实请求，验证接口、模型与 Key 是否可用，并返回耗时、模型名或分类错误 | `testApiConnection` | ping、健康检查、探测 |

## 三阶段与落库字段

| 阶段 | 枚举 | 输入 | 主要产物 | 完成标记 |
| :--- | :--- | :--- | :--- | :--- |
| 粗读 | `quick` | 正文前 3000 字 | `aiSummary`、`aiKeyTakeaways`、`aiTriageRating`、`aiTriageReason` | `aiProcessedAt` |
| 词条分类 | `categorize` | 粗读产物 + 标签池 | `tags`、`aiCategory`、`aiCategoryReason` | `aiClassifiedAt` |
| 精读 | `deep` | 全文 + 热评 Top 5 | `aiSummary`、`aiCommentsInsight`、`hotComments` | `aiDeepReadAt` |

**完成标记是"这篇处理过没有"的唯一依据**（ADR-0004）。`tags` 不算——用户可手工填写。

## 两个数据源的措辞纪律

- 文章与 AI 产物在 **IndexedDB**，是持久事实。
- 队列在 **localStorage**，是运行检查点。
- AI 配置档案（含 Key）在 **chrome.storage.local**，只在这里；导出文件不含 Key。
- 说"这篇处理过了"时，指的是文章字段，不是 `task.status`。
- 说"文章数"时，实际统计的是**收藏夹成员数**：同一内容收进两个收藏夹会算两行（见「收藏夹成员」）。
- 说"这篇内容分析过了"时，看的是同 `contentId` 任一成员行的完成字段，而不是某一个成员行（见「产物归属」，ADR-0005）。

## 相关文档

- 架构决策：`docs/adr/`
- 仓库规则：`AGENTS.md`
