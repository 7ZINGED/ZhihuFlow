export default defineBackground(() => {
  console.log('知乎收藏夹 Pro · MoonDigest 后台服务已就绪');

  // 点击右上角扩展图标时，默认直接唤起全屏分拣台 Dashboard
  chrome.action.onClicked.addListener(async (tab) => {
    const url = chrome.runtime.getURL('dashboard.html');
    const tabs = await chrome.tabs.query({ url });
    if (tabs.length > 0 && tabs[0].id) {
      await chrome.tabs.update(tabs[0].id, { active: true });
    } else {
      await chrome.tabs.create({ url });
    }
  });
});
