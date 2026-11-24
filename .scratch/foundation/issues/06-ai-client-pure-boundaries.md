# 06: 抽出 AI 客户端解析与错误映射并写特征测试

**What to build:** 把大模型返回值的解析与 HTTP 错误文案映射从网络调用中分离出来，使它们可以在没有网络的情况下被测试。目标是让“模型返回了带 ```json 围栏的文本 / 前后有解释 / 字段缺失 / 返回 HTML 错误页”这些情况都有确定行为。

**Blocked by:** 04

**Status:** done

- [x] 抽出 `parseAiJson`，处理代码围栏、前后杂质、空响应、非法 JSON
- [ ] 抽出粗读 / 分类 / 精读的提示词构造函数 → 拆到 ticket 11（模板搬移会改变提示词字节，需独立评审 + 快照测试）
- [x] 抽出 HTTP 错误的友好文案映射（状态码、纯文本、HTML、超长消息截断）
- [x] 测试全部离线运行，不 mock 真实网络；`normalizeEndpoint` 已有测试保持通过
- [x] `npm run check` 通过

## Comments

- 2026-11-24: 网络层本身留到 `queueEngine` 抽取时用 port 注入测试，不在本票强行引入 fetch mock。
- 2026-11-24: 实现见 `src/services/aiParse.ts`：`stripCodeFence` / `parseAiJson` / `normalizeTags` / `mapHttpError`。`ai.ts` 的 5 处 `JSON.parse` 与 2 处标签清洗全部改为调用它，20 条离线测试覆盖围栏、杂质、空响应、非法 JSON、HTML 错误页与截断。
- 2026-11-24: `mapHttpError` 相比原实现补了两条确定性行为：HTML 错误页给出“端点地址是否指向 API”的提示；空响应体按状态码（401/404/429/5xx）给提示。其余（JSON `error.message` 优先、网络关键词归一、80 字截断）与原实现一致。
