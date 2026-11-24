# 11: 抽出三阶段提示词构造函数

**What to build:** 把粗读 / 词条分类 / 精读的提示词拼装从 `ai.ts` 的内联模板移到 `aiPrompts.ts`，输入是文章与设置，输出是 `{ role, content }[]`。目的是让「截断位置、标签池注入、标签数量上限、是否允许改描述」这些影响输出质量的变量可被测试锁住。

**Blocked by:** 06（已完成）

**Status:** done

## 做法：先锁真值，再搬

1. 先写 `ai.prompts.snapshot.test.ts`，用 fake fetch 抓取**搬移前**实际发出的请求体，固化 9 组 `messages` 快照。
2. 再抽 `aiPrompts.ts`，把 6 处模板逐字搬过去；`ai.ts` 只保留编排与解析。
3. 快照测试**一字未改地通过**，证明是重构而非改写。这一步是本票的核心验收，不是补充。

## 落地

`src/services/aiPrompts.ts`（446 行）导出 6 个 builder + 4 个配置/测量纯函数：

| 函数 | 职责 |
| :--- | :--- |
| `measureQuickTriageContent` | 正文测量：截断判定、字数、截取内容（提示词与返回结果共用） |
| `buildQuickTriageMessages` | 粗读：自定义指令回退、3000 字截断提示 |
| `resolveTaxonomyConfig` / `buildTaxonomyMessages` | Pass 1 全局标签词典：自适应开关、总标签上限、自定义指导注入 |
| `resolveCategorizeConfig` / `buildCategorizeMessages` | 单篇分类：标签上限钳制 1~5、标签池 / 批次标签库、备选收藏夹、描述开关 |
| `resolveBatchCategorizeConfig` / `buildBatchCategorizeMessages` | Pass 2 整批单次：每篇带 id、标签池注入、描述开关 |
| `measureDeepReadContent` / `buildDeepReadMessages` | 精读：全文不截断、热评编号注入 |
| `buildCollectionDescriptionMessages` | 收藏夹简介（顺手一并搬走，`ai.ts` 内已无提示词字面量） |

`ai.ts` 从 739 → **497 行**；`grep '你是一位|请以 JSON|【硬性约束】'` 在 `ai.ts` 无命中。

## 兼容性

- `DEFAULT_TRIAGE_PROMPT` / `DEFAULT_CATEGORIZE_PROMPT` 迁到 `aiPrompts.ts`，`ai.ts` 用 `export ... from` 保持原路径（`SettingsModal.tsx` 未改一行）。
- `CategorizeOptions` 同样从 `ai.ts` re-export。
- `callChatCompletions` 的 temperature 参数、请求体结构与调用顺序全部未变。

## 刻意的差异（不要"顺手统一"）

单篇与批量对 `maxTagCount` 的解析表达式不同：

- 单篇：`settings.maxTagCount || 2`（设为 0 → 回落 2）
- 批量：`options.maxTagCount ?? settings.maxTagCount ?? 2` 再钳制（设为 0 → 钳到 1）

这是搬移前就存在的行为差异，已用两条测试分别锁住。合并成一个 resolver 会静默改变配置含义，不属于本票范围。

精读阶段没有任何设置相关变量，因此 `buildDeepReadMessages(article, hotComments)` 不接收 settings——票里的 `buildDeepReadMessages(article, settings)` 签名与此不符，按实际代码修正。

## 验收

- [x] 9 组提示词快照搬移前后逐字一致
- [x] 粗读 3000 字截断、`isTruncated` / 字数一致、自定义指令 trim 与回退
- [x] 分类标签上限（1~5）、备选收藏夹、`allowModifyDescription` 对 schema 的影响、正文 1500 字截选
- [x] 批量标签池按批次注入、每篇带 id、描述开关
- [x] 精读 5000 字全文完整、热评 Top 5 编号注入、无热评占位
- [x] `npm run check`：125 条测试通过；`npm run build` 成功
