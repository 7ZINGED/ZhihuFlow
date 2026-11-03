export default defineContentScript({
  matches: [
    '*://www.zhihu.com/collection/*',
    '*://www.zhihu.com/collections/mine*',
    '*://www.zhihu.com/people/*/collections*'
  ],
  main() {
    console.log('[ZhihuFlow] Content script injected.');

    const injectDashboardButton = () => {
      if (document.getElementById('zh-open-flow-btn')) return;

      const container = document.querySelector('.CollectionsHeader-mainContent') ||
                        document.querySelector('.Profile-main .Profile-sideColumn') ||
                        document.querySelector('.CollectionDetailPageHeader-actions');

      if (!container) return;

      const btn = document.createElement('button');
      btn.id = 'zh-open-flow-btn';
      btn.className = 'zh-flow-button';
      btn.innerHTML = `
        <svg style="width: 16px; height: 16px; margin-right: 6px; fill: currentColor;" viewBox="0 0 24 24">
          <path d="M19 9l1.25-2.75L23 5l-2.75-1.25L19 1l-1.25 2.75L15 5l2.75 1.25L19 9zm-7.5.5L9 4 6.5 9.5 1 12l5.5 2.5L9 20l2.5-5.5L17 12l-5.5-2.5zM19 15l-1.25 2.75L15 19l2.75 1.25L19 23l1.25-2.75L23 19l-2.75-1.25L19 15z"/>
        </svg>
        <span>打开知流分拣台</span>
      `;

      btn.style.cssText = `
        display: inline-flex;
        align-items: center;
        justify-content: center;
        height: 36px;
        background: linear-gradient(135deg, #056DE8 0%, #3B82F6 100%);
        color: white;
        border: none;
        border-radius: 12px;
        cursor: pointer;
        padding: 0 16px;
        margin-right: 12px;
        font-size: 14px;
        font-weight: 500;
        box-shadow: 0 2px 6px rgba(5, 109, 232, 0.25);
        transition: transform 0.15s ease, box-shadow 0.15s ease;
      `;

      btn.onmouseenter = () => {
        btn.style.transform = 'translateY(-1px)';
        btn.style.boxShadow = '0 4px 10px rgba(5, 109, 232, 0.35)';
      };
      btn.onmouseleave = () => {
        btn.style.transform = 'none';
        btn.style.boxShadow = '0 2px 6px rgba(5, 109, 232, 0.25)';
      };

      btn.onclick = () => {
        const dashboardUrl = chrome.runtime.getURL('dashboard.html');
        window.open(dashboardUrl, '_blank');
      };

      const addBtn = container.querySelector('.CollectionsHeader-addFavlistButton, .css-10dextj');
      if (addBtn) {
        container.insertBefore(btn, addBtn);
      } else {
        container.prepend(btn);
      }
    };

    injectDashboardButton();
    const observer = new MutationObserver(injectDashboardButton);
    observer.observe(document.body, { childList: true, subtree: true });
  },
});
