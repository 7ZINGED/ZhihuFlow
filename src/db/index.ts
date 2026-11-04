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

  // AI 摘读与观点分析结果 (三阶段递进：粗读 -> 分类 -> 精读)
  aiSummary?: string;
  aiKeyTakeaways?: string[]; // 核心要点
  aiCategory?: string; // AI 推荐归类收藏夹
  aiCategoryReason?: string; // 归类理由
  aiTriageRating?: 'keep' | 'discard' | 'review'; // 分拣评级: 值得留(keep) / 可清理(discard) / 不确定(review)
  aiTriageReason?: string; // 建议理由
  aiCommentsInsight?: string; // 评论区高赞焦点与争议洞察
  hotComments?: string[]; // 抓取到的热评/神评 Top 5
  aiProcessedAt?: number; // 阶段1: 粗读初筛完成时间
  aiClassifiedAt?: number; // 阶段2: 词条分类与标签完成时间
  aiDeepReadAt?: number; // 阶段3: 全文精读完成时间

  // 粗读与深读模式状态 (MoonDigest 风格)
  aiReadingMode?: 'quick' | 'deep'; // 'quick' 粗读 (正文3000字截断) | 'deep' 深读 (全文无限制+热评Top5)
  isTruncated?: boolean; // 粗读时是否因超过3000字截断未读完全文
  totalWordCount?: number; // 全文字数统计

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
  customTriagePrompt?: string;     // 分拣筛选自定义提示词 (值得留/可清理/不确定评级标准)
  customCategorizePrompt?: string; // 词条分类与标签提取自定义提示词
  maxTagCount?: number;            // AI 生成标签数量上限 (1 ~ 5，默认 2)
  allowModifyTags?: boolean;        // 重新分类时允许覆盖修改已有标签 (默认 true)
  allowModifyDescription?: boolean; // AI 分类时允许生成/修改文章摘要描述 (默认 true)
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
