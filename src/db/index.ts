import Dexie, { type Table } from 'dexie';

export interface ZhihuCollection {
  id: string; // 收藏夹 ID (纯数字字符串)
  title: string;
  itemCount?: number;
  description?: string;
  updatedTime?: number;
}

export interface ZhihuArticleItem {
  id: string; // 唯一 key: `${collectionId}_${contentId}`
  contentId: string;
  contentType: 'answer' | 'article' | 'pin' | string;
  collectionId: string;
  collectionTitle: string;
  title: string;
  authorName?: string;
  authorAvatar?: string;
  url: string;
  createdTime?: number;
  updatedTime?: number;
  voteupCount?: number;
  commentCount?: number;
  
  // 抓取到的完整正文
  fullContent?: string;
  isDeletedOrInvalid?: boolean; // 是否是已删除或失效内容

  // 标签体系 (MoonDigest 风格)
  tags?: string[];

  // AI 摘读与观点分析结果 (类似 MoonDigest)
  aiSummary?: string;
  aiKeyTakeaways?: string[]; // 核心要点
  aiCategory?: string; // AI 推荐归类收藏夹
  aiTriageRating?: 'keep' | 'discard' | 'review'; // 分拣评级: 值得留(keep) / 可清理(discard) / 不确定(review)
  aiTriageReason?: string; // 建议理由
  aiCommentsInsight?: string; // 评论区高赞焦点与争议洞察
  hotComments?: string[]; // 抓取到的热评/神评 Top 5
  aiProcessedAt?: number;

  // 已移出分拣范围 / 回收站状态
  inTrash?: boolean;
  trashedAt?: number;

  // 用户操作状态
  selected?: boolean;
  markedForDelete?: boolean;
}

export interface AISettings {
  endpoint: string; // 例如: https://api.deepseek.com/v1 或 http://127.0.0.1:11434/v1
  model: string;    // 例如: deepseek-chat 或 qwen2.5:7b
  apiKey: string;
  promptTemplate?: string;
}

export class ZhihuDigestDatabase extends Dexie {
  collections!: Table<ZhihuCollection, string>;
  articles!: Table<ZhihuArticleItem, string>;

  constructor() {
    super('ZhihuDigestDB');
    this.version(1).stores({
      collections: 'id, title, updatedTime',
      articles: 'id, contentId, collectionId, contentType, title, aiTriageRating, isDeletedOrInvalid, updatedTime',
    });
    this.version(2).stores({
      collections: 'id, title, updatedTime',
      articles: 'id, contentId, collectionId, contentType, title, aiTriageRating, inTrash, isDeletedOrInvalid, updatedTime',
    });
  }
}

export const db = new ZhihuDigestDatabase();
