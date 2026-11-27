import React, { useState, useEffect, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { 
  Sparkles, 
  RefreshCw, 
  Trash2, 
  FolderInput, 
  Settings, 
  Search, 
  FolderOpen,
  CheckSquare,
  Square,
  Archive,
  Moon,
  Sun,
  FileText,
  Undo2,
  Check,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Tag,
  RotateCcw,
  AlertTriangle,
  AlertCircle,
  X,
  Download,
  Upload,
  Loader2,
  Pause,
  Play,
  BookOpen,
  Clock
} from 'lucide-react';
import { db, applyAIResult, safeUpsertArticles, type ZhihuArticleItem, type ZhihuCollection } from '../db';
import { collapseByContentId } from '../db/aiPropagation';
import { ArticleCard } from '../components/ArticleCard';
import { SettingsModal } from '../components/SettingsModal';
import { DescriptionModal } from '../components/DescriptionModal';
import { AutoOrganizeModal } from '../components/AutoOrganizeModal';
import { AIQueueBar } from '../components/AIQueueBar';
import { QueueStatusPanel } from '../components/QueueStatusPanel';
import { FilterBar } from '../components/FilterBar';
import { TagFilterBar } from '../components/TagFilterBar';
import { BatchActionBar } from '../components/BatchActionBar';
import { Sidebar } from '../components/Sidebar';
import { ArticleList } from '../components/ArticleList';
import { useArticleActions, type HistoryRecord } from '../hooks/useArticleActions';
import { createSingleAnalysis } from '../hooks/useSingleAnalysis';
import { useCollectionSync } from '../hooks/useCollectionSync';
import { 
  type AIQueueState, 
  type AIQueueTask, 
  loadQueueFromStorage, 
  saveQueueToStorage, 
  clearQueueStorage 
} from '../services/aiQueue';
import { isModeCompleted, reconcileQueueWithProgress } from '../services/queueReconcile';
import { loadProfileStore, pinSettings, snapshotForTask } from '../services/apiProfiles';
import { acquireQueueLock, releaseQueueLock } from '../services/queueLock';
import { createQueueEngine, type QueueEngine } from '../services/queueEngine';
import { findVanishedMemberIds } from '../services/membershipCleanup';
import { 
  fetchUserCollectionsList,
  fetchCollectionContents,
  fetchCollectionContentsDetailed,
  fetchHotComments,
  moveArticleBetweenCollections, 
  removeArticleFromCollection
} from '../services/zhihuApi';
import { 
  quickTriageArticleWithAI,
  categorizeArticleWithAI,
  batchCategorizeArticlesWithAI,
  synthesizeBatchTaxonomy,
  deepReadArticleWithAI,
  analyzeArticleWithAI, 
  generateCollectionDescription,
  getAISettings 
} from '../services/ai';
import { exportAllDataToJson, importDataFromJsonFile } from '../services/backup';


export const Dashboard: React.FC = () => {
  // 选中的导航目标: 'all' | 收藏夹ID | '__trash__' (回收站/已出分拣范围)
  const [selectedCollectionId, setSelectedCollectionId] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState<string>('');
  const [filterRating, setFilterRating] = useState<'all' | 'untriaged' | 'keep' | 'discard' | 'review' | 'uncategorized' | 'invalid'>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [syncProgress, setSyncProgress] = useState<string>('');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isAutoOrganizeOpen, setIsAutoOrganizeOpen] = useState(false);

  // 描述生成弹窗状态
  const [descModalData, setDescModalData] = useState<{
    isOpen: boolean;
    colId: string;
    colTitle: string;
    desc: string;
  }>({ isOpen: false, colId: '', colTitle: '', desc: '' });

  // 撤销/重做操作历史记录
  const [historyList, setHistoryList] = useState<HistoryRecord[]>([]);

  // 浮动 Toast 提示 (带撤销按钮)
  const [toastMsg, setToastMsg] = useState<{ text: string; articleId?: string } | null>(null);

  // AI 读取分拣持久化任务队列 (MoonDigest 风格，刷新不丢失进度，支持随时暂停/继续)
  const [queueState, setQueueState] = useState<AIQueueState>(() => loadQueueFromStorage());
  const queueStatusRef = useRef<AIQueueState['status']>(queueState.status);
  const isProcessingRef = useRef<boolean>(false);
  const engineRef = useRef<QueueEngine | null>(null);

  useEffect(() => {
    queueStatusRef.current = queueState.status;
  }, [queueState.status]);

  // 初始化时若检测到持久化队列中有待处理任务，提示用户
  useEffect(() => {
    const pendingCount = queueState.tasks.filter((t) => t.status === 'pending' || t.status === 'processing').length;
    if (pendingCount > 0 && queueState.status === 'paused') {
      setToastMsg({ text: `已从本地安全恢复 AI 分拣队列（剩余 ${pendingCount} 篇待处理，可随时点击继续）` });
    }
  }, []);

  // ADR-0004：载入后按文章字段对账，让「文章已写、队列仍 pending」的崩溃窗口自愈，避免重复消耗额度
  useEffect(() => {
    const ids = queueState.tasks.map((t) => t.articleId);
    if (ids.length === 0) return;
    let cancelled = false;

    void (async () => {
      try {
        const rows = await db.articles.where('id').anyOf(ids).toArray();
        if (cancelled) return;
        const { state, recovered, unverified } = reconcileQueueWithProgress(queueState, rows);
        if (recovered > 0) {
          console.info(`[queue] 依据文章字段补标 ${recovered} 条已完成任务`);
        }
        if (unverified > 0) {
          console.warn(`[queue] ${unverified} 条任务标记完成但文章缺少对应产物，按 ADR-0004 保持原状`);
        }
        if (state !== queueState) {
          setQueueState(state);
          saveQueueToStorage(state);
        }
      } catch (e) {
        console.warn('[queue] 队列对账失败，沿用本地快照:', e);
      }
    })();

    return () => {
      cancelled = true;
    };
    // 只在挂载时对账一次；之后以循环内的实时写入为准
  }, []);

  const sidebarFileInputRef = useRef<HTMLInputElement>(null);

  // 备份与还原处理
  const handleExportBackup = async () => {
    try {
      const res = await exportAllDataToJson();
      showToast(`备份导出成功！已打包 ${res.collectionsCount} 个收藏夹与 ${res.articlesCount} 篇内容。`);
    } catch (e: any) {
      alert(`导出备份失败: ${e.message}`);
    }
  };

  const handleSidebarFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    try {
      const res = await importDataFromJsonFile(file);
      showToast(`🎉 备份还原成功！已恢复 ${res.collectionsCount} 个收藏夹与 ${res.articlesCount} 篇内容。`);
      await handleSyncCollections();
    } catch (err: any) {
      alert(`导入备份失败: ${err.message}`);
    } finally {
      setLoading(false);
      if (sidebarFileInputRef.current) sidebarFileInputRef.current.value = '';
    }
  };

  // 暗黑模式状态管理
  const [isDark, setIsDark] = useState<boolean>(() => {
    const saved = localStorage.getItem('zh_dark_mode');
    if (saved !== null) return saved === 'true';
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('zh_dark_mode', String(isDark));
  }, [isDark]);

  // 从本地 Dexie 响应式读取数据
  const collections = useLiveQuery(() => db.collections.toArray(), []) || [];
  const articles = useLiveQuery(() => db.articles.toArray(), []) || [];

  // 初始化拉取收藏夹列表
  useEffect(() => {
    handleSyncCollections();
  }, []);

  // 区分正常分拣范围文章与已移出分拣范围（回收站）文章
  const activeArticles = articles.filter((a) => !a.inTrash);
  const trashedArticles = articles.filter((a) => a.inTrash);

  const isTrashView = selectedCollectionId === '__trash__';


  // 过滤展示的列表 (考虑回收站与分拣区)
  const currentPool = isTrashView ? trashedArticles : activeArticles;

  const filteredArticles = currentPool.filter((item) => {
    if (!isTrashView && selectedCollectionId !== 'all' && item.collectionId !== selectedCollectionId) {
      return false;
    }
    if (filterRating === 'untriaged' && (item.aiTriageRating || item.isDeletedOrInvalid)) {
      return false;
    }
    if (filterRating === 'uncategorized' && ((item.tags && item.tags.length > 0) || item.isDeletedOrInvalid)) {
      return false;
    }
    if (filterRating === 'invalid' && !item.isDeletedOrInvalid) {
      return false;
    }
    if (['keep', 'discard', 'review'].includes(filterRating) && item.aiTriageRating !== filterRating) {
      return false;
    }
    if (selectedTag && (!item.tags || !item.tags.includes(selectedTag))) {
      return false;
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const inTitle = item.title?.toLowerCase().includes(q);
      const inAuthor = item.authorName?.toLowerCase().includes(q);
      const inSummary = item.aiSummary?.toLowerCase().includes(q);
      const inTags = item.tags?.some((t) => t.toLowerCase().includes(q));
      return inTitle || inAuthor || inSummary || inTags;
    }
    return true;
  });

  // 提取当前所有存在的标签并按热度降序排序 (用于顶部快速筛选与收敛管理)
  const tagFrequency: Record<string, number> = {};
  activeArticles.forEach((a) => {
    (a.tags || []).forEach((t) => {
      tagFrequency[t] = (tagFrequency[t] || 0) + 1;
    });
  });
  const availableTags = Object.keys(tagFrequency).sort(
    (a, b) => (tagFrequency[b] ?? 0) - (tagFrequency[a] ?? 0)
  );

  // 全选/反选
  const handleToggleSelectAll = () => {
    if (selectedIds.size === filteredArticles.length && filteredArticles.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredArticles.map((a) => a.id)));
    }
  };

  // 从所有文章中移除特定标签
  const handleRemoveGlobalTag = async (tagToRemove: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`确定在所有文章中删除标签「#${tagToRemove}」吗？`)) return;
    let count = 0;
    for (const a of activeArticles) {
      if (a.tags?.includes(tagToRemove)) {
        await db.articles.update(a.id, {
          tags: a.tags.filter((t) => t !== tagToRemove),
        });
        count++;
      }
    }
    if (selectedTag === tagToRemove) setSelectedTag('');
    showToast(`已从 ${count} 篇文章中移除标签「#${tagToRemove}」`);
  };

  // 一键清空所有文章的历史旧标签 (彻底解决“总tag数太多”的历史积压问题)
  const handleClearAllTags = async () => {
    if (!confirm(`⚠️ 确定要清空全部 ${activeArticles.length} 篇文章的历史旧标签吗？\n\n清空后可彻底解决历史标签膨胀，随后可通过「2. 批量词条分类」按照最新限制重新规范提炼高质量标签！`)) return;
    let count = 0;
    for (const a of activeArticles) {
      if (a.tags && a.tags.length > 0) {
        await db.articles.update(a.id, { tags: [] });
        count++;
      }
    }
    setSelectedTag('');
    showToast(`🧹 已清空 ${count} 篇文章的历史旧标签，现在可以重新规范打标！`);
  };

  // 递进式 AI 处理：Stage 1 粗读初筛 / Stage 2 词条分类(受设置控制) / Stage 3 深度精读(+热评Top5)
  const handleAnalyzeSingle = createSingleAnalysis({ collections, activeArticles });

  // 核心队列执行器：逐篇处理任务，支持实时暂停、取消与异常容错
  // 核心队列执行器：分片 / 暂停 / 熔断由 queueEngine 承担，UI 只同步状态与生命周期
  const runQueueLoop = async (tasksList: AIQueueTask[], mode: 'quick' | 'categorize' | 'deep') => {
    if (isProcessingRef.current) return;
    isProcessingRef.current = true;
    queueStatusRef.current = 'running';

    const engine = createQueueEngine(
      {
        // 本次运行钉在首个待处理任务的快照上；老队列没有快照时回退到当前激活档案
        loadSettings: async () =>
          tasksList.find((t) => (t.status === 'pending' || t.status === 'processing') && t.settingsSnapshot)?.settingsSnapshot
          ?? tasksList.find((t) => t.settingsSnapshot)?.settingsSnapshot
          ?? getAISettings(),
        collections,
        analyzeSingle: (article, m) => handleAnalyzeSingle(article, m),
        loadArticle: (id) => db.articles.get(id),
        loadArticles: (ids) => db.articles.where('id').anyOf(ids).toArray(),
        updateArticle: async (id, patch) => {
          await applyAIResult(id, patch);
        },
        synthesizeTaxonomy: (arts, opts) => synthesizeBatchTaxonomy(arts, opts),
        batchCategorize: async (arts, cols, opts) => {
          const result = await batchCategorizeArticlesWithAI(arts, cols, opts);
          return new Map(
            Array.from(result, ([id, item]) =>
              [
                id,
                {
                  tags: item.tags,
                  recommendedCategory: item.recommendedCategory,
                  categorizeReason: item.categorizeReason,
                  summary: item.summary,
                },
              ] as const
            )
          );
        },
        notify: (message) => showToast(message),
        commit: (next) => {
          setQueueState(next);
          saveQueueToStorage(next);
        },
        now: () => Date.now(),
        sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
        log: (message, error) => console.error(message, error),
      },
      queueState
    );

    engineRef.current = engine;

    // ADR-0007：整个队列运行期钉住入队快照，避免切换档案改变在途任务的接口/模型/Key
    const queuedSettings =
      tasksList.find((t) => (t.status === 'pending' || t.status === 'processing') && t.settingsSnapshot)?.settingsSnapshot
      ?? tasksList.find((t) => t.settingsSnapshot)?.settingsSnapshot
      ?? await getAISettings();
    const releasePinnedSettings = pinSettings(queuedSettings);

    try {
      await engine.run(tasksList, mode);
    } finally {
      releasePinnedSettings();
      engineRef.current = null;
      // 循环因暂停 / 完成而退出：释放所有权，允许用户在本页或其他页重新接管
      releaseQueueLock();
      isProcessingRef.current = false;
    }
  };

  // 批量 AI 分拣：加入持久化任务队列并启动 (支持随时暂停与刷新断点恢复)
  const handleBatchAI = async (mode: 'quick' | 'categorize' | 'deep' = 'quick') => {
    const targets = filteredArticles.filter((a) => selectedIds.has(a.id));
    if (targets.length === 0) {
      alert('请先勾选需要 AI 处理的文章！');
      return;
    }

    const settings = await getAISettings();
    let targetsToProcess = targets;

    // 智能去重与跳过已处理项，防止重复消耗 Token 与时间
    if (mode === 'quick') {
      const alreadyTriaged = targets.filter((a) => a.aiTriageRating);
      if (alreadyTriaged.length > 0 && alreadyTriaged.length < targets.length) {
        const shouldSkip = confirm(
          `选中的 ${targets.length} 篇中有 ${alreadyTriaged.length} 篇已完成过快速粗读。\n\n` +
          `点击【确定】跳过已读内容，仅处理剩余 ${targets.length - alreadyTriaged.length} 篇未读文章；\n` +
          `点击【取消】对选中的全部 ${targets.length} 篇重新粗读。`
        );
        if (shouldSkip) {
          targetsToProcess = targets.filter((a) => !a.aiTriageRating);
        }
      } else if (alreadyTriaged.length === targets.length && targets.length > 3) {
        if (!confirm(`选中的 ${targets.length} 篇文章均已完成过快速粗读，确认要全部重新粗读吗？`)) {
          return;
        }
      }
    } else if (mode === 'categorize') {
      const alreadyTagged = targets.filter((a) => a.tags && a.tags.length > 0);
      const allowModifyTags = settings.allowModifyTags ?? true;

      if (!allowModifyTags && alreadyTagged.length > 0) {
        targetsToProcess = targets.filter((a) => !a.tags || a.tags.length === 0);
        if (targetsToProcess.length === 0) {
          alert(`选中的 ${targets.length} 篇文章均已有标签，且设置中关闭了“允许覆盖已有标签”。如需重新分类，请在右上角设置中开启该选项！`);
          return;
        }
        showToast(`🏷️ 已按设置自动跳过 ${alreadyTagged.length} 篇已有标签文章，推进剩余 ${targetsToProcess.length} 篇！`);
      } else if (alreadyTagged.length > 0 && alreadyTagged.length < targets.length) {
        const shouldSkip = confirm(
          `选中的 ${targets.length} 篇中有 ${alreadyTagged.length} 篇已有分类标签。\n\n` +
          `点击【确定】跳过已有标签内容，仅对剩余 ${targets.length - alreadyTagged.length} 篇未打标文章分类；\n` +
          `点击【取消】对选中的全部 ${targets.length} 篇重新分类。`
        );
        if (shouldSkip) {
          targetsToProcess = targets.filter((a) => !a.tags || a.tags.length === 0);
        }
      } else if (alreadyTagged.length === targets.length && targets.length > 3) {
        if (!confirm(`选中的 ${targets.length} 篇文章均已有分类标签，确认要全部重新分类打标吗？`)) {
          return;
        }
      }
    } else if (mode === 'deep') {
      const alreadyDeep = targets.filter((a) => a.aiDeepReadAt);
      if (alreadyDeep.length > 0 && alreadyDeep.length < targets.length) {
        const shouldSkip = confirm(
          `选中的 ${targets.length} 篇中有 ${alreadyDeep.length} 篇已完成过全文精读。\n\n` +
          `点击【确定】跳过已精读文章，仅对剩余 ${targets.length - alreadyDeep.length} 篇进行精读；\n` +
          `点击【取消】对选中的全部 ${targets.length} 篇重新精读。`
        );
        if (shouldSkip) {
          targetsToProcess = targets.filter((a) => !a.aiDeepReadAt);
        }
      } else if (alreadyDeep.length === targets.length && targets.length > 3) {
        if (!confirm(`选中的 ${targets.length} 篇文章均已完成过全文精读，确认要全部重新精读吗？`)) {
          return;
        }
      }
    }

    if (targetsToProcess.length === 0) {
      return;
    }

    // ADR-0005：同一内容被收进多个收藏夹时本地会有多行，但它们的内容完全相同。
    // 只要用户没有显式要求「全部重跑」，一次批次就只为这篇内容付一次 AI 费用。
    const anyAlreadyDone = targets.some((a) => isModeCompleted(a, mode));
    const forceRerun = anyAlreadyDone && targetsToProcess.length === targets.length;
    if (!forceRerun) {
      const beforeCollapse = targetsToProcess.length;
      const { kept, collapsed } = collapseByContentId(
        targetsToProcess,
        (a) => !isModeCompleted(a, mode)
      );
      if (collapsed.length > 0) {
        targetsToProcess = kept;
        showToast(
          `🔗 已按内容去重：${beforeCollapse} 篇中 ${collapsed.length} 篇是同一内容的其他收藏夹成员，同内容只分析一次，结果会同步过去`
        );
      }
    }

    // ADR-0007：入队时快照激活档案，运行中切换档案不影响在途任务
    const taskSettings = snapshotForTask(await loadProfileStore());

    // 构建新任务列表
    const newTasks: AIQueueTask[] = targetsToProcess.map((item) => ({
      articleId: item.id,
      title: item.title,
      mode,
      status: 'pending',
      updatedAt: Date.now(),
      settingsSnapshot: { ...taskSettings },
    }));

    // 若当前已有未完成任务，智能合并并去重
    const newIds = new Set(newTasks.map((t) => t.articleId));
    const previousUnfinished = queueState.tasks.filter(
      (t) => (t.status === 'pending' || t.status === 'processing') && !newIds.has(t.articleId)
    );

    const mergedTasks = [...previousUnfinished, ...newTasks];

    let chunkSize = 20;
    if (mode === 'quick') chunkSize = settings.batchLimitQuick || 30;
    else if (mode === 'categorize') chunkSize = settings.batchLimitCategorize || 20;
    else if (mode === 'deep') chunkSize = settings.batchLimitDeep || 10;
    chunkSize = Math.max(1, chunkSize);

    const totalChunks = Math.max(1, Math.ceil(mergedTasks.length / chunkSize));
    const chunkInfo = {
      currentChunk: 1,
      totalChunks,
      chunkSize,
    };

    const nextState: AIQueueState = {
      status: 'running',
      mode,
      tasks: mergedTasks,
      currentTitle: mergedTasks[0]?.title,
      currentArticleId: mergedTasks[0]?.articleId,
      chunkInfo,
    };

    // ADR-0004：单写者约束，避免两个标签页同时推进同一队列，重复消耗 API 额度
    if (!(await acquireQueueLock())) {
      showToast('⚠️ 另一个标签页正在运行 AI 队列，请先回到该页面暂停或关闭后再试');
      return;
    }

    setQueueState(nextState);
    saveQueueToStorage(nextState);
    setSelectedIds(new Set()); // 清空勾选以便用户继续操作其他内容
    const modeLabel = mode === 'categorize' ? '词条分类' : mode === 'deep' ? '深度精读' : '快速粗读';
    if (totalChunks > 1) {
      showToast(`🚀 已将 ${newTasks.length} 篇内容切分为 ${totalChunks} 个子批次 (每批 ${chunkSize} 篇) 推进 AI [${modeLabel}]！`);
    } else {
      showToast(`🚀 已将 ${newTasks.length} 篇内容加入 AI [${modeLabel}] 队列并启动！`);
    }

    // 启动处理队列
    runQueueLoop(mergedTasks, mode);
  };

  // 暂停队列处理
  const handlePauseQueue = () => {
    engineRef.current?.pause();
    queueStatusRef.current = 'paused';
    setQueueState((prev) => {
      const next: AIQueueState = {
        ...prev,
        status: 'paused',
        currentTitle: undefined,
        currentArticleId: undefined,
      };
      saveQueueToStorage(next);
      return next;
    });
    showToast('⏸️ AI 分拣队列已暂停，已处理的分类进度全部保存在本地！');
  };

  // 恢复继续队列处理
  const handleResumeQueue = async () => {
    if (!(await acquireQueueLock())) {
      showToast('⚠️ 另一个标签页正在运行 AI 队列，请先回到该页面暂停或关闭后再试');
      return;
    }
    queueStatusRef.current = 'running';
    const nextState: AIQueueState = {
      ...queueState,
      status: 'running',
    };
    setQueueState(nextState);
    saveQueueToStorage(nextState);
    showToast('▶️ AI 分拣队列继续执行...');
    runQueueLoop(queueState.tasks, queueState.mode);
  };

  // 清空/终止队列
  const handleClearQueue = () => {
    engineRef.current?.pause();
    queueStatusRef.current = 'idle';
    isProcessingRef.current = false;
    releaseQueueLock();
    clearQueueStorage();
    setQueueState({ status: 'idle', mode: 'quick', tasks: [] });
    showToast('已清空 AI 分拣队列');
  };

  // 一键重试当前队列中所有失败项
  const handleRetryFailed = async () => {
    const failedTasks = queueState.tasks.filter((t) => t.status === 'failed');
    if (failedTasks.length === 0) return;

    if (!(await acquireQueueLock())) {
      showToast('⚠️ 另一个标签页正在运行 AI 队列，请先回到该页面暂停或关闭后再试');
      return;
    }

    const updatedTasks = queueState.tasks.map((t) =>
      t.status === 'failed' ? { ...t, status: 'pending' as const, error: undefined } : t
    );

    queueStatusRef.current = 'running';
    const nextState: AIQueueState = {
      ...queueState,
      status: 'running',
      tasks: updatedTasks,
      currentTitle: failedTasks[0]?.title,
      currentArticleId: failedTasks[0]?.articleId,
    };

    setQueueState(nextState);
    saveQueueToStorage(nextState);
    showToast(`🔄 正在重新尝试处理 ${failedTasks.length} 篇失败项...`);

    runQueueLoop(updatedTasks, queueState.mode);
  };


  const showToast = (text: string) => {
    setToastMsg({ text });
    setTimeout(() => {
      setToastMsg((prev) => (prev?.text === text ? null : prev));
    }, 4500);
  };
  const { handleSyncCollections, handleFetchArticles, handleGenerateDesc } = useCollectionSync({
    collections, selectedCollectionId, setSelectedCollectionId, setLoading,
    setSyncProgress, showToast, setDescModalData,
  });

  const {
    handleBatchMove, handleMoveToTrashSingle, handleBatchMoveToTrash,
    handleRestoreSingle, handleBatchRestore, handlePermanentDeleteSingle,
    handleBatchPermanentDelete, handleUndoRecent,
  } = useArticleActions({
    collections, filteredArticles, selectedIds, historyList, setHistoryList,
    setSelectedIds, setLoading, setSyncProgress, showToast,
  });

  const handleClearLocalCache = async () => {
    if (confirm('确定清空本地缓存的知乎文章和 AI 分析结果吗？（不影响知乎线上的收藏夹）')) {
      await db.articles.clear();
      setSelectedIds(new Set());
    }
  };

  // 统计数据
  const totalCount = activeArticles.length;
  const keepCount = activeArticles.filter((a) => a.aiTriageRating === 'keep').length;
  const discardCount = activeArticles.filter((a) => a.aiTriageRating === 'discard').length;
  const reviewCount = activeArticles.filter((a) => a.aiTriageRating === 'review').length;
  const invalidCount = activeArticles.filter((a) => a.isDeletedOrInvalid).length;
  const canUndo = historyList.some((h) => !h.undone);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 transition-colors duration-200">
      <Sidebar
        activeArticles={activeArticles}
        trashedArticles={trashedArticles}
        collections={collections}
        selectedCollectionId={selectedCollectionId}
        queueState={queueState}
        isDark={isDark}
        canUndo={canUndo}
        loading={loading}
        sidebarFileInputRef={sidebarFileInputRef}
        onSelectCollection={setSelectedCollectionId}
        onSetDark={setIsDark}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenAutoOrganize={() => setIsAutoOrganizeOpen(true)}
        onPauseQueue={handlePauseQueue}
        onResumeQueue={handleResumeQueue}
        onClearQueue={handleClearQueue}
        onRetryFailed={handleRetryFailed}
        onSyncCollections={handleSyncCollections}
        onFetchArticles={handleFetchArticles}
        onGenerateDesc={handleGenerateDesc}
        onUndoRecent={handleUndoRecent}
        onExportBackup={handleExportBackup}
        onSidebarFileChange={handleSidebarFileChange}
        onClearLocalCache={handleClearLocalCache}
      />

      {/* 右侧主视窗：分拣台与卡片流 */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        <FilterBar
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          filterRating={filterRating}
          onRatingChange={setFilterRating}
          currentPool={currentPool}
        />

        {/* 标签过滤与全局收敛管理栏 (当有标签存在时显示) */}
        {!isTrashView && (
          <TagFilterBar
            availableTags={availableTags}
            selectedTag={selectedTag}
            onSelectTag={setSelectedTag}
            tagFrequency={tagFrequency}
            onRemoveTag={handleRemoveGlobalTag}
            onClearAll={handleClearAllTags}
          />
        )}

        {/* 回收站提示横幅 */}
        {isTrashView && (
          <div className="px-6 py-2 bg-rose-50 dark:bg-rose-950/30 border-b border-rose-100 dark:border-rose-900/50 flex items-center justify-between text-xs text-rose-700 dark:text-rose-300">
            <div className="flex items-center gap-2">
              <Trash2 className="w-4 h-4 text-rose-500" />
              <span>
                <strong>回收站（已移出分拣范围）</strong>：此处的文章已从分拣台移出，但<strong>尚未</strong>在知乎线上删除。你可以随时恢复回分拣台，或选择彻底删除。
              </span>
            </div>
          </div>
        )}
        {/* 批量操作控制浮条 */}
        <BatchActionBar
          selectedIds={selectedIds}
          filteredArticles={filteredArticles}
          syncProgress={syncProgress}
          isTrashView={isTrashView}
          loading={loading}
          collections={collections}
          onToggleSelectAll={handleToggleSelectAll}
          onBatchAI={handleBatchAI}
          onBatchMove={handleBatchMove}
          onBatchMoveToTrash={handleBatchMoveToTrash}
          onBatchRestore={handleBatchRestore}
          onBatchPermanentDelete={handleBatchPermanentDelete}
        />

        {/* 卡片流展示区 */}
        <ArticleList
          filteredArticles={filteredArticles}
          collections={collections}
          selectedIds={selectedIds}
          isTrashView={isTrashView}
          currentArticleId={queueState.currentArticleId}
          selectedTag={selectedTag}
          onSelectIds={setSelectedIds}
          onSelectTag={setSelectedTag}
          onQuickRead={(article) => handleAnalyzeSingle(article, 'quick')}
          onCategorize={(article) => handleAnalyzeSingle(article, 'categorize')}
          onDeepRead={(article) => handleAnalyzeSingle(article, 'deep')}
          onMoveToTrash={handleMoveToTrashSingle}
          onRestore={handleRestoreSingle}
          onPermanentDelete={handlePermanentDeleteSingle}
        />
      </div>

      {/* 底部悬浮 Toast 提示 */}
      {toastMsg && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 px-4 py-2.5 rounded-2xl bg-slate-900/90 dark:bg-white/90 text-white dark:text-slate-900 text-xs font-medium shadow-2xl backdrop-blur-md animate-fade-in">
          <span>{toastMsg.text}</span>
          {canUndo && (
            <button
              onClick={handleUndoRecent}
              className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-blue-600 text-white text-xs hover:bg-blue-500 font-semibold"
            >
              <Undo2 className="w-3 h-3" />
              <span>撤销</span>
            </button>
          )}
        </div>
      )}

      {/* AI 任务队列持久化控制面板 (支持暂停、继续、清空、重试失败项，刷新自动断点保护) */}
      <AIQueueBar
        queueState={queueState}
        onPause={handlePauseQueue}
        onResume={handleResumeQueue}
        onClear={handleClearQueue}
        onRetryFailed={handleRetryFailed}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />

      <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
      <AutoOrganizeModal
        isOpen={isAutoOrganizeOpen}
        onClose={() => setIsAutoOrganizeOpen(false)}
        collections={collections}
        onComplete={async () => {
          await handleSyncCollections();
        }}
      />
      <DescriptionModal
        isOpen={descModalData.isOpen}
        collectionId={descModalData.colId}
        collectionTitle={descModalData.colTitle}
        initialDescription={descModalData.desc}
        onClose={() => setDescModalData({ ...descModalData, isOpen: false })}
        onSaved={async (newDesc) => {
          await db.collections.update(descModalData.colId, { description: newDesc });
        }}
      />
    </div>
  );
};
