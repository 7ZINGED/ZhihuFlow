import React, { useState } from 'react';
import { Sparkles, X, ArrowRight, Play, CheckCircle, AlertCircle, RotateCcw } from 'lucide-react';
import { type ZhihuArticleItem, type ZhihuCollection } from '../db';
import { analyzeArticleWithAI } from '../services/ai';
import { moveArticleBetweenCollections } from '../services/zhihuApi';

interface AutoOrganizeModalProps {
  isOpen: boolean;
  onClose: () => void;
  collections: ZhihuCollection[];
  onComplete: () => void;
}

interface PlanItem {
  article: ZhihuArticleItem;
  fromCollection: string;
  toCollection: ZhihuCollection;
  status: 'pending' | 'success' | 'skipped' | 'error';
  errorMsg?: string;
}

export const AutoOrganizeModal: React.FC<AutoOrganizeModalProps> = ({
  isOpen,
  onClose,
  collections,
  onComplete,
}) => {
  const [sourceColId, setSourceColId] = useState<string>(collections[0]?.id || '');
  const [targetColIds, setTargetColIds] = useState<Set<string>>(new Set(collections.map(c => c.id)));
  const [isDryRun, setIsDryRun] = useState<boolean>(true); // 默认试运行
  const [running, setRunning] = useState<boolean>(false);
  const [planList, setPlanList] = useState<PlanItem[]>([]);
  const [progressText, setProgressText] = useState<string>('');

  if (!isOpen) return null;

  const handleStart = async () => {
    if (!sourceColId) {
      alert('请选择源收藏夹！');
      return;
    }
    const sourceCol = collections.find(c => c.id === sourceColId);
    if (!sourceCol) return;

    const availableTargets = collections.filter(c => targetColIds.has(c.id));
    if (availableTargets.length === 0) {
      alert('请至少选择一个目标收藏夹！');
      return;
    }

    setRunning(true);
    setPlanList([]);
    setProgressText('正在读取待整理文章...');

    try {
      const { db } = await import('../db');
      let sourceArticles = await db.articles.where('collectionId').equals(sourceColId).toArray();
      if (sourceArticles.length === 0) {
        const { fetchCollectionContents } = await import('../services/zhihuApi');
        sourceArticles = await fetchCollectionContents(sourceColId, sourceCol.title);
        await db.articles.bulkPut(sourceArticles);
      }

      if (sourceArticles.length === 0) {
        alert('该收藏夹内没有文章可整理！');
        setRunning(false);
        return;
      }

      const plans: PlanItem[] = [];
      let count = 0;

      for (const article of sourceArticles) {
        count++;
        setProgressText(`AI 正在分析文章 (${count}/${sourceArticles.length}): ${article.title.slice(0, 15)}...`);

        try {
          const aiRes = await analyzeArticleWithAI(
            article.title,
            article.fullContent || article.title,
            availableTargets
          );

          // 寻找匹配的目标收藏夹
          const target = availableTargets.find(
            t => t.title.trim() === aiRes.recommendedCategory.trim() ||
                 aiRes.recommendedCategory.includes(t.title)
          );

          if (!target || target.id === sourceColId) {
            // 归类为相同收藏夹，或者未建议移动
            plans.unshift({
              article,
              fromCollection: sourceCol.title,
              toCollection: target || sourceCol,
              status: 'skipped',
            });
          } else {
            // 建议移动
            if (isDryRun) {
              plans.unshift({
                article,
                fromCollection: sourceCol.title,
                toCollection: target,
                status: 'pending',
              });
            } else {
              // 实际执行知乎 API 移动
              await moveArticleBetweenCollections(
                article.contentId,
                article.contentType,
                sourceColId,
                target.id
              );
              await db.articles.delete(article.id);
              plans.unshift({
                article,
                fromCollection: sourceCol.title,
                toCollection: target,
                status: 'success',
              });
            }
          }
          setPlanList([...plans]);
        } catch (e: any) {
          plans.unshift({
            article,
            fromCollection: sourceCol.title,
            toCollection: sourceCol,
            status: 'error',
            errorMsg: e.message,
          });
          setPlanList([...plans]);
        }
      }

      setProgressText(isDryRun ? '试运行完成！以下是 AI 智能归类方案：' : '整理执行完毕！');
      onComplete();
    } catch (err: any) {
      alert(`处理出错: ${err.message}`);
    } finally {
      setRunning(false);
    }
  };

  // 确认从试运行一键应用到知乎线上
  const handleApplyAllDryRun = async () => {
    const moveTargets = planList.filter(p => p.status === 'pending');
    if (moveTargets.length === 0) return;

    if (!confirm(`确定将这 ${moveTargets.length} 篇内容按照 AI 建议实际移动到目标收藏夹吗？`)) return;

    setRunning(true);
    let done = 0;
    const { db } = await import('../db');

    for (const item of moveTargets) {
      setProgressText(`正在执行移动 (${++done}/${moveTargets.length})...`);
      try {
        await moveArticleBetweenCollections(
          item.article.contentId,
          item.article.contentType,
          item.article.collectionId,
          item.toCollection.id
        );
        await db.articles.delete(item.article.id);
        item.status = 'success';
      } catch (err: any) {
        item.status = 'error';
        item.errorMsg = err.message;
      }
      setPlanList([...planList]);
    }

    setRunning(false);
    setProgressText('全量分类应用完成！');
    onComplete();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-fade-in">
      <div className="glass-panel w-full max-w-2xl rounded-3xl p-6 shadow-2xl space-y-4 border border-slate-200 dark:border-slate-800 max-h-[85vh] flex flex-col">
        {/* 标题栏 */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-200/60 dark:border-slate-800 shrink-0">
          <div className="flex items-center gap-2 text-slate-800 dark:text-slate-100 font-bold text-base">
            <Sparkles className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <span>AI 自动整理与重分类收藏夹</span>
          </div>
          <button onClick={onClose} className="p-1 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 配置选择区 */}
        <div className="grid grid-cols-2 gap-4 text-xs shrink-0">
          <div className="space-y-1.5">
            <label className="font-semibold text-slate-700 dark:text-slate-300">1. 选择待整理的源收藏夹：</label>
            <select
              value={sourceColId}
              onChange={(e) => setSourceColId(e.target.value)}
              disabled={running}
              className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 font-medium"
            >
              {collections.map(c => (
                <option key={c.id} value={c.id}>{c.title} ({c.itemCount || 0}篇)</option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="font-semibold text-slate-700 dark:text-slate-300">2. 执行模式：</label>
            <div className="flex items-center gap-3 p-2 rounded-xl bg-slate-100 dark:bg-slate-800/60">
              <label className="flex items-center gap-1.5 cursor-pointer text-slate-700 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={isDryRun}
                  onChange={(e) => setIsDryRun(e.target.checked)}
                  disabled={running}
                  className="rounded text-blue-600"
                />
                <span className="font-medium">试运行 (Dry Run 预演，不直接改知乎)</span>
              </label>
            </div>
          </div>
        </div>

        {/* 目标收藏夹多选 */}
        <div className="space-y-1.5 text-xs shrink-0">
          <label className="font-semibold text-slate-700 dark:text-slate-300">3. 允许 AI 分类到的目标收藏夹：</label>
          <div className="flex flex-wrap gap-2 max-h-24 overflow-y-auto p-2 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800">
            {collections.map(c => {
              const checked = targetColIds.has(c.id);
              return (
                <label key={c.id} className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 cursor-pointer text-slate-700 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => {
                      const next = new Set(targetColIds);
                      e.target.checked ? next.add(c.id) : next.delete(c.id);
                      setTargetColIds(next);
                    }}
                    className="rounded text-blue-600"
                  />
                  <span>{c.title}</span>
                </label>
              );
            })}
          </div>
        </div>

        {/* 进度提示与操作条 */}
        <div className="flex items-center justify-between pt-1 shrink-0 text-xs">
          <span className="text-blue-600 dark:text-blue-400 font-medium animate-pulse">{progressText}</span>
          <div className="flex items-center gap-2">
            {!running && planList.some(p => p.status === 'pending') && (
              <button
                onClick={handleApplyAllDryRun}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-medium shadow-sm transition"
              >
                <CheckCircle className="w-3.5 h-3.5" />
                应用预演方案到知乎
              </button>
            )}
            <button
              onClick={handleStart}
              disabled={running}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-medium shadow-md shadow-blue-500/20 disabled:opacity-50 transition"
            >
              <Play className="w-3.5 h-3.5" />
              {running ? 'AI 正在分类中...' : isDryRun ? '开始试运行' : '直接开始整理'}
            </button>
          </div>
        </div>

        {/* 方案结果列表 */}
        <div className="flex-1 overflow-y-auto space-y-2 pr-1 border-t border-slate-200/60 dark:border-slate-800 pt-3 text-xs">
          {planList.length === 0 ? (
            <div className="h-40 flex flex-col items-center justify-center text-slate-400 space-y-2">
              <p>选择源收藏夹后点击上方开始，AI 将逐篇研读正文并推荐最贴切的目的地</p>
            </div>
          ) : (
            planList.map((item, idx) => (
              <div
                key={idx}
                className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 flex items-center justify-between gap-3"
              >
                <div className="flex-1 truncate">
                  <h4 className="font-semibold text-slate-900 dark:text-slate-100 truncate" title={item.article.title}>
                    {item.article.title}
                  </h4>
                  <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-500">
                    <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800">{item.fromCollection}</span>
                    <ArrowRight className="w-3 h-3 text-slate-400" />
                    <span className="px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 font-medium">
                      {item.toCollection.title}
                    </span>
                  </div>
                </div>

                <div className="shrink-0">
                  {item.status === 'pending' && (
                    <span className="text-[11px] px-2 py-1 rounded-md bg-amber-50 dark:bg-amber-950/40 text-amber-600 font-medium">
                      预演建议移动
                    </span>
                  )}
                  {item.status === 'skipped' && (
                    <span className="text-[11px] px-2 py-1 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-500">
                      保留原位
                    </span>
                  )}
                  {item.status === 'success' && (
                    <span className="text-[11px] px-2 py-1 rounded-md bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 font-medium flex items-center gap-1">
                      <CheckCircle className="w-3 h-3" /> 已移至知乎
                    </span>
                  )}
                  {item.status === 'error' && (
                    <span className="text-[11px] px-2 py-1 rounded-md bg-red-50 text-red-600 font-medium flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" /> {item.errorMsg || '失败'}
                    </span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
