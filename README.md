<div align="center">

# 知乎收藏夹 Pro · ZhihuDigest
### 用 AI 读完收藏的知乎回答与文章，解决收藏夹吃灰与整理难题

**卡片流速览 · AI 提炼观点 · 收藏夹分拣 · 批量取消与清理 · 导出 Markdown & 写入 Obsidian**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Manifest V3](https://img.shields.io/badge/Manifest-V3-success.svg)](#)
[![Framework: WXT](https://img.shields.io/badge/Framework-WXT%20%2B%20React-orange.svg)](#)

</div>

---

## 💡 为什么做这个工具？

知乎收藏夹是很多人日常积累干货的重要途径，但往往面临三大痛点：
1. **「收藏从未停止，阅读从未开始」**：收藏了成百上千篇长文与深度问答，事后根本抽不出时间回看。
2. **「分类极其混乱，失效死链扎堆」**：早期的收藏夹杂乱无章，部分内容甚至已被原作者或平台删除，成为无法打开的“幽灵条目”。
3. **「知乎网页端交互繁琐」**：网页端取消收藏需要逐一点进内容操作，缺少多选、批量跨收藏夹转移等强力管理工具。

本项目借鉴了优秀开源项目 **[PathGao/MoonDigest](https://github.com/PathGao/MoonDigest)** 的设计哲学与分拣台交互体验，专为知乎深度定制了本套 Chrome 扩展。

---

## ✨ 核心功能

### 1. 📋 收藏夹分拣台 (Triage Dashboard)
- **精致卡片流排版**：采用磨砂玻璃 (Glassmorphism) 与浅色卡片设计，信息密度恰到好处。
- **失效内容探测与标红**：自动识别已被作者删除或失效的内容，一目了然。
- **批量管理与转移**：支持多选/全选，一键将文章批量移动至新收藏夹，或一键从收藏夹移除。

### 2. 🧠 AI 智能速读与观点提炼 (AI Triage)
- **核心论点提炼**：无需逐字阅读数千字长文，AI 自动提取 100 字凝练摘要及 3 大核心观点。
- **分拣建议判定**：
  - 🟢 **高价值留存 (Keep)**：干货度高，适合长期沉淀与作为知识库底料。
  - 🟡 **建议弃置 (Discard)**：时效性弱、水文、情绪宣泄或无收藏价值，建议及时清理。
  - 🔵 **待粗读初审 (Review)**：内容较为特殊，建议人工快速过目确认。
- **通用模型兼容**：支持标准 OpenAI 兼容规范，完美适配 **DeepSeek**、**OpenAI (GPT-4o)**、**月之暗面 (Kimi)**、**阿里通义千问** 或本地部署的 **Ollama (127.0.0.1)**。

### 3. 📝 笔记沉淀与多端导出
- **导出标准 Markdown**：自动生成包含 YAML 元数据、AI 提炼观点和正文备份的 `.md` 文件。
- **Obsidian 直写 (URI 协议)**：点击图标即可将内容直接追加到你本地的 Obsidian 笔记库。
- **排版剪贴板复制**：一键复制结构化 Markdown 文本，随时粘贴到 Notion、Logseq 等工具。

### 4. 🔒 本地优先与隐私安全 (Local-First)
- **本地存储 (IndexedDB)**：文章正文与 AI 摘要均缓存于浏览器本地（基于 Dexie.js），支持毫秒级离线全文检索。
- **无云端服务**：本插件没有专属后端服务器，不收集任何用户隐私数据；所有网络请求仅发生在用户浏览器与知乎/AI 服务商之间。
- **一键清理**：随时可以一键抹除所有本地缓存数据。

---

## 🚀 安装与使用

### 方式一：加载预编译扩展（推荐）

1. 从 Release 页面下载构建好的压缩包并解压，或自行在项目根目录运行 `npm run build` 生成 `.output/chrome-mv3`。
2. 打开 Chrome 浏览器，在地址栏输入访问：`chrome://extensions/`
3. 开启右上角的 **「开发者模式」 (Developer mode)**。
4. 点击左上角 **「加载已解压的扩展程序」 (Load unpacked)**。
5. 选择项目目录下的 `.output/chrome-mv3` 文件夹。
6. 固定扩展图标，在浏览器登录知乎后，点击扩展图标即可进入分拣台！

### 方式二：本地源码开发

```bash
# 1. 克隆代码仓库
git clone https://github.com/YOUR_USERNAME/zhihu-digest-extension.git
cd zhihu-digest-extension

# 2. 安装依赖
npm install

# 3. 启动开发模式 (支持热重载)
npm run dev

# 4. 构建发布版本
npm run build
```

---

## ⚙️ AI 接口配置指引

点击分拣台左侧栏右上角的 ⚙️ 齿轮图标，即可配置 AI：

| 提供商 | API 地址 (Base URL) | 模型名称 (Model) |
| :--- | :--- | :--- |
| **DeepSeek 官方** | `https://api.deepseek.com/v1` | `deepseek-chat` |
| **OpenAI** | `https://api.openai.com/v1` | `gpt-4o-mini` / `gpt-4o` |
| **月之暗面 (Kimi)** | `https://api.moonshot.cn/v1` | `moonshot-v1-8k` |
| **阿里通义千问** | `https://dashscope.aliyuncs.com/compatible-mode/v1` | `qwen-plus` |
| **本地 Ollama** | `http://127.0.0.1:11434/v1` | `qwen2.5:7b` (无需 Key) |

---

## ⚖️ 免责声明 (Disclaimer)

1. 本项目为个人开发者出于学习、研究以及提升个人知识管理效率目的而开发的开源工具。
2. 本项目**并非知乎官方产品**，亦未与知乎（Zhihu Inc.）存在任何隶属、合作或背书关系。
3. 扩展仅在用户本地浏览器中使用用户已有的登录态读取与操作其本人的公开收藏夹数据，不会将用户凭证或数据上传至任何第三方服务器。
4. 请在合理、合规的频率下使用批量功能。因用户自身网络环境、账号违规使用等产生的任何后果由使用者自行承担。

---

## 🙏 致谢与开源协议 (Acknowledgements & License)

- 本项目的交互形态、设计哲学与部分分拣逻辑灵感来源于优秀开源项目 **[PathGao/MoonDigest](https://github.com/PathGao/MoonDigest)**（月团视频摘读），向原作者的卓越设计致敬！
- 感谢 [WXT](https://wxt.dev/) 提供的下一代现代 Chrome 扩展开发框架。
- 感谢 [Lucide](https://lucide.dev/) 提供的精美图标体系。

本项目采用 **[MIT License](LICENSE)** 开源许可证，允许自由修改与个人使用。
