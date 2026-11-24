import React from 'react';
import { Tag, X, Trash2 } from 'lucide-react';

interface TagFilterBarProps {
  availableTags: string[];
  selectedTag: string;
  onSelectTag: (tag: string) => void;
  tagFrequency: Record<string, number>;
  onRemoveTag: (tag: string, e: React.MouseEvent) => void;
  onClearAll: () => void;
}

export const TagFilterBar: React.FC<TagFilterBarProps> = ({
  availableTags, selectedTag, onSelectTag, tagFrequency, onRemoveTag, onClearAll,
}) => {
  if (availableTags.length === 0) return null;
  return (
            <div className="px-6 py-2 bg-slate-50/80 dark:bg-slate-900/40 border-b border-slate-200/60 dark:border-slate-800 flex items-center justify-between gap-3 text-xs">
  <div className="flex items-center gap-1.5 overflow-x-auto py-0.5 min-w-0 pr-2">
    <span className="text-[11px] text-slate-400 font-semibold flex items-center gap-1 shrink-0">
      <Tag className="w-3 h-3 text-indigo-500" /> 标签筛选 ({availableTags.length}个):
    </span>
    <button
      onClick={() => onSelectTag('')}
      className={`px-2 py-0.5 rounded-md text-[11px] font-medium transition shrink-0 ${
        !selectedTag
          ? 'bg-blue-600 text-white shadow-sm'
          : 'bg-slate-200/60 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-300/60'
      }`}
    >
      全部
    </button>
    {availableTags.map((tag) => {
      const count = tagFrequency[tag] || 0;
      return (
        <div
          key={tag}
          onClick={() => onSelectTag(selectedTag === tag ? '' : tag)}
          className={`group/topTag px-2 py-0.5 rounded-md text-[11px] font-medium transition shrink-0 flex items-center gap-1 cursor-pointer select-none ${
            selectedTag === tag
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'bg-white dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 border border-slate-200/60 dark:border-slate-700 hover:border-indigo-300 hover:text-indigo-600'
          }`}
        >
          <span>#{tag}</span>
          <span className="opacity-70 text-[10px]">({count})</span>
          <button
            onClick={(e) => onRemoveTag(tag, e)}
            className="opacity-0 group-hover/topTag:opacity-100 hover:text-rose-500 transition ml-0.5"
            title="从所有文章中移除此标签"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      );
    })}
  </div>

  {/* 右侧全局标签清理按钮 */}
  <div className="shrink-0 flex items-center gap-1.5">
    <button
      onClick={onClearAll}
      className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-rose-200 dark:border-rose-900/60 bg-rose-50/70 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 hover:bg-rose-100 transition text-[11px] font-medium"
      title="清空当前所有文章的历史标签，彻底解决标签膨胀，以便重新规范分类"
    >
      <Trash2 className="w-3 h-3" />
      <span>清空全部旧标签</span>
    </button>
  </div>
  </div>
  );
};