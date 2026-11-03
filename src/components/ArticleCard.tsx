import React, { useState } from 'react';
import { 
  Sparkles, 
  ExternalLink, 
  Trash2, 
  FolderInput, 
  FileDown, 
  CheckCircle2, 
  XCircle, 
  HelpCircle, 
  AlertTriangle,
  Copy,
  Check,
  Share2,
  Tag,
  Plus,
  X,
  RotateCcw,
  ChevronDown,
  MessageSquareQuote
} from 'lucide-react';
import { type ZhihuArticleItem, type ZhihuCollection } from '../db';
import { copyMarkdownToClipboard, downloadMarkdownFile, sendToObsidian } from '../services/exporter';

interface ArticleCardProps {
  article: ZhihuArticleItem;
  collections: ZhihuCollection[];
  isSelected: boolean;
  isTrashView?: boolean;
  onSelect: (selected: boolean) => void;
  onTriageAI: () => Promise<void>;
  onMove: (targetCollectionId: string) => Promise<void>;
  onRemove: () => Promise<void>; // 移出分拣范围 (入回收站)
  onRestore?: () => Promise<void>; // 从回收站恢复
  onPermanentDelete?: () => Promise<void>; // 彻底从知乎线上删除
  onUpdateRating: (rating: 'keep' | 'discard' | 'review') => Promise<void>;
  onUpdateTags: (tags: string[]) => Promise<void>;
  onTagClick?: (tag: string) => void;
}

export const ArticleCard: React.FC<ArticleCardProps> = ({
  article,
  collections,
  isSelected,
  isTrashView = false,
  onSelect,
  onTriageAI,
  onMove,
  onRemove,
  onRestore,
  onPermanentDelete,
  onUpdateRating,
  onUpdateTags,
  onTagClick,
}) => {
  const [analyzing, setAnalyzing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showMoveSelect, setShowMoveSelect] = useState(false);
  const [showRatingMenu, setShowRatingMenu] = useState(false);

  // 打标签状态
  const [isAddingTag, setIsAddingTag] = useState(false);
  const [tagInput, setTagInput] = useState('');

  const handleCopy = async () => {
    await copyMarkdownToClipboard(article);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleAI = async () => {
    setAnalyzing(true);
    try {
      await onTriageAI();
    } finally {
      setAnalyzing(false);
    }
  };

  const handleAddTagSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const clean = tagInput.trim().replace(/^#+/, '');
    if (!clean) {
      setIsAddingTag(false);
      return;
    }
    const current = article.tags || [];
    if (!current.includes(clean)) {
      await onUpdateTags([...current, clean]);
    }
    setTagInput('');
    setIsAddingTag(false);
  };

  const handleRemoveTag = async (t: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const current = article.tags || [];
    await onUpdateTags(current.filter((item) => item !== t));
  };

  const isInvalid = article.isDeletedOrInvalid;

  return (
    <div
      className={`glass-card group rounded-2xl p-4 transition-all duration-200 border ${
        isSelected
          ? 'border-blue-500 ring-2 ring-blue-500/20 bg-blue-50/20 dark:bg-blue-950/20 dark:border-blue-500'
          : isInvalid
          ? 'border-red-200 bg-red-50/20 dark:border-red-900/50 dark:bg-red-950/20 opacity-80'
          : isTrashView
          ? 'border-slate-200/80 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40 opacity-90'
          : 'border-slate-100 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 hover:shadow-md'
      }`}
    >
      {/* 顶部元数据与分拣状态 */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={(e) => onSelect(e.target.checked)}
            className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 dark:bg-slate-800 text-blue-600 focus:ring-blue-500 cursor-pointer"
          />
          <span className="text-xs px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-medium">
            {article.collectionTitle}
          </span>
          {isInvalid && (
            <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-md bg-red-100 dark:bg-red-950/60 text-red-600 dark:text-red-400 font-medium">
              <AlertTriangle className="w-3 h-3" /> 已失效/已删除
            </span>
          )}

          {/* 交互式分拣状态 (值得留 / 可清理 / 不确定) */}
          <div className="relative">
            <button
              onClick={() => setShowRatingMenu(!showRatingMenu)}
              className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-md font-medium transition cursor-pointer hover:opacity-90 ${
                article.aiTriageRating === 'keep'
                  ? 'bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300'
                  : article.aiTriageRating === 'discard'
                  ? 'bg-rose-100 dark:bg-rose-950/70 text-rose-700 dark:text-rose-300'
                  : article.aiTriageRating === 'review'
                  ? 'bg-amber-100 dark:bg-amber-950/70 text-amber-700 dark:text-amber-300'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-700'
              }`}
              title="点击调整分拣评级"
            >
              {article.aiTriageRating === 'keep' && <CheckCircle2 className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />}
              {article.aiTriageRating === 'discard' && <XCircle className="w-3 h-3 text-rose-600 dark:text-rose-400" />}
              {article.aiTriageRating === 'review' && <HelpCircle className="w-3 h-3 text-amber-600 dark:text-amber-400" />}
              <span>
                {article.aiTriageRating === 'keep'
                  ? '值得留'
                  : article.aiTriageRating === 'discard'
                  ? '可清理'
                  : article.aiTriageRating === 'review'
                  ? '不确定'
                  : '+ 分拣评级'}
              </span>
              <ChevronDown className="w-2.5 h-2.5 opacity-60" />
            </button>

            {/* 分拣评级下拉切换 */}
            {showRatingMenu && (
              <div className="absolute left-0 top-full mt-1 w-32 bg-white dark:bg-slate-800 shadow-xl rounded-xl border border-slate-100 dark:border-slate-700 py-1 z-30 animate-fade-in text-xs">
                <button
                  onClick={async () => {
                    setShowRatingMenu(false);
                    await onUpdateRating('keep');
                  }}
                  className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 text-left"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>值得留</span>
                </button>
                <button
                  onClick={async () => {
                    setShowRatingMenu(false);
                    await onUpdateRating('discard');
                  }}
                  className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-rose-50 dark:hover:bg-rose-950/30 text-rose-700 dark:text-rose-300 text-left"
                >
                  <XCircle className="w-3.5 h-3.5" />
                  <span>可清理</span>
                </button>
                <button
                  onClick={async () => {
                    setShowRatingMenu(false);
                    await onUpdateRating('review');
                  }}
                  className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-amber-50 dark:hover:bg-amber-950/30 text-amber-700 dark:text-amber-300 text-left"
                >
                  <HelpCircle className="w-3.5 h-3.5" />
                  <span>不确定</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* 右侧微型快捷工具条 */}
        <div className="flex items-center gap-1 opacity-70 group-hover:opacity-100 transition-opacity">
          <button
            onClick={handleCopy}
            title="复制 Markdown"
            className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={() => downloadMarkdownFile(article)}
            title="导出 .md 文件"
            className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition"
          >
            <FileDown className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => sendToObsidian(article)}
            title="写入 Obsidian"
            className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-purple-600 dark:text-purple-400 hover:text-purple-800 dark:hover:text-purple-300 transition"
          >
            <Share2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 标题 */}
      <h3 className="mt-2.5 font-semibold text-slate-900 dark:text-slate-100 text-sm leading-snug line-clamp-2">
        <a
          href={article.url}
          target="_blank"
          rel="noreferrer"
          className="hover:text-blue-600 dark:hover:text-blue-400 hover:underline flex items-baseline gap-1"
        >
          {article.title}
          <ExternalLink className="w-3 h-3 inline-block shrink-0 opacity-40" />
        </a>
      </h3>

      {/* 标签展示与打标签功能 (MoonDigest 风格) */}
      <div className="mt-2 flex items-center gap-1.5 flex-wrap">
        {(article.tags || []).map((t) => (
          <span
            key={t}
            onClick={() => onTagClick?.(t)}
            className="group/tag inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-blue-50 dark:hover:bg-blue-950/60 hover:text-blue-600 dark:hover:text-blue-400 cursor-pointer transition"
          >
            <Tag className="w-2.5 h-2.5 opacity-60" />
            <span>{t}</span>
            <button
              onClick={(e) => handleRemoveTag(t, e)}
              className="opacity-0 group-hover/tag:opacity-100 hover:text-rose-500 transition ml-0.5"
              title="删除此标签"
            >
              <X className="w-2.5 h-2.5" />
            </button>
          </span>
        ))}

        {isAddingTag ? (
          <form onSubmit={handleAddTagSubmit} className="inline-flex items-center gap-1">
            <input
              type="text"
              autoFocus
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              placeholder="标签名..."
              className="w-20 px-1.5 py-0.5 text-[11px] rounded border border-blue-400 dark:border-blue-500 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:outline-none"
              onBlur={() => handleAddTagSubmit()}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setIsAddingTag(false);
              }}
            />
          </form>
        ) : (
          <button
            onClick={() => setIsAddingTag(true)}
            className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[11px] text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            title="为文章添加标签"
          >
            <Plus className="w-3 h-3" />
            <span>标签</span>
          </button>
        )}
      </div>

      {/* AI 摘读展示区 */}
      {article.aiSummary ? (
        <div className="mt-2.5 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-100 dark:border-slate-800 text-xs text-slate-700 dark:text-slate-300 space-y-2">
          <p className="line-clamp-3 leading-relaxed text-slate-600 dark:text-slate-300">{article.aiSummary}</p>
          {article.aiKeyTakeaways && article.aiKeyTakeaways.length > 0 && (
            <div className="space-y-1 pt-1 border-t border-slate-200/60 dark:border-slate-800">
              {article.aiKeyTakeaways.slice(0, 3).map((point, idx) => (
                <div key={idx} className="flex items-start gap-1.5 text-slate-700 dark:text-slate-300">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-1 shrink-0" />
                  <span className="line-clamp-1">{point}</span>
                </div>
              ))}
            </div>
          )}
          {article.aiTriageReason && (
            <p className="text-[11px] text-slate-400 dark:text-slate-500 italic">理由: {article.aiTriageReason}</p>
          )}

          {article.aiCommentsInsight && article.aiCommentsInsight !== '暂无关键争议补充' && (
            <div className="pt-1.5 border-t border-slate-200/60 dark:border-slate-800 flex items-start gap-1.5 text-[11px] text-indigo-700 dark:text-indigo-300 bg-indigo-50/50 dark:bg-indigo-950/30 p-1.5 rounded-lg">
              <MessageSquareQuote className="w-3.5 h-3.5 shrink-0 mt-0.5 text-indigo-500" />
              <p className="line-clamp-2 leading-relaxed">
                <span className="font-semibold mr-1">热评争议与补充:</span>
                {article.aiCommentsInsight}
              </p>
            </div>
          )}
        </div>
      ) : (
        <p className="mt-2 text-xs text-slate-400 dark:text-slate-500 line-clamp-2 leading-relaxed">
          {article.fullContent || '点击右侧 AI 按钮即可一键摘读文章提炼要点与分拣建议...'}
        </p>
      )}

      {/* 底部功能条 */}
      <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
        <div className="flex items-center gap-2 text-slate-400 dark:text-slate-500">
          <span>{article.authorName || '知乎'}</span>
          <span>·</span>
          <span>赞同 {article.voteupCount || 0}</span>
        </div>

        <div className="flex items-center gap-1.5">
          {!isTrashView ? (
            <>
              {/* AI 读完/提炼 */}
              <button
                onClick={handleAI}
                disabled={analyzing}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/50 transition font-medium text-xs disabled:opacity-50"
              >
                <Sparkles className={`w-3.5 h-3.5 ${analyzing ? 'animate-spin' : ''}`} />
                {analyzing ? '分析中...' : article.aiSummary ? '重读' : 'AI摘读'}
              </button>

              {/* 转移到其他收藏夹 */}
              <div className="relative">
                <button
                  onClick={() => setShowMoveSelect(!showMoveSelect)}
                  className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition"
                  title="移动到其它收藏夹"
                >
                  <FolderInput className="w-3.5 h-3.5" />
                </button>

                {showMoveSelect && (
                  <div className="absolute right-0 bottom-full mb-1 w-44 bg-white dark:bg-slate-800 shadow-xl rounded-xl border border-slate-100 dark:border-slate-700 py-1 z-20">
                    <div className="px-2.5 py-1 text-[11px] font-semibold text-slate-400 dark:text-slate-500 border-b border-slate-50 dark:border-slate-700/60">
                      移动至收藏夹
                    </div>
                    <div className="max-h-40 overflow-y-auto">
                      {collections
                        .filter((c) => c.id !== article.collectionId)
                        .map((c) => (
                          <button
                            key={c.id}
                            onClick={async () => {
                              setShowMoveSelect(false);
                              await onMove(c.id);
                            }}
                            className="w-full text-left px-2.5 py-1.5 text-xs text-slate-700 dark:text-slate-300 hover:bg-blue-50 dark:hover:bg-slate-700 hover:text-blue-600 dark:hover:text-blue-400 truncate"
                          >
                            {c.title}
                          </button>
                        ))}
                    </div>
                  </div>
                )}
              </div>

              {/* 移出分拣范围（放入回收站，不直接删除知乎线上） */}
              <button
                onClick={onRemove}
                className="p-1.5 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/40 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 transition"
                title="移出分拣范围（放入回收站，不立即删除知乎收藏）"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </>
          ) : (
            <>
              {/* 回收站中的操作: 恢复 与 彻底删除 */}
              <button
                onClick={onRestore}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 font-medium text-xs transition"
                title="恢复此内容回到分拣台"
              >
                <RotateCcw className="w-3 h-3" />
                <span>恢复</span>
              </button>

              <button
                onClick={onPermanentDelete}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-900/50 font-medium text-xs transition"
                title="彻底从知乎线上取消收藏并删除本地记录"
              >
                <Trash2 className="w-3 h-3" />
                <span>彻底删除</span>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
