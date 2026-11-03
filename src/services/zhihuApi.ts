import { type ZhihuArticleItem, type ZhihuCollection } from '../db';

/**
 * 抓取当前已登录知乎用户的 xsrf-token
 */
export async function getZhihuXsrfToken(): Promise<string> {
  const cookie = await chrome.cookies.get({
    url: 'https://www.zhihu.com',
    name: '_xsrf',
  });
  return cookie?.value || '';
}

/**
 * 获取请求所需的 Headers
 */
export async function getZhihuHeaders(): Promise<HeadersInit> {
  const xsrf = await getZhihuXsrfToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-requested-with': 'fetch',
  };
  if (xsrf) {
    headers['x-xsrftoken'] = xsrf;
  }
  return headers;
}

/**
 * 从当前打开的知乎页面标签中直接提取收藏夹列表（100% 成功，不受 x-zse-96 签名拦截）
 */
export async function scrapeCollectionsFromActiveTab(): Promise<ZhihuCollection[]> {
  const tabs = await chrome.tabs.query({ url: '*://www.zhihu.com/*' });
  if (tabs.length === 0 || !tabs[0].id) {
    throw new Error('未检测到已打开的知乎页面，请先在浏览器任意标签页打开知乎！');
  }

  const results = await chrome.scripting.executeScript({
    target: { tabId: tabs[0].id },
    func: () => {
      // 1. 尝试直接从页面 HTML DOM 提取
      const items = document.querySelectorAll('.SelfCollectionItem-innerContainer, .CollectionsItem, .Favlists-item');
      if (items.length > 0) {
        const list: any[] = [];
        items.forEach((item) => {
          const titleEl = item.querySelector('a.SelfCollectionItem-title, .Favlists-itemTitle a, h2 a');
          const descEl = item.querySelector('.SelfCollectionItem-description, .Favlists-itemDesc');
          const metaEl = item.querySelector('.SelfCollectionItem-meta, .Favlists-itemMeta');

          if (titleEl) {
            const url = (titleEl as HTMLAnchorElement).href;
            const match = url.match(/\/collection\/(\d+)/);
            if (match) {
              const id = match[1];
              const title = titleEl.textContent?.trim() || '未命名收藏夹';
              let count = 0;
              if (metaEl) {
                const countMatch = metaEl.textContent?.match(/(\d+)\s*条内容/);
                if (countMatch) count = parseInt(countMatch[1], 10);
              }
              list.push({
                id,
                title,
                itemCount: count,
                description: descEl?.textContent?.trim() || '',
                updatedTime: Date.now(),
              });
            }
          }
        });
        if (list.length > 0) return list;
      }

      // 2. 备用方式：从知乎网页全局初始数据提取 (window.__INITIAL_STATE__)
      try {
        const state = (window as any).__INITIAL_STATE__;
        if (state?.entities?.favlists) {
          return Object.values(state.entities.favlists).map((fav: any) => ({
            id: String(fav.id),
            title: fav.title,
            itemCount: fav.item_count || fav.items_count || 0,
            description: fav.description || '',
            updatedTime: fav.updated_time ? fav.updated_time * 1000 : Date.now(),
          }));
        }
      } catch (e) {
        console.warn('提取 initial state 失败', e);
      }

      return null;
    },
  });

  const scraped = results?.[0]?.result;
  if (Array.isArray(scraped) && scraped.length > 0) {
    return scraped as ZhihuCollection[];
  }

  return [];
}

/**
 * 获取当前登录用户的收藏夹列表 (双模驱动：DOM 页面提取优先，API 回退)
 */
export async function fetchUserCollectionsList(): Promise<ZhihuCollection[]> {
  // 1. 优先从打开的知乎标签页直接读取（最精准，包含条目数）
  try {
    const list = await scrapeCollectionsFromActiveTab();
    if (list.length > 0) {
      console.log('[ZhihuFlow] 成功从知乎页面直接获取收藏夹列表:', list);
      return list;
    }
  } catch (err) {
    console.warn('[ZhihuFlow] 标签页 DOM 提取未命中，尝试 API 获取...', err);
  }

  // 2. API 请求获取
  const headers = await getZhihuHeaders();
  const meRes = await fetch('https://www.zhihu.com/api/v4/me', { headers });
  if (!meRes.ok) {
    throw new Error('未检测到知乎登录态，请先在浏览器中登录知乎！');
  }
  const meData = await meRes.json();
  const urlToken = meData.url_token || meData.id;

  const collections: ZhihuCollection[] = [];
  let nextUrl: string | null = `https://www.zhihu.com/api/v4/members/${urlToken}/collections?offset=0&limit=20`;

  while (nextUrl) {
    const res = await fetch(nextUrl, { headers });
    if (!res.ok) break;
    const data = await res.json();
    if (Array.isArray(data.data)) {
      for (const item of data.data) {
        const count = item.item_count ?? item.items_count ?? item.itemCount ?? item.total_count ?? 0;
        collections.push({
          id: String(item.id),
          title: item.title,
          itemCount: count,
          description: item.description || '',
          updatedTime: item.updated_time ? item.updated_time * 1000 : Date.now(),
        });
      }
    }
    nextUrl = data.paging?.is_end ? null : data.paging?.next;
  }

  return collections;
}

/**
 * 分页拉取单个收藏夹下的所有收藏内容条目
 */
export async function fetchCollectionContents(
  collectionId: string,
  collectionTitle: string,
  onProgress?: (loaded: number) => void
): Promise<ZhihuArticleItem[]> {
  const headers = await getZhihuHeaders();
  const articles: ZhihuArticleItem[] = [];
  let nextUrl: string | null = `https://www.zhihu.com/api/v4/collections/${collectionId}/items?offset=0&limit=20`;

  while (nextUrl) {
    const res = await fetch(nextUrl, { headers });
    if (!res.ok) {
      // 备用接口 /contents
      const backupRes = await fetch(`https://www.zhihu.com/api/v4/collections/${collectionId}/contents?offset=0&limit=20`, { headers });
      if (!backupRes.ok) {
        throw new Error(`获取收藏夹内容失败 [HTTP ${res.status}]，可能触发知乎风控，请刷新知乎网页后重试。`);
      }
      const bData = await backupRes.json();
      if (Array.isArray(bData.data)) {
        for (const raw of bData.data) {
          articles.push(formatRawContent(raw, collectionId, collectionTitle));
        }
      }
      break;
    }

    const data = await res.json();
    if (Array.isArray(data.data)) {
      for (const raw of data.data) {
        articles.push(formatRawContent(raw, collectionId, collectionTitle));
      }
    }

    if (onProgress) {
      onProgress(articles.length);
    }

    nextUrl = data.paging?.is_end ? null : data.paging?.next;
  }

  return articles;
}

function formatRawContent(raw: any, collectionId: string, collectionTitle: string): ZhihuArticleItem {
  const content = raw.content;
  if (!content) {
    return {
      id: `${collectionId}_deleted_${raw.created_time || Math.random()}`,
      contentId: String(raw.created_time || 'deleted'),
      contentType: 'deleted',
      collectionId,
      collectionTitle,
      title: '（该内容已被原作者删除或已失效）',
      url: 'https://www.zhihu.com',
      isDeletedOrInvalid: true,
      createdTime: raw.created_time ? raw.created_time * 1000 : Date.now(),
    };
  }

  const isQuestionAnswer = content.type === 'answer';
  const title = isQuestionAnswer
    ? content.question?.title || '知乎问答'
    : content.title || '知乎专栏/文章';

  const authorName = content.author?.name || '匿名用户';
  const authorAvatar = content.author?.avatar_url || '';
  const url = content.url
    ? content.url.replace(/^http:/, 'https:')
    : `https://www.zhihu.com/${content.type}/${content.id}`;

  let cleanText = '';
  if (content.content) {
    cleanText = content.content.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
  } else if (content.excerpt) {
    cleanText = content.excerpt.replace(/<[^>]+>/g, '').trim();
  }

  return {
    id: `${collectionId}_${content.id}`,
    contentId: String(content.id),
    contentType: content.type,
    collectionId,
    collectionTitle,
    title,
    authorName,
    authorAvatar,
    url,
    createdTime: content.created_time ? content.created_time * 1000 : raw.created_time * 1000,
    updatedTime: content.updated_time ? content.updated_time * 1000 : Date.now(),
    voteupCount: content.voteup_count || 0,
    commentCount: content.comment_count || 0,
    fullContent: cleanText,
    isDeletedOrInvalid: false,
  };
}

/**
 * 将某条内容移动到目标收藏夹
 */
export async function moveArticleBetweenCollections(
  contentId: string,
  contentType: string,
  sourceCollectionId: string,
  targetCollectionId: string
): Promise<void> {
  const headers = await getZhihuHeaders();

  const addRes = await fetch(
    `https://www.zhihu.com/api/v4/collections/${targetCollectionId}/contents?content_id=${contentId}&content_type=${contentType}`,
    {
      method: 'POST',
      headers,
      body: '{}',
    }
  );
  if (!addRes.ok) {
    const err = await addRes.text();
    throw new Error(`移动添加至目标收藏夹失败: ${err}`);
  }

  const rmRes = await fetch(
    `https://www.zhihu.com/api/v4/collections/${sourceCollectionId}/contents/${contentId}?content_type=${contentType}`,
    {
      method: 'DELETE',
      headers,
    }
  );
  if (!rmRes.ok) {
    const err = await rmRes.text();
    throw new Error(`从原收藏夹移出失败: ${err}`);
  }
}

/**
 * 彻底取消收藏
 */
export async function removeArticleFromCollection(
  contentId: string,
  contentType: string,
  collectionId: string
): Promise<void> {
  const headers = await getZhihuHeaders();
  const res = await fetch(
    `https://www.zhihu.com/api/v4/collections/${collectionId}/contents/${contentId}?content_type=${contentType}`,
    {
      method: 'DELETE',
      headers,
    }
  );
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`取消收藏失败: ${err}`);
  }
}
