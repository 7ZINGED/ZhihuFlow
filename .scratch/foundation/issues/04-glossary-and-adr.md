# 04: 建立领域词汇表与前三条 ADR

**What to build:** 把代码与 UI 里已经在用、但从未写下来的领域语言固化，并把三个已经事实上成立的架构决定记成 ADR。后续 ticket、测试名与重构提案都以这套词为准，不再出现“分拣 / 分类 / 整理”混用。

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] `GLOSSARY.md` 至少收录：分拣台、粗读、词条分类、精读、标签池、全局聚类、整批单次打标、收藏夹归宿、失效条目、增量安全合并、预演、熔断、批次
- [ ] 每个词条有一句定义，并标注要避免的同义词
- [ ] ADR-0001：文章数据的唯一真相源是 IndexedDB（local-first，无自建后端）
- [ ] ADR-0002：AI 调用走 OpenAI 兼容协议，由扩展直连，API Key 只存本地
- [ ] ADR-0003：三阶段渐进式流水线 + 两遍标签聚类 + 整批单次打标，以及各自的取舍
- [ ] `AGENTS.md` 与 `docs/agents/domain.md` 中的链接可解析

## Comments

- 2026-11-24: 队列状态的真相源单独由 ticket 09 决定，不塞进这批 ADR。
