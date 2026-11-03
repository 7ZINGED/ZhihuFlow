import { type ZhihuArticleItem, type ZhihuCollection } from '../db';

/**
 * 抓取当前已登录知乎用户的 xsrf-token
 */
export async function getZhihuXsrfToken(): Promise<string> {
  const cookie = await chrome.cookies.get({
    url: 'https://www.zhihu.com',
    name: '_xsrf',
  });
  if (!cookie || !cookie.value) {
    throw new Error('未检测到知乎登录态 (_xsrf cookie 不存在)，请先在浏览器登录知乎！');
  }
  return cookie.value;
}

/**
 * 获取请求所需的 Headers
 */
export async function getZhihuHeaders(): Promise<HeadersInit> {
  const xsrf = await getZhihuXsrfToken();
  return {
    'Content-Type': 'application/json',
    'x-xsrftoken': xsrf,
    'x-requested-with': 'fetch',
  };
}

/**
 * 获取当前登录用户的基本信息及收藏夹列表
 */
export async function fetchUserCollectionsList(): Promise<ZhihuCollection[]> {
  const headers = await getZhihuHeaders();

  // 1. 获取当前用户个人主页 url_token / id
  const meRes = await fetch('https://www.zhihu.com/api/v4/me', { headers });
  if (!meRes.ok) {
    throw new Error(`获取知乎个人信息失败: HTTP ${meRes.status}`);
  }
  const meData = await meRes.json();
  const urlToken = meData.url_token || meData.id;

  // 2. 分页拉取该用户创建的所有收藏夹
  const collections: ZhihuCollection[] = [];
  let nextUrl: string | null = `https://www.zhihu.com/api/v4/members/${urlToken}/collections?offset=0&limit=20`;

  while (nextUrl) {
    const res = await fetch(nextUrl, { headers });
    if (!res.ok) break;
    const data = await res.json();
    if (Array.isArray(data.data)) {
      for (const item of data.data) {
        collections.push({
          id: String(item.id),
          title: item.title,
          itemCount: item.item_count || 0,
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
      throw new Error(`获取收藏夹内容失败 [HTTP ${res.status}]`);
    }
    const data = await res.json();
    if (Array.isArray(data.data)) {
      for (const raw of data.data) {
        const content = raw.content;
        if (!content) {
          // 处理失效、已被作者或知乎删除的内容
          articles.push({
            id: `${collectionId}_deleted_${raw.created_time || Math.random()}`,
            contentId: String(raw.created_time || 'deleted'),
            contentType: 'deleted',
            collectionId,
            collectionTitle,
            title: '（该内容已被原作者删除或已失效）',
            url: 'https://www.zhihu.com',
            isDeletedOrInvalid: true,
            createdTime: raw.created_time ? raw.created_time * 1000 : Date.now(),
          });
          continue;
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

        // 正文清洗提取 (提取 text 纯文本)
        let cleanText = '';
        if (content.content) {
          cleanText = content.content.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
        } else if (content.excerpt) {
          cleanText = content.excerpt.replace(/<[^>]+>/g, '').trim();
        }

        articles.push({
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
        });
      }
    }

    if (onProgress) {
      onProgress(articles.length);
    }

    nextUrl = data.paging?.is_end ? null : data.paging?.next;
  }

  return articles;
}

/**
 * 抓取单篇内容的最新正文 (如果列表返回的 excerpt 不完整)
 */
export async function scrapeArticleFullText(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) return '正文抓取失败或需登录查看';
  const html = await res.text();
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const rich = doc.querySelector('.RichText.ztext');
  return rich ? (rich as HTMLElement).innerText.trim() : '正文提取失败';
}

/**
 * 将某条内容移动到目标收藏夹 (先加入目标，再从原收藏夹移除)
 */
export async function moveArticleBetweenCollections(
  contentId: string,
  contentType: string,
  sourceCollectionId: string,
  targetCollectionId: string
): Promise<void> {
  const headers = await getZhihuHeaders();

  // 1. 添加到目标收藏夹
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

  // 2. 从原收藏夹移除
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
 * 彻底取消收藏 (从指定收藏夹移除)
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
