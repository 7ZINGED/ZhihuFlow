import React, { useState, useEffect, useRef } from 'react';
import { 
  Sparkles, 
  X, 
  ArrowRight, 
  Play, 
  Pause,
  CheckCircle, 
  AlertCircle, 
  History,
  Trash2,
  CheckCircle2,
  FolderOpen
} from 'lucide-react';
import { type ZhihuArticleItem, type ZhihuCollection } from '../db';
import { analyzeArticleWithAI } from '../services/ai';
import { moveArticleBetweenCollections } from '../services/zhihuApi';

interface AutoOrganizeModalProps {
  isOpen: boolean;
  onClose: () => void;
  collections: ZhihuCollection[];
  onComplete: () => void;
}

export interface PlanItem {
  article: ZhihuArticleItem;
  fromCollection: string;
  toCollection: ZhihuCollection;
  status: 'pending' | 'success' | 'skipped' | 'error';
  errorMsg?: string;
}

interface AutoOrganizeDraft {
  sourceColIds: string[];
  sourceColTitles: string[];
  targetColIds: string[];
  isDryRun: boolean;
  plans: PlanItem[];
  totalArticlesCount: number;
  status: 'paused' | 'running' | 'completed' | 'idle';
  updatedAt: number;
}

const DRAFT_STORAGE_KEY = 'zh_auto_organize_draft_v1';

function loadDraftFromStorage(): AutoOrganizeDraft | null {
  try {
    const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.plans) || parsed.plans.length === 0) {
      return null;
    }
    // 兼容历史单一 sourceColId 字段
    if (parsed.sourceColId && !parsed.sourceColIds) {
      parsed.sourceColIds = [parsed.sourceColId];
      parsed.sourceColTitles = [parsed.sourceColTitle || ''];
    }
    if (parsed.status === 'running') parsed.status = 'paused';
    return parsed;
  } catch (e) {
    console.error('Failed to load organize draft:', e);
    return null;
  }
}

function saveDraftToStorage(draft: AutoOrganizeDraft) {
  try {
    localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
  } catch (e) {
    console.error('Failed to save organize draft:', e);
  }
}

function clearDraftStorage() {
  try {
    localStorage.removeItem(DRAFT_STORAGE_KEY);
  } catch (e) {
    console.error('Failed to clear organize draft:', e);
  }
}

export const AutoOrganizeModal: React.FC<AutoOrganizeModalProps> = ({
  isOpen,
  onClose,
  collections,
  onComplete,
}) => {
  // 待整理的源收藏夹多选集合 (默认全选或选第一个)
  const [sourceColIds, setSourceColIds] = useState<Set<string>>(
    () => new Set(collections.map((c) => c.id))
  );
  // 允许 AI 分类到的目标收藏夹多选集合
  const [targetColIds, setTargetColIds] = useState<Set<string>>(
    () => new Set(collections.map((c) => c.id))
  );
  const [isDryRun, setIsDryRun] = useState<boolean>(true); // 默认试运行预演
  const [running, setRunning] = useState<boolean>(false);
  const [planList, setPlanList] = useState<PlanItem[]>([]);
  const [progressText, setProgressText] = useState<string>('');
  
  // 草稿状态
  const [draft, setDraft] = useState<AutoOrganizeDraft | null>(null);

  const isPausedRef = useRef<boolean>(false);

  useEffect(() => {
    if (isOpen) {
      const savedDraft = loadDraftFromStorage();
      if (savedDraft) {
        setDraft(savedDraft);
        // 如果当前没有正在分析的方案，载入草稿方案便于用户查看
        if (planList.length === 0) {
          setPlanList(savedDraft.plans);
          if (savedDraft.sourceColIds && savedDraft.sourceColIds.length > 0) {
            setSourceColIds(new Set(savedDraft.sourceColIds));
          }
          setIsDryRun(savedDraft.isDryRun);
          if (savedDraft.targetColIds && savedDraft.targetColIds.length > 0) {
            setTargetColIds(new Set(savedDraft.targetColIds));
          }
        }
      }
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // 启动或从草稿继续分析
  const handleStart = async (resumeFromDraft = false) => {
    const curSourceIds = resumeFromDraft && draft && draft.sourceColIds?.length > 0
      ? new Set(draft.sourceColIds)
      : sourceColIds;

    if (curSourceIds.size === 0) {
      alert('请至少选择一个待整理的源收藏夹！');
      return;
    }

    const availableTargets = collections.filter(c => targetColIds.has(c.id));
    if (availableTargets.length === 0) {
      alert('请至少选择一个允许 AI 分类到的目标收藏夹！');
      return;
    }

    setRunning(true);
    isPausedRef.current = false;
    setProgressText('正在读取已选收藏夹的文章清单...');

    try {
      const { db } = await import('../db');
      const { fetchCollectionContents } = await import('../services/zhihuApi');

      let allSourceArticles: ZhihuArticleItem[] = [];

      for (const colId of curSourceIds) {
        const col = collections.find(c => c.id === colId);
        if (!col) continue;

        let colArticles = await db.articles.where('collectionId').equals(colId).toArray();
        if (colArticles.length === 0) {
          setProgressText(`正在拉取「${col.title}」的内容...`);
          colArticles = await fetchCollectionContents(colId, col.title);
          await db.articles.bulkPut(colArticles);
        }
        allSourceArticles.push(...colArticles);
      }

      // 按 article.id 去重
      const uniqueMap = new Map<string, ZhihuArticleItem>();
      for (const a of allSourceArticles) {
        uniqueMap.set(a.id, a);
      }
      const sourceArticles = Array.from(uniqueMap.values());

      if (sourceArticles.length === 0) {
        alert('所选的收藏夹内暂无文章可整理！');
        setRunning(false);
        return;
      }

      // 准备已有方案
      let currentPlans: PlanItem[] = resumeFromDraft && draft ? [...draft.plans] : [];
      const analyzedIds = new Set(currentPlans.map(p => p.article.id));
      
      // 待分析的文章列表（过滤掉已经分析过的）
      const remainingArticles = sourceArticles.filter(a => !analyzedIds.has(a.id));

      if (remainingArticles.length === 0 && currentPlans.length > 0) {
        setProgressText(`所有 ${sourceArticles.length} 篇内容均已完成分类预演！`);
        setRunning(false);
        return;
      }

      let count = currentPlans.length;
      const totalCount = sourceArticles.length;

      for (const article of remainingArticles) {
        if (isPausedRef.current) {
          break;
        }

        count++;
        setProgressText(`AI 正在分析文章 (${count}/${totalCount}): ${article.title.slice(0, 15)}...`);

        try {
          const aiRes = await analyzeArticleWithAI(
            article,
            availableTargets,
            { mode: 'quick' }
          );

          // 寻找匹配的目标收藏夹
          const target = availableTargets.find(
            t => t.title.trim() === aiRes.recommendedCategory.trim() ||
                 aiRes.recommendedCategory.includes(t.title)
          );

          const fromColTitle = collections.find(c => c.id === article.collectionId)?.title || article.collectionTitle || '原收藏夹';

          if (!target || target.id === article.collectionId) {
            // 归类为相同收藏夹，或者未建议移动
            currentPlans.unshift({
              article,
              fromCollection: fromColTitle,
              toCollection: target || { id: article.collectionId, title: fromColTitle },
              status: 'skipped',
            });
          } else {
            // 建议移动
            if (isDryRun) {
              currentPlans.unshift({
                article,
                fromCollection: fromColTitle,
                toCollection: target,
                status: 'pending',
              });
            } else {
              // 实际执行知乎 API 移动
              await moveArticleBetweenCollections(
                article.contentId,
                article.contentType,
                article.collectionId,
                target.id
              );
              await db.articles.delete(article.id);
              currentPlans.unshift({
                article,
                fromCollection: fromColTitle,
                toCollection: target,
                status: 'success',
              });
            }
          }
        } catch (e: any) {
          const fromColTitle = collections.find(c => c.id === article.collectionId)?.title || article.collectionTitle || '原收藏夹';
          currentPlans.unshift({
            article,
            fromCollection: fromColTitle,
            toCollection: { id: article.collectionId, title: fromColTitle },
            status: 'error',
            errorMsg: e.message,
          });
        }

        setPlanList([...currentPlans]);

        // 每分析完一篇即时存盘至草稿箱，防刷新与误关
        const sourceTitles = Array.from(curSourceIds).map(
          (id) => collections.find((c) => c.id === id)?.title || id
        );
        const newDraft: AutoOrganizeDraft = {
          sourceColIds: Array.from(curSourceIds),
          sourceColTitles: sourceTitles,
          targetColIds: Array.from(targetColIds),
          isDryRun,
          plans: [...currentPlans],
          totalArticlesCount: totalCount,
          status: isPausedRef.current ? 'paused' : 'running',
          updatedAt: Date.now(),
        };
        setDraft(newDraft);
        saveDraftToStorage(newDraft);

        if (isPausedRef.current) {
          break;
        }
      }

      if (isPausedRef.current) {
        setProgressText(`⏸️ 已暂停分析！当前已提炼 ${currentPlans.length} 篇方案，随时可继续或直接应用。`);
      } else {
        setProgressText(isDryRun ? `🎉 预演完成！已生成 ${currentPlans.length} 篇重分类方案：` : '整理执行完毕！');
        onComplete();
      }
    } catch (err: any) {
      alert(`处理出错: ${err.message}`);
    } finally {
      setRunning(false);
    }
  };

  // 暂停分析
  const handlePause = () => {
    isPausedRef.current = true;
    setProgressText('正在挂起当前单篇请求，即将暂停...');
  };

  // 放弃草稿
  const handleClearDraft = () => {
    if (confirm('确定丢弃当前未完成的重分类预演草稿吗？')) {
      clearDraftStorage();
      setDraft(null);
      setPlanList([]);
      setProgressText('已丢弃草稿，可重新选择收藏夹开始。');
    }
  };

  // 确认一键应用当前已有的预演方案到知乎线上（支持部分应用）
  const handleApplyPendingPlans = async () => {
    const moveTargets = planList.filter(p => p.status === 'pending');
    if (moveTargets.length === 0) return;

    if (!confirm(`确定将当前已提炼出的 ${moveTargets.length} 篇内容，实际移动到目标知乎收藏夹吗？`)) return;

    setRunning(true);
    let done = 0;
    const { db } = await import('../db');

    for (const item of moveTargets) {
      setProgressText(`正在执行移动 (${++done}/${moveTargets.length}): ${item.article.title.slice(0, 12)}...`);
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

    // 更新草稿中的方案状态
    if (draft) {
      const updatedDraft = {
        ...draft,
        plans: [...planList],
        updatedAt: Date.now(),
      };
      setDraft(updatedDraft);
      saveDraftToStorage(updatedDraft);
    }

    setRunning(false);
    setProgressText(`🎉 已成功将 ${done} 篇内容移动至新收藏夹！`);
    onComplete();
  };

  const pendingCount = planList.filter(p => p.status === 'pending').length;
  const isPaused = !running && draft && draft.plans.length < draft.totalArticlesCount && draft.plans.length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-fade-in">
      <div className="glass-panel w-full max-w-2xl rounded-3xl p-6 shadow-2xl space-y-4 border border-slate-200 dark:border-slate-800 max-h-[88vh] flex flex-col">
        {/* 标题栏 */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-200/60 dark:border-slate-800 shrink-0">
          <div className="flex items-center gap-2 text-slate-800 dark:text-slate-100 font-bold text-base">
            <Sparkles className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <span>AI 自动整理与跨收藏夹重分类</span>
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 border border-emerald-200/50">
              断点草稿保护
            </span>
          </div>
          <button 
            onClick={onClose} 
            className="p-1 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 草稿恢复提示条 (MoonDigest 风格断点保护) */}
        {draft && draft.plans.length > 0 && !running && (
          <div className="p-3 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200/80 dark:border-amber-800/60 flex items-center justify-between text-xs text-amber-800 dark:text-amber-200 animate-fade-in shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <History className="w-4 h-4 text-amber-600 shrink-0" />
              <div className="truncate">
                <span className="font-bold">发现未完成重分类草稿：</span>
                <span>包含 {draft.sourceColIds?.length || 1} 个源收藏夹，已预演 {draft.plans.length} / {draft.totalArticlesCount} 篇</span>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0 ml-2">
              <button
                onClick={() => handleStart(true)}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-semibold shadow-sm transition"
              >
                <Play className="w-3 h-3 fill-current" />
                <span>继续分析未完成</span>
              </button>
              <button
                onClick={handleClearDraft}
                className="p-1 rounded-lg bg-white dark:bg-slate-800 border border-amber-200 dark:border-amber-700 text-amber-700 dark:text-amber-300 hover:bg-rose-50 hover:text-rose-600 transition"
                title="清空当前草稿"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* 1. 待整理的源收藏夹 (多选区域) */}
        <div className="space-y-1.5 text-xs shrink-0">
          <div className="flex items-center justify-between">
            <label className="font-semibold text-slate-700 dark:text-slate-300">
              1. 选择待整理的源收藏夹 (可多选，已选 {sourceColIds.size} / {collections.length} 个)：
            </label>
            <button
              type="button"
              disabled={running}
              onClick={() => {
                if (sourceColIds.size === collections.length) {
                  setSourceColIds(new Set());
                } else {
                  setSourceColIds(new Set(collections.map((c) => c.id)));
                }
              }}
              className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline font-medium disabled:opacity-50"
            >
              {sourceColIds.size === collections.length ? '全部取消' : '全部选择'}
            </button>
          </div>
          <div className="flex flex-wrap gap-2 max-h-24 overflow-y-auto p-2 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800">
            {collections.map((c) => {
              const checked = sourceColIds.has(c.id);
              return (
                <label
                  key={c.id}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs cursor-pointer transition select-none ${
                    checked
                      ? 'bg-blue-50 dark:bg-blue-950/60 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 font-medium shadow-sm'
                      : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={running}
                    onChange={(e) => {
                      const next = new Set(sourceColIds);
                      e.target.checked ? next.add(c.id) : next.delete(c.id);
                      setSourceColIds(next);
                    }}
                    className="rounded text-blue-600 focus:ring-0"
                  />
                  <span>{c.title}</span>
                  <span className="text-[10px] opacity-70">({c.itemCount || 0}篇)</span>
                </label>
              );
            })}
          </div>
        </div>

        {/* 2. 允许 AI 分类到的目标收藏夹 (多选区域) */}
        <div className="space-y-1.5 text-xs shrink-0">
          <div className="flex items-center justify-between">
            <label className="font-semibold text-slate-700 dark:text-slate-300">
              2. 允许 AI 分类到的目标收藏夹 (可多选，已选 {targetColIds.size} / {collections.length} 个)：
            </label>
            <button
              type="button"
              disabled={running}
              onClick={() => {
                if (targetColIds.size === collections.length) {
                  setTargetColIds(new Set());
                } else {
                  setTargetColIds(new Set(collections.map((c) => c.id)));
                }
              }}
              className="text-[11px] text-indigo-600 dark:text-indigo-400 hover:underline font-medium disabled:opacity-50"
            >
              {targetColIds.size === collections.length ? '全部取消' : '全部选择'}
            </button>
          </div>
          <div className="flex flex-wrap gap-2 max-h-24 overflow-y-auto p-2 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800">
            {collections.map((c) => {
              const checked = targetColIds.has(c.id);
              return (
                <label
                  key={c.id}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs cursor-pointer transition select-none ${
                    checked
                      ? 'bg-indigo-50 dark:bg-indigo-950/60 border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 font-medium shadow-sm'
                      : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={running}
                    onChange={(e) => {
                      const next = new Set(targetColIds);
                      e.target.checked ? next.add(c.id) : next.delete(c.id);
                      setTargetColIds(next);
                    }}
                    className="rounded text-indigo-600 focus:ring-0"
                  />
                  <span>{c.title}</span>
                </label>
              );
            })}
          </div>
        </div>

        {/* 3. 执行模式选择 */}
        <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800 text-xs shrink-0">
          <label className="flex items-center gap-2 cursor-pointer text-slate-700 dark:text-slate-300">
            <input
              type="checkbox"
              checked={isDryRun}
              onChange={(e) => setIsDryRun(e.target.checked)}
              disabled={running}
              className="rounded text-blue-600 w-4 h-4"
            />
            <div>
              <span className="font-semibold">试运行模式 (Dry Run 预演)</span>
              <span className="text-[11px] text-slate-400 dark:text-slate-500 block">
                先生成重分类建议方案供您检查，满意后再点击「一键应用到知乎」，不直接更改知乎线上
              </span>
            </div>
          </label>
        </div>

        {/* 进度提示与操作条 */}
        <div className="flex items-center justify-between pt-1 shrink-0 text-xs">
          <span className="text-blue-600 dark:text-blue-400 font-medium truncate max-w-[50%] animate-pulse">
            {progressText}
          </span>
          <div className="flex items-center gap-2">
            {/* 暂停按钮 */}
            {running && (
              <button
                onClick={handlePause}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-medium shadow-sm transition"
              >
                <Pause className="w-3.5 h-3.5" />
                暂停分析
              </button>
            )}

            {/* 一键应用当前已提炼出的预演方案 (支持部分方案先行落地) */}
            {!running && pendingCount > 0 && (
              <button
                onClick={handleApplyPendingPlans}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-medium shadow-sm transition"
                title="即使未全部分析完，也可直接应用目前已有的建议移动项"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                应用当前方案 ({pendingCount} 篇)
              </button>
            )}

            {/* 开始 / 继续分析按钮 */}
            {!running && (
              <button
                onClick={() => handleStart(isPaused)}
                disabled={running || sourceColIds.size === 0 || targetColIds.size === 0}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-medium shadow-md shadow-blue-500/20 disabled:opacity-50 transition"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                {isPaused ? '继续分析未完成' : isDryRun ? '开始试运行预演' : '直接开始整理'}
              </button>
            )}
          </div>
        </div>

        {/* 方案结果列表 */}
        <div className="flex-1 overflow-y-auto space-y-2 pr-1 border-t border-slate-200/60 dark:border-slate-800 pt-3 text-xs">
          {planList.length === 0 ? (
            <div className="h-40 flex flex-col items-center justify-center text-slate-400 space-y-2">
              <FolderOpen className="w-8 h-8 text-slate-300 dark:text-slate-700" />
              <p>勾选需要整理的多个源收藏夹并点击上方开始，AI 将逐篇研读正文并推荐最贴切的目的地</p>
              <p className="text-[11px] text-slate-400/80">支持多源多目标交叉归类、随时暂停、刷新断点保留，可对已提炼出的部分方案随时落地生效</p>
            </div>
          ) : (
            planList.map((item, idx) => (
              <div
                key={idx}
                className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 flex items-center justify-between gap-3 shadow-xs"
              >
                <div className="flex-1 truncate">
                  <h4 className="font-semibold text-slate-900 dark:text-slate-100 truncate" title={item.article.title}>
                    {item.article.title}
                  </h4>
                  <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-500">
                    <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 font-medium">{item.fromCollection}</span>
                    <ArrowRight className="w-3 h-3 text-slate-400" />
                    <span className="px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 font-semibold">
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
