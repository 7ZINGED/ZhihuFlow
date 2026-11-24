import React from 'react';
import { CheckSquare, Square, Sparkles, Tag, BookOpen, Trash2, RotateCcw } from 'lucide-react';
import type { ZhihuArticleItem, ZhihuCollection } from '../db';

type AIMode = 'quick' | 'categorize' | 'deep';

interface BatchActionBarProps {
  selectedIds: Set<string>;
  filteredArticles: readonly ZhihuArticleItem[];
  syncProgress: string;
  isTrashView: boolean;
  loading: boolean;
  collections: readonly ZhihuCollection[];
  onToggleSelectAll: () => void;
  onBatchAI: (mode: AIMode) => void;
  onBatchMove: (targetColId: string) => void;
  onBatchMoveToTrash: () => void;
  onBatchRestore: () => void;
  onBatchPermanentDelete: () => void;
}

export const BatchActionBar: React.FC<BatchActionBarProps> = (props) => {
  const {
    selectedIds, filteredArticles, syncProgress, isTrashView, loading, collections,
    onToggleSelectAll, onBatchAI, onBatchMove, onBatchMoveToTrash, onBatchRestore, onBatchPermanentDelete,
  } = props;
  return (
  <div className="px-6 py-2.5 bg-slate-100/40 dark:bg-slate-900/40 border-b border-slate-200/50 dark:border-slate-800 flex items-center justify-between text-xs">
    <div className="flex items-center gap-3">
      <button
        onClick={onToggleSelectAll}
        className="flex items-center gap-1.5 font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100"
      >
        {selectedIds.size === filteredArticles.length && filteredArticles.length > 0 ? (
          <CheckSquare className="w-4 h-4 text-blue-600 dark:text-blue-400" />
        ) : (
          <Square className="w-4 h-4 text-slate-400 dark:text-slate-600" />
        )}
        <span>
          已选 {selectedIds.size} / {filteredArticles.length} 项
        </span>
      </button>
      {syncProgress && (
        <span className="text-blue-600 dark:text-blue-400 animate-pulse font-medium">
          {syncProgress}
        </span>
      )}
    </div>

    {selectedIds.size > 0 && (
      <div className="flex items-center gap-2 animate-fade-in">
        {!isTrashView ? (
          <>
            <button
              onClick={() => onBatchAI('quick')}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/60 font-medium transition text-xs"
              title="【阶段1·初筛】正文限前3000字，评级分拣(留/删/疑)，不打标签"
            >
              <Sparkles className="w-3.5 h-3.5" />
              1. 批量粗读初筛
            </button>

            <button
              onClick={() => onBatchAI('categorize')}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/60 font-medium transition text-xs"
              title="【阶段2·分类】归档推荐与规范打标，优先收敛已有标签池，严格限制1~2个标签"
            >
              <Tag className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
              2. 批量词条分类
            </button>

            <button
              onClick={() => onBatchAI('deep')}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 font-medium transition text-xs"
              title="【阶段3·精读】正文全文不限字数深度解析，抓取知乎高赞热评Top 5深入排坑"
            >
              <BookOpen className="w-3.5 h-3.5 text-indigo-500" />
              3. 批量全文精读
            </button>

            <select
              onChange={(e) => {
                if (e.target.value) {
                  onBatchMove(e.target.value);
                  e.target.value = '';
                }
              }}
              defaultValue=""
              className="px-2.5 py-1.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xs font-medium focus:outline-none"
            >
              <option value="" disabled>
                移动到收藏夹...
              </option>
              {collections.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>

            <button
              onClick={onBatchMoveToTrash}
              disabled={loading}
              className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-900/60 font-medium transition"
              title="移出分拣范围放入回收站（不直接删除知乎线上收藏）"
            >
              <Trash2 className="w-3.5 h-3.5" />
              移出分拣 (入回收站)
            </button>
          </>
        ) : (
          <>
            <button
              onClick={onBatchRestore}
              disabled={loading}
              className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 font-medium transition"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              批量恢复回分拣台
            </button>

            <button
              onClick={onBatchPermanentDelete}
              disabled={loading}
              className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-red-600 text-white hover:bg-red-700 font-medium transition shadow-sm"
              title="彻底从知乎线上取消收藏并从本地彻底删除"
            >
              <Trash2 className="w-3.5 h-3.5" />
              彻底从知乎删除
            </button>
          </>
        )}
      </div>
    )}
  </div>
  );
};
