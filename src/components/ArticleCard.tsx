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
  Share2
} from 'lucide-react';
import { type ZhihuArticleItem, type ZhihuCollection } from '../db';
import { copyMarkdownToClipboard, downloadMarkdownFile, sendToObsidian } from '../services/exporter';

interface ArticleCardProps {
  article: ZhihuArticleItem;
  collections: ZhihuCollection[];
  isSelected: boolean;
  onSelect: (selected: boolean) => void;
  onTriageAI: () => Promise<void>;
  onMove: (targetCollectionId: string) => Promise<void>;
  onRemove: () => Promise<void>;
}

export const ArticleCard: React.FC<ArticleCardProps> = ({
  article,
  collections,
  isSelected,
  onSelect,
  onTriageAI,
  onMove,
  onRemove,
}) => {
  const [analyzing, setAnalyzing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showMoveSelect, setShowMoveSelect] = useState(false);

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

  const isInvalid = article.isDeletedOrInvalid;

  return (
    <div
      className={`glass-card group rounded-2xl p-4 transition-all duration-200 border ${
        isSelected
          ? 'border-blue-500 ring-2 ring-blue-500/20 bg-blue-50/20'
          : isInvalid
          ? 'border-red-200 bg-red-50/20 opacity-80'
          : 'border-slate-100 hover:border-slate-300 hover:shadow-md'
      }`}
    >
      {/* 顶部元数据与多选 */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={(e) => onSelect(e.target.checked)}
            className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
          />
          <span className="text-xs px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 font-medium">
            {article.collectionTitle}
          </span>
          {isInvalid && (
            <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-md bg-red-100 text-red-600 font-medium">
              <AlertTriangle className="w-3 h-3" /> 已失效/已删除
            </span>
          )}
          {article.aiTriageRating && (
            <span
              className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-md font-medium ${
                article.aiTriageRating === 'keep'
                  ? 'bg-emerald-100 text-emerald-700'
                  : article.aiTriageRating === 'discard'
                  ? 'bg-amber-100 text-amber-700'
                  : 'bg-indigo-100 text-indigo-700'
              }`}
            >
              {article.aiTriageRating === 'keep' && <CheckCircle2 className="w-3 h-3" />}
              {article.aiTriageRating === 'discard' && <XCircle className="w-3 h-3" />}
              {article.aiTriageRating === 'review' && <HelpCircle className="w-3 h-3" />}
              {article.aiTriageRating === 'keep'
                ? '高价值留存'
                : article.aiTriageRating === 'discard'
                ? '建议弃置'
                : '待初审'}
            </span>
          )}
        </div>

        {/* 右侧微型快捷工具条 */}
        <div className="flex items-center gap-1 opacity-70 group-hover:opacity-100 transition-opacity">
          <button
            onClick={handleCopy}
            title="复制 Markdown"
            className="p-1 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-800 transition"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={() => downloadMarkdownFile(article)}
            title="导出 .md 文件"
            className="p-1 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-800 transition"
          >
            <FileDown className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => sendToObsidian(article)}
            title="写入 Obsidian"
            className="p-1 rounded-lg hover:bg-slate-100 text-purple-600 hover:text-purple-800 transition"
          >
            <Share2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 标题 */}
      <h3 className="mt-2.5 font-semibold text-slate-900 text-sm leading-snug line-clamp-2">
        <a
          href={article.url}
          target="_blank"
          rel="noreferrer"
          className="hover:text-blue-600 hover:underline flex items-baseline gap-1"
        >
          {article.title}
          <ExternalLink className="w-3 h-3 inline-block shrink-0 opacity-40" />
        </a>
      </h3>

      {/* AI 摘读展示区 */}
      {article.aiSummary ? (
        <div className="mt-2.5 p-2.5 rounded-xl bg-slate-50 border border-slate-100 text-xs text-slate-700 space-y-2">
          <p className="line-clamp-3 leading-relaxed text-slate-600">{article.aiSummary}</p>
          {article.aiKeyTakeaways && article.aiKeyTakeaways.length > 0 && (
            <div className="space-y-1 pt-1 border-t border-slate-200/60">
              {article.aiKeyTakeaways.slice(0, 3).map((point, idx) => (
                <div key={idx} className="flex items-start gap-1.5 text-slate-700">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-1 shrink-0" />
                  <span className="line-clamp-1">{point}</span>
                </div>
              ))}
            </div>
          )}
          {article.aiTriageReason && (
            <p className="text-[11px] text-slate-400 italic">理由: {article.aiTriageReason}</p>
          )}
        </div>
      ) : (
        <p className="mt-2 text-xs text-slate-400 line-clamp-2 leading-relaxed">
          {article.fullContent || '点击右侧 AI 按钮即可一键摘读文章提炼要点与分拣建议...'}
        </p>
      )}

      {/* 底部功能条 */}
      <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs">
        <div className="flex items-center gap-2 text-slate-400">
          <span>{article.authorName || '知乎'}</span>
          <span>·</span>
          <span>赞同 {article.voteupCount || 0}</span>
        </div>

        <div className="flex items-center gap-1.5">
          {/* AI 读完/提炼 */}
          <button
            onClick={handleAI}
            disabled={analyzing}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 transition font-medium text-xs disabled:opacity-50"
          >
            <Sparkles className={`w-3.5 h-3.5 ${analyzing ? 'animate-spin' : ''}`} />
            {analyzing ? '分析中...' : article.aiSummary ? '重读' : 'AI摘读'}
          </button>

          {/* 转移到其他收藏夹 */}
          <div className="relative">
            <button
              onClick={() => setShowMoveSelect(!showMoveSelect)}
              className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-800 transition"
              title="移动到其它收藏夹"
            >
              <FolderInput className="w-3.5 h-3.5" />
            </button>

            {showMoveSelect && (
              <div className="absolute right-0 bottom-full mb-1 w-44 bg-white shadow-xl rounded-xl border border-slate-100 py-1 z-20">
                <div className="px-2.5 py-1 text-[11px] font-semibold text-slate-400 border-b border-slate-50">
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
                        className="w-full text-left px-2.5 py-1.5 text-xs text-slate-700 hover:bg-blue-50 hover:text-blue-600 truncate"
                      >
                        {c.title}
                      </button>
                    ))}
                </div>
              </div>
            )}
          </div>

          {/* 取消收藏 */}
          <button
            onClick={onRemove}
            className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-600 transition"
            title="从收藏夹彻底移除/取消收藏"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
