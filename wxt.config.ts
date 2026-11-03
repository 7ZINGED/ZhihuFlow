import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

// See https://wxt.dev/api/reference/wxt/interfaces/inlineconfig.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  vite: () => ({
    plugins: [tailwindcss()],
  }),
  manifest: {
    name: '知流 · ZhihuFlow (知乎摘读与分拣台)',
    description: '用 AI 读完并分拣知乎收藏夹：卡片流速览、AI 观点提炼、批量重分类/取消收藏、Markdown & Obsidian 导出',
    version: '1.0.0',
    permissions: [
      'storage',
      'sidePanel',
      'activeTab',
      'scripting',
      'cookies'
    ],
    host_permissions: [
      '*://*.zhihu.com/*',
      'https://api.deepseek.com/*',
      'https://api.openai.com/*',
      'http://localhost:*/*',
      'http://127.0.0.1:*/*'
    ],
    side_panel: {
      default_path: 'sidepanel.html',
    },
    action: {
      default_title: '打开知乎收藏夹分拣台',
    },
  },
});
