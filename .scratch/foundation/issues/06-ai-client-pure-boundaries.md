# 06: 抽出 AI 客户端纯边界并写特征测试

**What to build:** 把大模型返回值的解析、提示词构造和错误消息映射从网络调用中分离出来，使它们可以在没有网络的情况下被测试。目标是让“模型返回了带 ```json 围栏的文本 / 前后有解释 / 字段缺失 / 返回 HTML 错误页”这些情况都有确定行为。

**Blocked by:** 04

**Status:** ready-for-agent

- [ ] 抽出 `parseAiJson`（或等价命名），处理代码围栏、前后杂质、空响应、非法 JSON
- [ ] 抽出粗读 / 分类 / 精读的提示词构造函数，输入是文章与设置，输出是 messages
- [ ] 抽出 HTTP 错误的友好文案映射（状态码、纯文本、HTML、超长消息截断）
- [ ] 测试全部离线运行，不 mock 真实网络；`normalizeEndpoint` 已有测试保持通过
- [ ] `npm run check` 通过

## Comments

- 2026-11-24: 网络层本身留到 `queueEngine` 抽取时用 port 注入测试，不在本票强行引入 fetch mock。
