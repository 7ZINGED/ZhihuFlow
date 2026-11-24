import React from 'react';
import { Trash2, FolderOpen } from 'lucide-react';
import { ArticleCard } from './ArticleCard';
import { db } from '../db';
import type { ZhihuArticleItem, ZhihuCollection } from '../db';
import { moveArticleBetweenCollections } from '../services/zhihuApi';

interface ArticleListProps {
  filteredArticles: readonly ZhihuArticleItem[];
  collections: ZhihuCollection[];
  selectedIds: Set<string>;
  isTrashView: boolean;
  currentArticleId?: string;
  selectedTag: string;
  onSelectIds: (ids: Set<string>) => void;
  onSelectTag: (tag: string) => void;
  onQuickRead: (article: ZhihuArticleItem) => Promise<void>;
  onCategorize: (article: ZhihuArticleItem) => Promise<void>;
  onDeepRead: (article: ZhihuArticleItem) => Promise<void>;
  onMoveToTrash: (article: ZhihuArticleItem) => void;
  onRestore: (article: ZhihuArticleItem) => void;
  onPermanentDelete: (article: ZhihuArticleItem) => void;
}

export const ArticleList: React.FC<ArticleListProps> = (props) => {
  const {
    filteredArticles, collections, selectedIds, isTrashView, currentArticleId, selectedTag,
    onSelectIds, onSelectTag, onQuickRead, onCategorize, onDeepRead,
    onMoveToTrash, onRestore, onPermanentDelete,
  } = props;
  return (
    <div className="flex-1 overflow-y-auto p-6">
              {filteredArticles.length === 0 ? (
    <div className="h-full flex flex-col items-center justify-center text-slate-400 dark:text-slate-600 space-y-3">
      <div className="w-16 h-16 rounded-3xl bg-slate-100 dark:bg-slate-900 flex items-center justify-center text-slate-300 dark:text-slate-700">
        {isTrashView ? <Trash2 className="w-8 h-8" /> : <FolderOpen className="w-8 h-8" />}
      </div>
      <p className="text-sm">
        {isTrashView
          ? '回收站为空，移出分拣范围的内容会在此暂存'
          : '暂无内容，请在左侧收藏夹点击刷新拉取'}
      </p>
    </div>
              ) : (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {filteredArticles.map((article) => (
        <ArticleCard
          key={article.id}
          article={article}
          collections={collections}
          isSelected={selectedIds.has(article.id)}
          isTrashView={isTrashView}
          isQueueProcessing={currentArticleId === article.id}
          onSelect={(sel) => {
            const next = new Set(selectedIds);
            sel ? next.add(article.id) : next.delete(article.id);
            onSelectIds(next);
          }}
          onQuickRead={() => onQuickRead(article)}
          onCategorize={() => onCategorize(article)}
          onDeepRead={() => onDeepRead(article)}
          onMove={async (targetColId) => {
            await moveArticleBetweenCollections(
              article.contentId,
              article.contentType,
              article.collectionId,
              targetColId
            );
            await db.articles.delete(article.id);
          }}
          onRemove={async () => {
            // 移入回收站
            onMoveToTrash(article);
          }}
          onRestore={async () => {
            // 从回收站恢复
            onRestore(article);
          }}
          onPermanentDelete={async () => {
            // 彻底删除
            onPermanentDelete(article);
          }}
          onUpdateRating={async (rating) => {
            await db.articles.update(article.id, { aiTriageRating: rating });
          }}
          onUpdateTags={async (tags) => {
            await db.articles.update(article.id, { tags });
          }}
          onTagClick={(tag) => {
            onSelectTag(selectedTag === tag ? '' : tag);
          }}
        />
      ))}
    </div>
              )}
    </div>
  );
};