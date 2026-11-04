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
  MessageSquareQuote,
  BookOpen,
  RefreshCw
} from 'lucide-react';
import { type ZhihuArticleItem, type ZhihuCollection } from '../db';
import { copyMarkdownToClipboard, downloadMarkdownFile, sendToObsidian } from '../services/exporter';

interface ArticleCardProps {
  article: ZhihuArticleItem;
  collections: ZhihuCollection[];
  isSelected: boolean;
  isTrashView?: boolean;
  isQueueProcessing?: boolean; // 是否正在被 AI 队列处理中
  onSelect: (selected: boolean) => void;
  onQuickRead: () => Promise<void>; // 阶段1: 快速粗读初筛 (正文3000字，不打标签)
  onCategorize: () => Promise<void>; // 阶段2: 词条分类与打标 (严格1~2个收敛标签与归属推荐)
  onDeepRead: () => Promise<void>;  // 阶段3: 深度精读 (全文不限字数 + 热评Top5)
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
  isQueueProcessing = false,
  onSelect,
  onQuickRead,
  onCategorize,
  onDeepRead,
  onMove,
  onRemove,
  onRestore,
  onPermanentDelete,
  onUpdateRating,
  onUpdateTags,
  onTagClick,
}) => {
  const [analyzingMode, setAnalyzingMode] = useState<'quick' | 'categorize' | 'deep' | null>(null);
  const [copied, setCopied] = useState(false);
  const [showMoveSelect, setShowMoveSelect] = useState(false);
  const [showRatingMenu, setShowRatingMenu] = useState(false);
  const [showAIMenu, setShowAIMenu] = useState(false);

  // 打标签状态
  const [isAddingTag, setIsAddingTag] = useState(false);
  const [tagInput, setTagInput] = useState('');

  const handleCopy = async () => {
    await copyMarkdownToClipboard(article);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleQuickRead = async () => {
    setAnalyzingMode('quick');
    setShowAIMenu(false);
    try {
      await onQuickRead();
    } finally {
      setAnalyzingMode(null);
    }
  };

  const handleCategorize = async () => {
    setAnalyzingMode('categorize');
    setShowAIMenu(false);
    try {
      await onCategorize();
    } finally {
      setAnalyzingMode(null);
    }
  };

  const handleDeepRead = async () => {
    setAnalyzingMode('deep');
    setShowAIMenu(false);
    try {
      await onDeepRead();
    } finally {
      setAnalyzingMode(null);
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
  const isTruncated = article.isTruncated && article.aiReadingMode !== 'deep';
  const totalLength = article.totalWordCount || (article.fullContent?.length || 0);

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

      {/* 阶段 2: 词条分类与标签展示 (严格限制1~2个收敛标签) */}
      <div className="mt-2 flex items-center gap-1.5 flex-wrap">
        {(article.tags || []).map((t) => (
          <span
            key={t}
            onClick={() => onTagClick?.(t)}
            className="group/tag inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200/50 dark:border-indigo-800/40 hover:bg-indigo-100 cursor-pointer transition font-medium"
          >
            <Tag className="w-2.5 h-2.5 opacity-60" />
            <span>#{t}</span>
            <button
              onClick={(e) => handleRemoveTag(t, e)}
              className="opacity-0 group-hover/tag:opacity-100 hover:text-rose-500 transition ml-0.5"
              title="删除此标签"
            >
              <X className="w-2.5 h-2.5" />
            </button>
          </span>
        ))}

        {/* 若未分类打标，提供独立的 AI 词条分类按钮；已有标签时悬停显示重算按钮 */}
        {(!article.tags || article.tags.length === 0) ? (
          <button
            onClick={handleCategorize}
            disabled={!!analyzingMode || isQueueProcessing}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] bg-indigo-50/80 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 font-medium transition"
            title="执行阶段2：AI 词条分类（按最新设置提炼规范标签与推荐收藏夹）"
          >
            <Tag className="w-2.5 h-2.5" />
            <span>{analyzingMode === 'categorize' ? '分类中...' : 'AI 词条分类'}</span>
          </button>
        ) : (
          <button
            onClick={handleCategorize}
            disabled={!!analyzingMode || isQueueProcessing}
            className="opacity-0 group-hover:opacity-100 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 transition"
            title="按最新标签数量限制重新执行 AI 词条分类并调整 Tag 数目"
          >
            <RefreshCw className={`w-2.5 h-2.5 ${analyzingMode === 'categorize' ? 'animate-spin' : ''}`} />
            <span>{analyzingMode === 'categorize' ? '重算中...' : '重算标签'}</span>
          </button>
        )}

        {/* 推荐目标收藏夹指示 */}
        {article.aiCategory && article.aiCategory !== '其他' && article.aiCategory !== article.collectionTitle && (
          <span 
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200/50"
            title={article.aiCategoryReason ? `推荐理由: ${article.aiCategoryReason}` : '建议移动到此收藏夹'}
          >
            <span>建议移入: {article.aiCategory}</span>
          </span>
        )}

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
            title="手动添加自定义标签"
          >
            <Plus className="w-3 h-3" />
            <span>自定义</span>
          </button>
        )}
      </div>

      {/* AI 摘读展示区 */}
      {article.aiSummary ? (
        <div className="mt-2.5 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-100 dark:border-slate-800 text-xs text-slate-700 dark:text-slate-300 space-y-2">
          {/* 阅读模式徽标 */}
          <div className="flex items-center justify-between pb-1 border-b border-slate-200/50 dark:border-slate-800">
            <div className="flex items-center gap-1.5">
              {article.aiReadingMode === 'deep' ? (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 font-semibold">
                  ✨ 深度精读已完成 (全文+热评Top5)
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 font-medium">
                  ⚡ 快速粗读 (正文前3000字)
                </span>
              )}
            </div>
            <span className="text-[10px] text-slate-400">
              共 {totalLength} 字
            </span>
          </div>

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

          {/* 深度精读独享：评论区高赞焦点与争议洞察 */}
          {article.aiReadingMode === 'deep' && article.aiCommentsInsight && article.aiCommentsInsight !== '暂无关键争议补充' && (
            <div className="pt-1.5 border-t border-slate-200/60 dark:border-slate-800 flex items-start gap-1.5 text-[11px] text-indigo-700 dark:text-indigo-300 bg-indigo-50/50 dark:bg-indigo-950/30 p-2 rounded-xl">
              <MessageSquareQuote className="w-3.5 h-3.5 shrink-0 mt-0.5 text-indigo-500" />
              <p className="line-clamp-2 leading-relaxed">
                <span className="font-semibold mr-1">💬 热评争议与实践补充:</span>
                {article.aiCommentsInsight}
              </p>
            </div>
          )}
        </div>
      ) : (
        <p className="mt-2 text-xs text-slate-400 dark:text-slate-500 line-clamp-2 leading-relaxed">
          {article.fullContent ? `全文共 ${totalLength} 字。点击下方粗读或深度精读...` : '暂无完整正文文本'}
        </p>
      )}

      {/* 粗读截断警示与全文深读引导条（当文章超 3000 字且尚未深读时必须警示） */}
      {isTruncated && (
        <div className="mt-2.5 p-2.5 rounded-xl bg-amber-50/90 dark:bg-amber-950/40 border border-amber-200/80 dark:border-amber-900/60 flex items-center justify-between text-xs text-amber-800 dark:text-amber-200 shadow-sm animate-fade-in">
          <div className="flex items-center gap-1.5 truncate mr-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
            <span className="truncate text-[11px] leading-tight">
              正文共 <strong>{totalLength}</strong> 字，粗读仅读前 3000 字（可能遗漏核心方案）
            </span>
          </div>
          <button
            onClick={handleDeepRead}
            disabled={!!analyzingMode}
            className="shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-semibold text-[11px] shadow-sm transition active:scale-95 disabled:opacity-50"
            title="通读全文不限字数长文本，并抓取评论区神评 Top 5 一并分析"
          >
            <Sparkles className={`w-3 h-3 ${analyzingMode === 'deep' ? 'animate-spin' : ''}`} />
            <span>{analyzingMode === 'deep' ? '深读中...' : '全文深读 (+读热评)'}</span>
          </button>
        </div>
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
              {/* AI 粗读 / 深读 组合按钮 */}
              <div className="relative">
                <div className="inline-flex rounded-lg shadow-sm">
                  {/* 主触发按钮：三阶段递进引导 */}
                  <button
                    onClick={
                      isTruncated
                        ? handleDeepRead
                        : !article.aiSummary
                        ? handleQuickRead
                        : (!article.tags || article.tags.length === 0)
                        ? handleCategorize
                        : article.aiReadingMode !== 'deep'
                        ? handleDeepRead
                        : handleQuickRead
                    }
                    disabled={!!analyzingMode || isQueueProcessing}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-l-lg font-medium text-xs transition disabled:opacity-50 ${
                      isQueueProcessing
                        ? 'bg-blue-600 text-white animate-pulse'
                        : isTruncated
                        ? 'bg-amber-500 hover:bg-amber-600 text-white shadow-sm'
                        : analyzingMode === 'categorize'
                        ? 'bg-indigo-600 text-white'
                        : article.aiReadingMode === 'deep'
                        ? 'bg-purple-50 dark:bg-purple-950/50 text-purple-600 dark:text-purple-400 hover:bg-purple-100'
                        : 'bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 hover:bg-blue-100'
                    }`}
                    title={
                      isQueueProcessing
                        ? 'AI 队列正在分析中...'
                        : isTruncated
                        ? '文章超 3000 字，点击执行全文深读'
                        : !article.aiSummary
                        ? '阶段1：快速粗读初筛 (仅正文3000字，不打标签)'
                        : (!article.tags || article.tags.length === 0)
                        ? '阶段2：AI 词条分类 (提取1~2个收敛标签)'
                        : '阶段3：全文深度精读 (+读热评Top5)'
                    }
                  >
                    <Sparkles className={`w-3.5 h-3.5 ${analyzingMode || isQueueProcessing ? 'animate-spin' : ''}`} />
                    <span>
                      {isQueueProcessing
                        ? '队列处理中'
                        : analyzingMode === 'deep'
                        ? '深读中...'
                        : analyzingMode === 'categorize'
                        ? '分类中...'
                        : analyzingMode === 'quick'
                        ? '粗读中...'
                        : isTruncated
                        ? '全文深读'
                        : !article.aiSummary
                        ? '1. 粗读初筛'
                        : (!article.tags || article.tags.length === 0)
                        ? '2. 词条分类'
                        : article.aiReadingMode === 'deep'
                        ? '已精读'
                        : '3. 全文深读'}
                    </span>
                  </button>

                  {/* 模式选择下拉箭 */}
                  <button
                    onClick={() => setShowAIMenu(!showAIMenu)}
                    disabled={!!analyzingMode || isQueueProcessing}
                    className="px-1 rounded-r-lg border-l border-black/10 dark:border-white/10 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 transition"
                    title="选择三个递进处理功能"
                  >
                    <ChevronDown className="w-3 h-3" />
                  </button>
                </div>

                {/* AI 模式切换弹出菜单 (三阶段递进) */}
                {showAIMenu && (
                  <div className="absolute right-0 bottom-full mb-1 w-52 bg-white dark:bg-slate-800 shadow-xl rounded-2xl border border-slate-100 dark:border-slate-700 py-1.5 z-30 animate-fade-in text-xs space-y-0.5">
                    <div className="px-3 py-1 text-[10px] text-slate-400 font-bold uppercase tracking-wider border-b border-slate-100 dark:border-slate-700/60">
                      三阶段递进功能
                    </div>
                    
                    <button
                      onClick={handleQuickRead}
                      className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-blue-50 dark:hover:bg-blue-950/30 text-slate-700 dark:text-slate-300 text-left transition"
                    >
                      <span className="flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-blue-500" />
                        <span>1. 快速粗读初筛</span>
                      </span>
                      <span className="text-[10px] text-slate-400">去水初筛</span>
                    </button>

                    <button
                      onClick={handleCategorize}
                      className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 text-indigo-700 dark:text-indigo-300 text-left font-medium transition"
                    >
                      <span className="flex items-center gap-1.5">
                        <Tag className="w-3.5 h-3.5 text-indigo-500" />
                        <span>2. 词条分类打标</span>
                      </span>
                      <span className="text-[10px] text-indigo-500 font-semibold">限1~2标签</span>
                    </button>

                    <button
                      onClick={handleDeepRead}
                      className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-purple-50 dark:hover:bg-purple-950/30 text-purple-700 dark:text-purple-300 text-left font-medium transition"
                    >
                      <span className="flex items-center gap-1.5">
                        <BookOpen className="w-3.5 h-3.5 text-purple-500" />
                        <span>3. 全文深度精读</span>
                      </span>
                      <span className="text-[10px] text-purple-500">全文+热评</span>
                    </button>
                  </div>
                )}
              </div>

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
