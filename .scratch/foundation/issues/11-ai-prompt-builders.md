# 11: 抽出三阶段提示词构造函数

**What to build:** 把粗读 / 词条分类 / 精读的提示词拼装从 `ai.ts` 的内联模板移到 `aiPrompts.ts`，输入是文章与设置，输出是 `{ role, content }[]`。目的是让「截断位置、标签池注入、标签数量上限、是否允许改描述」这些影响输出质量的变量可被测试锁住。

**Blocked by:** 06（已完成）

**Status:** ready-for-agent

- [ ] `buildQuickTriageMessages(article, settings)`：断言正文在 3000 字处截断，`isTruncated` 与字数一致
- [ ] `buildCategorizeMessages(article, collections, options)`：断言标签上限、备选收藏夹列表、`allowModifyDescription` 对 schema 的影响
- [ ] `buildBatchCategorizeMessages(articles, collections, options)`：断言标签池按批次注入、每篇带 id
- [ ] `buildDeepReadMessages(article, settings)`：断言全文不截断、热评 Top 5 注入
- [ ] 提示词快照测试：搬运前后逐字一致（把搬移当重构，不是改写）
- [ ] `DEFAULT_TRIAGE_PROMPT` / `DEFAULT_CATEGORIZE_PROMPT` 的导出路径保持兼容（`SettingsModal` 仍在引用）

## Comments

- 2026-11-24: 从 ticket 06 拆出。理由：`ai.ts` 里约 230 行模板，一次搬移若夹杂措辞微调，会静默降低模型输出质量且难以归因；应作为独立变更，用快照测试证明「只搬不改」。
- 2026-11-24: 风险点：`SettingsModal` 直接 import 两个 DEFAULT 常量，搬移时要么在原文件 re-export，要么同步改引用。
