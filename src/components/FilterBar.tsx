import React from 'react';
import { Search, Clock, CheckCircle2, XCircle, HelpCircle, Tag, AlertTriangle } from 'lucide-react';
import type { ZhihuArticleItem } from '../db';

type RatingFilter = 'all' | 'untriaged' | 'keep' | 'discard' | 'review' | 'uncategorized' | 'invalid';

interface FilterBarProps {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  filterRating: RatingFilter;
  onRatingChange: (value: RatingFilter) => void;
  currentPool: readonly ZhihuArticleItem[];
}

export const FilterBar: React.FC<FilterBarProps> = ({
  searchQuery,
  onSearchChange,
  filterRating,
  onRatingChange,
  currentPool,
}) => (
  <div className="glass-panel shrink-0 border-b border-slate-200/80 dark:border-slate-800 px-6 py-3.5 flex items-center justify-between gap-4">
    <div className="relative flex-1 max-w-md">
      <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400 dark:text-slate-500" />
      <input
        type="text"
        value={searchQuery}
        onChange={(e) => onSearchChange(e.target.value)}
        placeholder="搜索标题、作者、AI核心观点、标签..."
        className="w-full pl-9 pr-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-white/80 dark:bg-slate-900/80 text-xs text-slate-800 dark:text-slate-100"
      />
    </div>

    {/* 状态筛选药丸标签 (全部 / 待粗读 / 值得留 / 可清理 / 不确定 / 未打标 / 已失效) */}
    <div className="flex items-center gap-1.5 bg-slate-100/80 dark:bg-slate-900/80 p-1 rounded-xl text-xs flex-wrap">
      <button
        onClick={() => onRatingChange('all')}
        className={`px-2.5 py-1 rounded-lg font-medium transition ${
          filterRating === 'all'
            ? 'bg-white dark:bg-slate-800 shadow-sm text-slate-900 dark:text-slate-100'
            : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
        }`}
      >
        全部 ({currentPool.length})
      </button>
      <button
        onClick={() => onRatingChange('untriaged')}
        className={`flex items-center gap-1 px-2.5 py-1 rounded-lg font-medium transition ${
          filterRating === 'untriaged'
            ? 'bg-blue-600 text-white shadow-sm'
            : 'text-slate-500 dark:text-slate-400 hover:text-blue-600'
        }`}
        title="尚未经过 AI 快速粗读评级的内容"
      >
        <Clock className="w-3 h-3" />
        待粗读 ({currentPool.filter((a) => !a.aiTriageRating && !a.isDeletedOrInvalid).length})
      </button>
      <button
        onClick={() => onRatingChange('keep')}
        className={`flex items-center gap-1 px-2.5 py-1 rounded-lg font-medium transition ${
          filterRating === 'keep' ? 'bg-emerald-500 text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-emerald-600'
        }`}
      >
        <CheckCircle2 className="w-3 h-3" />
        值得留 ({currentPool.filter((a) => a.aiTriageRating === 'keep').length})
      </button>
      <button
        onClick={() => onRatingChange('discard')}
        className={`flex items-center gap-1 px-2.5 py-1 rounded-lg font-medium transition ${
          filterRating === 'discard' ? 'bg-rose-500 text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-rose-600'
        }`}
      >
        <XCircle className="w-3 h-3" />
        可清理 ({currentPool.filter((a) => a.aiTriageRating === 'discard').length})
      </button>
      <button
        onClick={() => onRatingChange('review')}
        className={`flex items-center gap-1 px-2.5 py-1 rounded-lg font-medium transition ${
          filterRating === 'review' ? 'bg-amber-500 text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-amber-600'
        }`}
      >
        <HelpCircle className="w-3 h-3" />
        不确定 ({currentPool.filter((a) => a.aiTriageRating === 'review').length})
      </button>
      <button
        onClick={() => onRatingChange('uncategorized')}
        className={`flex items-center gap-1 px-2.5 py-1 rounded-lg font-medium transition ${
          filterRating === 'uncategorized'
            ? 'bg-indigo-600 text-white shadow-sm'
            : 'text-slate-500 dark:text-slate-400 hover:text-indigo-600'
        }`}
        title="尚未打上 AI 词条分类标签的内容"
      >
        <Tag className="w-3 h-3" />
        未打标 ({currentPool.filter((a) => (!a.tags || a.tags.length === 0) && !a.isDeletedOrInvalid).length})
      </button>
      <button
        onClick={() => onRatingChange('invalid')}
        className={`flex items-center gap-1 px-2.5 py-1 rounded-lg font-medium transition ${
          filterRating === 'invalid' ? 'bg-red-500 text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-red-600'
        }`}
      >
        <AlertTriangle className="w-3 h-3" />
        已失效 ({currentPool.filter((a) => a.isDeletedOrInvalid).length})
      </button>
    </div>
  </div>
);
