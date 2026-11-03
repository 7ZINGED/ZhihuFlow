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
  isDeletedOrInvalid?: boolean; // 是否是已删除或失效失效内容

  // AI 摘读与观点分析结果 (类似 MoonDigest)
  aiSummary?: string;
  aiKeyTakeaways?: string[]; // 核心要点
  aiCategory?: string; // AI 推荐归类收藏夹
  aiTriageRating?: 'keep' | 'discard' | 'review'; // 分拣评级: 留存 / 弃置 / 待审
  aiTriageReason?: string; // 建议理由
  aiProcessedAt?: number;

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
  }
}

export const db = new ZhihuDigestDatabase();
