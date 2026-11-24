# ADR-0002：AI 调用走 OpenAI 兼容协议，扩展直连，Key 只存本地

- **状态**：已接受
- **日期**：2026-11-24
- **相关工单**：`.scratch/foundation/issues/04-glossary-and-adr.md`

## 背景

需要支持多种模型来源：云端（DeepSeek、OpenAI、智谱、Moonshot、Gemini 兼容端点）与本地（Ollama、LM Studio 的 OpenAI 兼容接口）。用户自带 Key。项目没有服务端（ADR-0001），因此不存在"后端代调用"这个选项。

## 决策

1. **只实现一种协议：OpenAI 兼容的 `POST {endpoint}/chat/completions`。** 用户填写 base URL，`normalizeEndpoint` 补全路径并容忍多余斜杠、允许直接粘贴完整 `/chat/completions` 地址。
2. **请求形态固定**：`model`、`messages`、`temperature` 三个字段；非流式，从 `choices[0].message.content` 取文本。
3. **鉴权用 `Authorization: Bearer <key>`，且 Key 为空时不发该头**，以支持本地无需鉴权的端点（`localhost` / `127.0.0.1` 跳过缺失 Key 的报错）。
4. **Key 只存 `chrome.storage.local`**，不写入源码、日志、导出文件或提交历史。
5. **出站域名必须列入 `wxt.config.ts` 的 `host_permissions`。** 新增供应商意味着改清单并重新发版，这是有意的摩擦。

## 后果

- 换供应商只需改设置，不改代码；但**新增域名必须发版**，用户不能自行添加任意端点。这是安全与灵活性之间的取舍。
- 没有服务端计量与限流，成本完全由客户端自律控制：批次上限（`batchLimit*`）、标签上限（`maxGlobalTags`）、连续失败熔断（3 次）共同构成成本闸门。
- 各家"OpenAI 兼容"的实现差异（不支持 `temperature`、返回结构微调）会在运行时暴露，错误信息需要把供应商原文透传给用户，便于自助排查。
- 扩展权限较宽（`cookies`、`scripting`），因此更不该再把数据外发到自建服务，以缩小信任面。

## 备选方案

| 方案 | 否决理由 |
| :--- | :--- |
| 自建代理转发 | 违背 ADR-0001；且要求用户信任第三方中转，Key 暴露面更大 |
| 分别为每家接入官方 SDK | 多套鉴权与响应格式，维护成本高，收益仅是少量参数差异 |
| 浏览器内置 AI（如 Prompt API） | 可用性与模型质量不稳定，无法覆盖长文精读 |
