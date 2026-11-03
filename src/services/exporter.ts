import { type ZhihuArticleItem } from '../db';

/**
 * 将知乎收藏文章与 AI 分析提炼格式化为标准 Markdown
 */
export function formatArticleToMarkdown(article: ZhihuArticleItem): string {
  const dateStr = article.updatedTime
    ? new Date(article.updatedTime).toISOString().slice(0, 10)
    : new Date().toISOString().slice(0, 10);

  const takeaways = (article.aiKeyTakeaways || [])
    .map((k) => `- ${k}`)
    .join('\n');

  const ratingMap: Record<string, string> = {
    keep: '值得留',
    discard: '可清理',
    review: '不确定',
  };
  const ratingText = article.aiTriageRating ? (ratingMap[article.aiTriageRating] || article.aiTriageRating) : '未分拣';

  const customTags = (article.tags || []).map((t) => `  - ${t}`).join('\n');

  return `---
title: "${article.title.replace(/"/g, '\\"')}"
source: "${article.url}"
author: "${article.authorName || '知乎用户'}"
collection: "${article.collectionTitle}"
rating: "${ratingText}"
date: "${dateStr}"
tags:
  - 知乎收藏
  - ${article.collectionTitle}
  ${article.aiTriageRating ? `- 分拣/${ratingText}` : ''}
${customTags}
---

# ${article.title}

> 原文链接: [${article.title}](${article.url})  
> 作者: **${article.authorName || '知乎用户'}** | 收藏于: **${article.collectionTitle}** | 赞同数: ${article.voteupCount || 0}

---

## 💡 AI 智能摘读与核心观点
${article.aiSummary ? article.aiSummary : '*暂未进行 AI 摘要提炼*'}

${
  takeaways
    ? `### 核心要点
${takeaways}`
    : ''
}

${
  article.aiTriageReason
    ? `> **AI 分拣建议**: 【${ratingText}】${article.aiTriageReason}`
    : ''
}

${
  article.aiCommentsInsight && article.aiCommentsInsight !== '暂无关键争议补充'
    ? `> **💬 评论区焦点洞察**: ${article.aiCommentsInsight}`
    : ''
}

${
  article.hotComments && article.hotComments.length > 0
    ? `### 💬 评论区高赞神评 Top 5
${article.hotComments.map((c) => `- ${c}`).join('\n')}`
    : ''
}

---

## 📖 正文内容备份
${article.fullContent || '*无完整正文文本或已失效*'}
`;
}

/**
 * 直接通过浏览器下载单个 Markdown 文件
 */
export function downloadMarkdownFile(article: ZhihuArticleItem): void {
  const content = formatArticleToMarkdown(article);
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  // 过滤文件名非法字符
  const safeTitle = article.title.replace(/[\\/:*?"<>|]/g, '_').slice(0, 40);
  a.href = url;
  a.download = `${safeTitle}.md`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * 通过 Obsidian URI 协议将文档直接写入用户的 Obsidian 库
 * 协议格式: obsidian://new?vault=VaultName&file=Path&content=...
 */
export function sendToObsidian(
  article: ZhihuArticleItem,
  vaultName: string = '',
  folderPath: string = '知乎收藏'
): void {
  const safeTitle = article.title.replace(/[\\/:*?"<>|]/g, '_').slice(0, 40);
  const filePath = folderPath ? `${folderPath}/${safeTitle}` : safeTitle;
  const content = formatArticleToMarkdown(article);

  const query = new URLSearchParams();
  if (vaultName) {
    query.set('vault', vaultName);
  }
  query.set('file', filePath);
  query.set('content', content);

  const obsidianUri = `obsidian://new?${query.toString()}`;
  window.open(obsidianUri, '_blank');
}

/**
 * 复制带排版的 Markdown 内容到剪贴板
 */
export async function copyMarkdownToClipboard(article: ZhihuArticleItem): Promise<void> {
  const content = formatArticleToMarkdown(article);
  await navigator.clipboard.writeText(content);
}
