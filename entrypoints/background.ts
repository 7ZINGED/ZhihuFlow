export default defineBackground(() => {
  console.log('知乎收藏夹 Pro · MoonDigest 后台服务已就绪');

  // 监听来自 content script 按钮点击的消息，由 background 权限打开标签页，避免 Edge/Chrome 客户端安全拦截
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.action === 'OPEN_DASHBOARD') {
      openDashboard();
      sendResponse({ success: true });
    }
  });

  // 点击右上角扩展图标时，唤起全屏分拣台 Dashboard
  chrome.action.onClicked.addListener(async (tab) => {
    await openDashboard();
  });

  async function openDashboard() {
    const url = chrome.runtime.getURL('dashboard.html');
    const tabs = await chrome.tabs.query({ url });
    if (tabs.length > 0 && tabs[0].id) {
      await chrome.tabs.update(tabs[0].id, { active: true });
    } else {
      await chrome.tabs.create({ url });
    }
  }
});
