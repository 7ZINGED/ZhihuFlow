# 架构决策记录

按编号递增，一条决策一个文件。状态为「已接受」的条目是当前约束；要推翻它，新开一条 ADR 并在其中引用被取代的编号，不要直接改写历史。

| 编号 | 决策 | 状态 |
| :--- | :--- | :--- |
| [0001](./0001-local-first-indexeddb.md) | 文章数据的唯一真相源是 IndexedDB（local-first，无自建后端） | 已接受 |
| [0002](./0002-openai-compatible-direct.md) | AI 调用走 OpenAI 兼容协议，扩展直连，Key 只存本地 | 已接受 |
| [0003](./0003-three-stage-pipeline.md) | 三阶段渐进式流水线 + 两遍标签聚类 + 整批单次打标 | 已接受 |
| [0004](./0004-queue-state-source-of-truth.md) | 队列状态降权为运行检查点，进度只认文章字段 | 已接受 |
| [0005](./0005-ai-output-belongs-to-content.md) | AI 产物属于内容：批次按 contentId 折叠，写回只补空不覆盖 | 已接受 |
| [0006](./0006-vanished-membership-goes-to-trash.md) | 成员关系消失时移入回收站（不标失效、不物理删），且仅在抓取完整时做差集 | 已接受 |
| [0007](./0007-api-profiles-and-key-isolation.md) | 多份 API 配置档案并存，Key 不进入可提交文件 | 已接受 |

## 写新 ADR 的时机

- 决定了两个方案之间的取舍，且后来者可能想改回去。
- 出现"为什么不能这样做"的反复解释。
- 推翻了既有 ADR。

词汇与阶段命名以 `GLOSSARY.md` 为准。
