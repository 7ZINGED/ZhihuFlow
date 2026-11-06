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
  BookOpen
} from 'lucide-react';
import { db, type ZhihuArticleItem, type ZhihuCollection } from '../db';
import { ArticleCard } from '../components/ArticleCard';
import { SettingsModal } from '../components/SettingsModal';
import { DescriptionModal } from '../components/DescriptionModal';
import { AutoOrganizeModal } from '../components/AutoOrganizeModal';
import { AIQueueBar } from '../components/AIQueueBar';
import { 
  type AIQueueState, 
  type AIQueueTask, 
  loadQueueFromStorage, 
  saveQueueToStorage, 
  clearQueueStorage 
} from '../services/aiQueue';
import { 
  fetchUserCollectionsList, 
  fetchCollectionContents, 
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

interface HistoryRecord {
  article: ZhihuArticleItem;
  fromCollectionId: string;
  toCollectionId?: string;
  action: 'move' | 'delete' | 'trash';
  undone?: boolean;
}

export const Dashboard: React.FC = () => {
  // 选中的导航目标: 'all' | 收藏夹ID | '__trash__' (回收站/已出分拣范围)
  const [selectedCollectionId, setSelectedCollectionId] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState<string>('');
  const [filterRating, setFilterRating] = useState<'all' | 'keep' | 'discard' | 'review' | 'invalid'>('all');
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

  const handleSyncCollections = async () => {
    setLoading(true);
    setSyncProgress('正在同步知乎收藏夹列表...');
    try {
      const list = await fetchUserCollectionsList();
      await db.collections.bulkPut(list);
    } catch (err: any) {
      console.error(err);
      setSyncProgress(`同步失败: ${err.message}`);
    } finally {
      setLoading(false);
      setSyncProgress('');
    }
  };

  // 同步抓取选中收藏夹中的内容
  const handleFetchArticles = async (collectionId: string) => {
    const col = collections.find((c) => c.id === collectionId);
    if (!col) return;

    setLoading(true);
    setSyncProgress(`正在读取「${col.title}」内容...`);
    try {
      const items = await fetchCollectionContents(collectionId, col.title, (count) => {
        setSyncProgress(`已抓取 ${count} 条内容...`);
      });
      await db.articles.bulkPut(items);
      
      const actualCount = await db.articles.where('collectionId').equals(collectionId).count();
      await db.collections.update(collectionId, { itemCount: actualCount });
    } catch (err: any) {
      alert(`读取收藏夹失败: ${err.message}`);
    } finally {
      setLoading(false);
      setSyncProgress('');
    }
  };

  // 一键为收藏夹生成 AI 简介
  const handleGenerateDesc = async (col: ZhihuCollection) => {
    setLoading(true);
    setSyncProgress(`正在分析「${col.title}」并提炼宏观简介...`);
    try {
      let colArticles = await db.articles.where('collectionId').equals(col.id).toArray();
      if (colArticles.length === 0) {
        colArticles = await fetchCollectionContents(col.id, col.title);
        await db.articles.bulkPut(colArticles);
      }

      if (colArticles.length === 0) {
        alert('当前收藏夹为空，无法生成简介');
        return;
      }

      const generated = await generateCollectionDescription(colArticles);
      setDescModalData({
        isOpen: true,
        colId: col.id,
        colTitle: col.title,
        desc: generated,
      });
    } catch (e: any) {
      alert(`生成简介失败: ${e.message}`);
    } finally {
      setLoading(false);
      setSyncProgress('');
    }
  };

  // 过滤展示的列表 (考虑回收站与分拣区)
  const currentPool = isTrashView ? trashedArticles : activeArticles;

  const filteredArticles = currentPool.filter((item) => {
    if (!isTrashView && selectedCollectionId !== 'all' && item.collectionId !== selectedCollectionId) {
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
    (a, b) => tagFrequency[b] - tagFrequency[a]
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
  const handleAnalyzeSingle = async (
    article: ZhihuArticleItem,
    mode: 'quick' | 'categorize' | 'deep' = 'quick',
    batchTaxonomy?: string[]
  ) => {
    if (mode === 'quick') {
      const res = await quickTriageArticleWithAI(article, { maxChars: 3000 });
      await db.articles.update(article.id, {
        aiSummary: res.summary,
        aiKeyTakeaways: res.keyTakeaways,
        aiTriageRating: res.triageRating,
        aiTriageReason: res.triageReason,
        aiReadingMode: 'quick',
        isTruncated: res.isTruncated,
        totalWordCount: res.totalWordCount,
        aiProcessedAt: Date.now(),
      });
    } else if (mode === 'categorize') {
      const settings = await getAISettings();
      const maxTagCount = settings.maxTagCount || 2;
      const allowModifyTags = settings.allowModifyTags ?? true;
      const allowModifyDescription = settings.allowModifyDescription ?? true;

      // 如果用户在设置中关闭了“允许AI覆盖已有标签”，且文章已有标签，则保留既有标签
      const shouldKeepExistingTags = !allowModifyTags && article.tags && article.tags.length > 0;

      // 提炼当前库中高频标签池 (Top 30)，引导 AI 优先收敛复用已有标签，杜绝标签泛滥膨胀
      const tagCounts: Record<string, number> = {};
      activeArticles.forEach((a) => {
        (a.tags || []).forEach((t) => {
          tagCounts[t] = (tagCounts[t] || 0) + 1;
        });
      });
      const existingTags = Object.entries(tagCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 30)
        .map(([t]) => t);

      const res = await categorizeArticleWithAI(article, collections, { 
        existingTags,
        batchTaxonomy,
        maxTagCount,
        allowModifyDescription,
      });

      const updateData: Partial<ZhihuArticleItem> = {
        aiCategory: res.recommendedCategory,
        aiCategoryReason: res.categorizeReason,
        aiClassifiedAt: Date.now(),
      };

      if (!shouldKeepExistingTags) {
        // 完全按照最新 AI 词条打标调整标签数 (严格限制为 1 ~ maxTagCount 个)
        updateData.tags = res.tags.slice(0, maxTagCount);
      }

      if (allowModifyDescription && res.summary) {
        updateData.aiSummary = res.summary;
      }

      await db.articles.update(article.id, updateData);
    } else if (mode === 'deep') {
      let hotComments = article.hotComments || [];
      if (!hotComments || hotComments.length === 0) {
        try {
          hotComments = await fetchHotComments(article.contentId, article.contentType);
        } catch (err) {
          console.warn('获取热评失败:', err);
        }
      }

      const res = await deepReadArticleWithAI(article, hotComments);
      await db.articles.update(article.id, {
        aiSummary: res.summary,
        aiKeyTakeaways: res.keyTakeaways,
        aiCommentsInsight: res.commentsInsight,
        hotComments: res.hotComments || article.hotComments,
        aiReadingMode: 'deep',
        isTruncated: false,
        totalWordCount: res.totalWordCount || (article.fullContent || article.title).length,
        aiDeepReadAt: Date.now(),
      });
    }
  };

  // 核心队列执行器：逐篇处理任务，支持实时暂停、取消与异常容错
  const runQueueLoop = async (tasksList: AIQueueTask[], mode: 'quick' | 'categorize' | 'deep') => {
    if (isProcessingRef.current) return;
    isProcessingRef.current = true;
    queueStatusRef.current = 'running';

    const tasks = [...tasksList];
    let consecutiveErrors = 0;

    const settings = await getAISettings();
    let chunkSize = 20;
    if (mode === 'quick') chunkSize = settings.batchLimitQuick || 30;
    else if (mode === 'categorize') chunkSize = settings.batchLimitCategorize || 20;
    else if (mode === 'deep') chunkSize = settings.batchLimitDeep || 10;
    chunkSize = Math.max(1, chunkSize);

    const totalChunks = Math.max(1, Math.ceil(tasks.length / chunkSize));
    let currentBatchTaxonomy: string[] = queueState.synthesizedTaxonomy || [];

    if (mode === 'categorize') {
      // 词条分类模式：采用【整批打包单次请求 (Batch One-Shot)】极速映射！
      // 每次将一整批（例如 20 篇）在 1 个请求中交给大模型，在全局标签池下一次性返回整批标签与归属
      for (let c = 0; c < tasks.length; c += chunkSize) {
        if (queueStatusRef.current === 'paused' || queueStatusRef.current === 'idle') {
          break;
        }

        const chunkTasks = tasks.slice(c, c + chunkSize);
        const pendingChunkTasks = chunkTasks.filter((t) => t.status !== 'done');
        if (pendingChunkTasks.length === 0) continue;

        const currentChunkNum = Math.floor(c / chunkSize) + 1;
        const chunkInfo = {
          currentChunk: currentChunkNum,
          totalChunks,
          chunkSize,
        };

        // 标记当前批次任务为 processing
        pendingChunkTasks.forEach((t) => {
          t.status = 'processing';
          t.updatedAt = Date.now();
        });

        const currentProgressState: AIQueueState = {
          status: 'running',
          mode,
          tasks: [...tasks],
          currentTitle: `第 ${currentChunkNum}/${totalChunks} 批 (${pendingChunkTasks.length} 篇打包极速打标中...)`,
          chunkInfo,
          synthesizedTaxonomy: currentBatchTaxonomy,
        };
        setQueueState(currentProgressState);
        saveQueueToStorage(currentProgressState);

        try {
          const chunkIds = pendingChunkTasks.map((t) => t.articleId);
          const chunkArticles = await db.articles.where('id').anyOf(chunkIds).toArray();

          if (chunkArticles.length > 0) {
            // Pass 1: 提炼本批次全局规范标签库（若尚未提炼或跨大批次时重新收敛）
            if (currentBatchTaxonomy.length === 0 || c % (chunkSize * 2) === 0) {
              showToast(`🏷️ [分批 ${currentChunkNum}/${totalChunks}] 正在提炼本批全局收敛标签...`);
              currentBatchTaxonomy = await synthesizeBatchTaxonomy(chunkArticles, {
                maxGlobalTags: settings.maxGlobalTags,
                adaptiveGlobalTags: settings.adaptiveGlobalTags,
                customPrompt: settings.customCategorizePrompt,
              });
            }

            // Pass 2: 单次请求打包完成整批文章的分类归宿
            showToast(`⚡ [分批 ${currentChunkNum}/${totalChunks}] 正在 1 次请求中打包完成 ${chunkArticles.length} 篇分类与归属...`);
            const resultMap = await batchCategorizeArticlesWithAI(chunkArticles, collections, {
              batchTaxonomy: currentBatchTaxonomy,
              maxTagCount: settings.maxTagCount,
              allowModifyDescription: settings.allowModifyDescription,
            });

            // 批量存入本地数据库
            const allowModifyTags = settings.allowModifyTags ?? true;
            const allowModifyDesc = settings.allowModifyDescription ?? true;
            const maxTagCount = settings.maxTagCount || 2;

            for (const art of chunkArticles) {
              const res = resultMap.get(art.id);
              if (res) {
                const shouldKeepExistingTags = !allowModifyTags && art.tags && art.tags.length > 0;
                const updateData: Partial<ZhihuArticleItem> = {
                  aiCategory: res.recommendedCategory,
                  aiCategoryReason: res.categorizeReason,
                  aiClassifiedAt: Date.now(),
                };
                if (!shouldKeepExistingTags) {
                  updateData.tags = res.tags.slice(0, maxTagCount);
                }
                if (allowModifyDesc && res.summary) {
                  updateData.aiSummary = res.summary;
                }
                await db.articles.update(art.id, updateData);
              }
            }

            pendingChunkTasks.forEach((t) => {
              t.status = 'done';
              t.updatedAt = Date.now();
            });
            consecutiveErrors = 0;
          } else {
            pendingChunkTasks.forEach((t) => {
              t.status = 'failed';
              t.error = '文章不存在或已在知乎失效';
              t.updatedAt = Date.now();
            });
          }
        } catch (err: any) {
          console.error('整批分类任务处理异常:', err);
          pendingChunkTasks.forEach((t) => {
            t.status = 'failed';
            t.error = err?.message || '批处理失败';
            t.updatedAt = Date.now();
          });
          consecutiveErrors++;

          if (consecutiveErrors >= 3) {
            queueStatusRef.current = 'paused';
            showToast(`⚠️ 接口连续调用异常 [${pendingChunkTasks[0]?.error}]，队列已自动暂停保护！`);
          }
        }

        const hasPending = tasks.some((t) => t.status === 'pending');
        const nextStatus = queueStatusRef.current === 'paused'
          ? 'paused'
          : hasPending
          ? 'running'
          : 'completed';

        const stepState: AIQueueState = {
          status: nextStatus,
          mode,
          tasks: [...tasks],
          currentTitle: undefined,
          currentArticleId: undefined,
          chunkInfo,
          synthesizedTaxonomy: currentBatchTaxonomy,
        };
        setQueueState(stepState);
        saveQueueToStorage(stepState);

        if (queueStatusRef.current === 'paused' || queueStatusRef.current === 'idle') {
          break;
        }

        if (c + chunkSize < tasks.length) {
          await new Promise((resolve) => setTimeout(resolve, 300));
        }
      }
    } else {
      // 快速粗读 与 全文精读 模式：单篇深入流式推进
      for (let i = 0; i < tasks.length; i++) {
        // 循环开始前检查是否已暂停或清空
        if (queueStatusRef.current === 'paused' || queueStatusRef.current === 'idle') {
          break;
        }

        const task = tasks[i];
        if (task.status === 'done') continue;

        const currentChunkNum = Math.floor(i / chunkSize) + 1;
        const chunkInfo = {
          currentChunk: currentChunkNum,
          totalChunks,
          chunkSize,
        };

        // 标记当前任务为 processing 状态
        task.status = 'processing';
        task.updatedAt = Date.now();
        const currentProgressState: AIQueueState = {
          status: 'running',
          mode,
          tasks: [...tasks],
          currentTitle: task.title,
          currentArticleId: task.articleId,
          chunkInfo,
        };
        setQueueState(currentProgressState);
        saveQueueToStorage(currentProgressState);

        try {
          const article = await db.articles.get(task.articleId);
          if (!article) {
            task.status = 'failed';
            task.error = '文章不存在或已在知乎失效';
          } else {
            await handleAnalyzeSingle(article, task.mode);
            task.status = 'done';
            consecutiveErrors = 0;
          }
        } catch (err: any) {
          console.error('AI 队列处理任务失败:', err);
          task.status = 'failed';
          task.error = err?.message || '分析失败';
          consecutiveErrors++;

          if (consecutiveErrors >= 3) {
            queueStatusRef.current = 'paused';
            showToast(`⚠️ 接口连续调用异常 [${task.error}]，队列已自动暂停保护！`);
          }
        }

        task.updatedAt = Date.now();

        const hasPending = tasks.some((t) => t.status === 'pending');
        const nextStatus = queueStatusRef.current === 'paused'
          ? 'paused'
          : hasPending
          ? 'running'
          : 'completed';

        const stepState: AIQueueState = {
          status: nextStatus,
          mode,
          tasks: [...tasks],
          currentTitle: undefined,
          currentArticleId: undefined,
          chunkInfo,
        };
        setQueueState(stepState);
        saveQueueToStorage(stepState);

        if (queueStatusRef.current === 'paused' || queueStatusRef.current === 'idle') {
          break;
        }

        if (i < tasks.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 300));
        }
      }
    }

    isProcessingRef.current = false;
  };

  // 批量 AI 分拣：加入持久化任务队列并启动 (支持随时暂停与刷新断点恢复)
  const handleBatchAI = async (mode: 'quick' | 'categorize' | 'deep' = 'quick') => {
    const targets = filteredArticles.filter((a) => selectedIds.has(a.id));
    if (targets.length === 0) {
      alert('请先勾选需要 AI 处理的文章！');
      return;
    }

    // 构建新任务列表
    const newTasks: AIQueueTask[] = targets.map((item) => ({
      articleId: item.id,
      title: item.title,
      mode,
      status: 'pending',
      updatedAt: Date.now(),
    }));

    // 若当前已有未完成任务，智能合并并去重
    const newIds = new Set(newTasks.map((t) => t.articleId));
    const previousUnfinished = queueState.tasks.filter(
      (t) => (t.status === 'pending' || t.status === 'processing') && !newIds.has(t.articleId)
    );

    const mergedTasks = [...previousUnfinished, ...newTasks];

    const settings = await getAISettings();
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
  const handleResumeQueue = () => {
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
    queueStatusRef.current = 'idle';
    isProcessingRef.current = false;
    clearQueueStorage();
    setQueueState({ status: 'idle', mode: 'quick', tasks: [] });
    showToast('已清空 AI 分拣队列');
  };

  // 一键重试当前队列中所有失败项
  const handleRetryFailed = () => {
    const failedTasks = queueState.tasks.filter((t) => t.status === 'failed');
    if (failedTasks.length === 0) return;

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

  // 批量移动 (记录历史用于撤销)
  const handleBatchMove = async (targetColId: string) => {
    const targetCol = collections.find((c) => c.id === targetColId);
    if (!targetCol) return;

    const targets = filteredArticles.filter((a) => selectedIds.has(a.id) && !a.isDeletedOrInvalid);
    if (targets.length === 0) return;

    if (!confirm(`确定将选中的 ${targets.length} 篇内容移动到「${targetCol.title}」吗？`)) return;

    setLoading(true);
    let count = 0;
    const newRecords: HistoryRecord[] = [];

    for (const item of targets) {
      setSyncProgress(`正在移动 (${++count}/${targets.length})...`);
      try {
        await moveArticleBetweenCollections(item.contentId, item.contentType, item.collectionId, targetColId);
        await db.articles.delete(item.id);
        newRecords.push({
          article: item,
          fromCollectionId: item.collectionId,
          toCollectionId: targetColId,
          action: 'move',
        });
      } catch (err) {
        console.error(err);
      }
    }
    setHistoryList((prev) => [...newRecords, ...prev].slice(0, 50));
    setSelectedIds(new Set());
    setLoading(false);
    setSyncProgress('');
  };

  // 单篇移出分拣范围 (放入回收站，不直接删除知乎线上)
  const handleMoveToTrashSingle = async (article: ZhihuArticleItem) => {
    await db.articles.update(article.id, { inTrash: true, trashedAt: Date.now() });
    setHistoryList((prev) => [
      {
        article,
        fromCollectionId: article.collectionId,
        action: 'trash',
      },
      ...prev,
    ]);
    showToast(`已将「${article.title.slice(0, 14)}...」移出分拣范围 (已放入回收站)`);
  };

  // 批量移出分拣范围 (放入回收站)
  const handleBatchMoveToTrash = async () => {
    const targets = filteredArticles.filter((a) => selectedIds.has(a.id));
    if (targets.length === 0) return;

    const newRecords: HistoryRecord[] = [];
    for (const item of targets) {
      await db.articles.update(item.id, { inTrash: true, trashedAt: Date.now() });
      newRecords.push({
        article: item,
        fromCollectionId: item.collectionId,
        action: 'trash',
      });
    }

    setHistoryList((prev) => [...newRecords, ...prev].slice(0, 50));
    setSelectedIds(new Set());
    showToast(`已将选中的 ${targets.length} 篇内容放入回收站（已移出分拣范围）`);
  };

  // 单篇从回收站恢复
  const handleRestoreSingle = async (article: ZhihuArticleItem) => {
    await db.articles.update(article.id, { inTrash: false });
    showToast(`已将「${article.title.slice(0, 14)}...」恢复至分拣台`);
  };

  // 批量从回收站恢复
  const handleBatchRestore = async () => {
    const targets = filteredArticles.filter((a) => selectedIds.has(a.id));
    if (targets.length === 0) return;

    for (const item of targets) {
      await db.articles.update(item.id, { inTrash: false });
    }
    setSelectedIds(new Set());
    showToast(`已将 ${targets.length} 篇内容恢复至分拣台`);
  };

  // 单篇彻底从知乎线上取消收藏
  const handlePermanentDeleteSingle = async (article: ZhihuArticleItem) => {
    if (!confirm(`⚠️ 确定要彻底从知乎线上取消收藏「${article.title}」吗？此操作不可逆！`)) return;

    setLoading(true);
    try {
      if (!article.isDeletedOrInvalid) {
        await removeArticleFromCollection(article.contentId, article.contentType, article.collectionId);
      }
      await db.articles.delete(article.id);
      showToast(`已从知乎线上彻底取消收藏`);
    } catch (e: any) {
      alert(`彻底删除失败: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  // 批量彻底从知乎线上删除 (清空选中回收站)
  const handleBatchPermanentDelete = async () => {
    const targets = filteredArticles.filter((a) => selectedIds.has(a.id));
    if (targets.length === 0) return;

    if (!confirm(`⚠️ 危险警告：确定将选中的 ${targets.length} 条内容彻底从知乎线上取消收藏吗？此操作将在线上删除！`)) return;

    setLoading(true);
    let count = 0;
    for (const item of targets) {
      setSyncProgress(`正在从知乎线上彻底删除 (${++count}/${targets.length})...`);
      try {
        if (!item.isDeletedOrInvalid) {
          await removeArticleFromCollection(item.contentId, item.contentType, item.collectionId);
        }
        await db.articles.delete(item.id);
      } catch (err) {
        console.error(err);
      }
    }
    setSelectedIds(new Set());
    setLoading(false);
    setSyncProgress('');
    showToast(`已成功从知乎线上彻底删除 ${count} 条内容！`);
  };

  // 一键撤销最近的操作 (支持移动撤销与回收站撤销)
  const handleUndoRecent = async () => {
    const lastActive = historyList.find((h) => !h.undone);
    if (!lastActive) return;

    setLoading(true);
    try {
      if (lastActive.action === 'trash') {
        await db.articles.update(lastActive.article.id, { inTrash: false });
        lastActive.undone = true;
        setHistoryList([...historyList]);
        showToast(`已撤销！「${lastActive.article.title.slice(0, 14)}...」已恢复至分拣台`);
      } else if (lastActive.action === 'move' && lastActive.toCollectionId) {
        setSyncProgress(`正在撤销移动:「${lastActive.article.title.slice(0, 15)}...」`);
        await moveArticleBetweenCollections(
          lastActive.article.contentId,
          lastActive.article.contentType,
          lastActive.toCollectionId,
          lastActive.fromCollectionId
        );
        await db.articles.put(lastActive.article);
        lastActive.undone = true;
        setHistoryList([...historyList]);
        showToast(`已撤销移动！「${lastActive.article.title.slice(0, 14)}...」已移回原收藏夹`);
      }
    } catch (e: any) {
      alert(`撤销失败: ${e.message}`);
    } finally {
      setLoading(false);
      setSyncProgress('');
    }
  };

  const showToast = (text: string) => {
    setToastMsg({ text });
    setTimeout(() => {
      setToastMsg((prev) => (prev?.text === text ? null : prev));
    }, 4500);
  };

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
      {/* 左侧收藏夹与分拣导航 */}
      <div className="glass-panel w-72 shrink-0 flex flex-col justify-between border-r border-slate-200/80 dark:border-slate-800 p-4">
        <div className="space-y-4">
          {/* Logo 区域与工具 */}
          <div className="flex items-center justify-between pb-3 border-b border-slate-200/60 dark:border-slate-800">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center text-white shadow-md shadow-blue-500/20">
                <Sparkles className="w-4 h-4" />
              </div>
              <div>
                <h1 className="font-bold text-sm tracking-tight text-slate-900 dark:text-slate-100 leading-none">
                  知流 · ZhihuFlow
                </h1>
                <span className="text-[10px] text-blue-600 dark:text-blue-400 font-semibold">知乎摘读与分拣台</span>
              </div>
            </div>
            
            <div className="flex items-center gap-1">
              <button
                onClick={() => setIsDark(!isDark)}
                className="p-1.5 rounded-xl hover:bg-slate-200/60 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition"
                title={isDark ? '切换亮色模式' : '切换暗黑模式'}
              >
                {isDark ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4" />}
              </button>

              <button
                onClick={() => setIsSettingsOpen(true)}
                className="p-1.5 rounded-xl hover:bg-slate-200/60 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition"
                title="大模型接口设置"
              >
                <Settings className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* 状态统计迷你卡片 (值得留 / 可清理 / 不确定) */}
          <div className="grid grid-cols-4 gap-1 p-2 rounded-2xl bg-white/70 dark:bg-slate-900/60 border border-slate-100 dark:border-slate-800 text-center text-xs">
            <div className="p-1.5 rounded-xl bg-slate-50 dark:bg-slate-800/60">
              <span className="block text-[11px] text-slate-400 dark:text-slate-500">总计</span>
              <span className="font-bold text-slate-800 dark:text-slate-200 text-xs">{totalCount}</span>
            </div>
            <div className="p-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40">
              <span className="block text-[11px] text-emerald-600 dark:text-emerald-400">值得留</span>
              <span className="font-bold text-emerald-700 dark:text-emerald-300 text-xs">{keepCount}</span>
            </div>
            <div className="p-1.5 rounded-xl bg-rose-50 dark:bg-rose-950/40">
              <span className="block text-[11px] text-rose-600 dark:text-rose-400">可清理</span>
              <span className="font-bold text-rose-700 dark:text-rose-300 text-xs">{discardCount}</span>
            </div>
            <div className="p-1.5 rounded-xl bg-amber-50 dark:bg-amber-950/40">
              <span className="block text-[11px] text-amber-600 dark:text-amber-400">不确定</span>
              <span className="font-bold text-amber-700 dark:text-amber-300 text-xs">{reviewCount}</span>
            </div>
          </div>

          {/* 左侧常驻全局 AI 分拣任务面板 (MoonDigest 风格常驻看板，零遮挡) */}
          {queueState.status !== 'idle' && queueState.tasks.length > 0 && (
            <div className="p-3 rounded-2xl bg-gradient-to-br from-blue-50/80 to-indigo-50/60 dark:from-blue-950/40 dark:to-indigo-950/30 border border-blue-200/60 dark:border-blue-900/40 space-y-2.5 animate-fade-in shadow-sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 min-w-0">
                  {queueState.status === 'running' ? (
                    <Loader2 className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 animate-spin shrink-0" />
                  ) : queueState.status === 'paused' ? (
                    <Pause className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                  ) : queueState.tasks.some((t) => t.status === 'failed') ? (
                    <AlertCircle className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                  ) : (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                  )}
                  <span className="font-bold text-xs text-slate-800 dark:text-slate-100 truncate">
                    {queueState.status === 'running' 
                      ? 'AI 读取分拣中' 
                      : queueState.status === 'paused' 
                      ? '队列已暂停' 
                      : queueState.tasks.some((t) => t.status === 'failed')
                      ? queueState.tasks.every((t) => t.status === 'failed')
                        ? '全部执行失败'
                        : '完成(含异常)'
                      : '分拣完成'}
                  </span>
                </div>

                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-blue-100/70 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300">
                  {queueState.mode === 'deep' ? '精读' : queueState.mode === 'categorize' ? '分类' : '粗读'}
                </span>
              </div>

              {/* 平滑微型进度条 */}
              <div className="space-y-1">
                <div className="h-1.5 w-full bg-blue-200/50 dark:bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${
                      queueState.status === 'completed'
                        ? queueState.tasks.some((t) => t.status === 'failed')
                          ? queueState.tasks.every((t) => t.status === 'failed')
                            ? 'bg-rose-500'
                            : 'bg-amber-500'
                          : 'bg-emerald-500'
                        : queueState.status === 'paused'
                        ? 'bg-amber-500'
                        : 'bg-blue-600 animate-pulse'
                    }`}
                    style={{
                      width: `${Math.round(
                        ((queueState.tasks.filter((t) => t.status === 'done' || t.status === 'failed').length) /
                          queueState.tasks.length) *
                          100
                      )}%`,
                    }}
                  />
                </div>
                <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400">
                  <span>
                    已完成 {queueState.tasks.filter((t) => t.status === 'done').length} / {queueState.tasks.length} 篇
                    {queueState.tasks.some((t) => t.status === 'failed') && (
                      <span className="text-rose-500 ml-1">· {queueState.tasks.filter((t) => t.status === 'failed').length} 篇异常</span>
                    )}
                  </span>
                  <span>
                    {Math.round(
                      ((queueState.tasks.filter((t) => t.status === 'done' || t.status === 'failed').length) /
                        queueState.tasks.length) *
                        100
                    )}%
                  </span>
                </div>
              </div>

              {/* 当前分析标题 */}
              {queueState.currentTitle && (
                <p className="text-[10px] text-slate-600 dark:text-slate-400 truncate italic">
                  正在读: {queueState.currentTitle}
                </p>
              )}

              {/* 快捷操作按钮组 */}
              <div className="flex items-center gap-1.5 pt-0.5">
                {queueState.status === 'running' && (
                  <button
                    onClick={handlePauseQueue}
                    className="flex-1 flex items-center justify-center gap-1 py-1 rounded-lg bg-amber-500 text-white hover:bg-amber-600 text-[11px] font-semibold shadow-sm transition"
                  >
                    <Pause className="w-3 h-3" />
                    <span>暂停任务</span>
                  </button>
                )}

                {queueState.status === 'paused' && (
                  <>
                    <button
                      onClick={handleResumeQueue}
                      className="flex-1 flex items-center justify-center gap-1 py-1 rounded-lg bg-blue-600 text-white hover:bg-blue-700 text-[11px] font-semibold shadow-sm transition"
                    >
                      <Play className="w-3 h-3 fill-current" />
                      <span>继续分析</span>
                    </button>
                    <button
                      onClick={handleClearQueue}
                      className="p-1 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition"
                      title="清空队列"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </>
                )}

                {queueState.status === 'completed' && (
                  queueState.tasks.some((t) => t.status === 'failed') ? (
                    <div className="flex items-center gap-1 w-full">
                      <button
                        onClick={handleRetryFailed}
                        className="flex-1 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-semibold flex items-center justify-center gap-1 shadow-sm transition"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>重试失败项 ({queueState.tasks.filter((t) => t.status === 'failed').length})</span>
                      </button>
                      <button
                        onClick={handleClearQueue}
                        className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition"
                        title="关闭任务"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={handleClearQueue}
                      className="flex-1 py-1 rounded-lg bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 text-[11px] font-semibold"
                    >
                      ✓ 全部完成 (点击关闭)
                    </button>
                  )
                )}
              </div>
            </div>
          )}

          {/* AI 智能一键整理主按钮 */}
          <button
            onClick={() => setIsAutoOrganizeOpen(true)}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold text-xs shadow-md shadow-blue-500/20 transition transform active:scale-95"
          >
            <Sparkles className="w-4 h-4" />
            <span>AI 一键整理与重分类</span>
          </button>

          {/* 收藏夹与回收站列表 */}
          <div className="space-y-1">
            <div className="flex items-center justify-between px-2 text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
              <span>知乎收藏夹</span>
              <button
                onClick={handleSyncCollections}
                className="hover:text-blue-600 dark:hover:text-blue-400 transition"
                title="重新刷新收藏夹列表"
              >
                <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>

            <div className="max-h-[34vh] overflow-y-auto space-y-0.5 pr-1">
              <button
                onClick={() => setSelectedCollectionId('all')}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition ${
                  selectedCollectionId === 'all'
                    ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/30'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <span className="flex items-center gap-2 truncate">
                  <Archive className="w-3.5 h-3.5" /> 全部待分拣内容
                </span>
                <span className="text-[11px] opacity-75">{activeArticles.length}</span>
              </button>

              {collections.map((col) => (
                <div
                  key={col.id}
                  className={`group flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition cursor-pointer ${
                    selectedCollectionId === col.id
                      ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/30'
                      : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                  onClick={() => setSelectedCollectionId(col.id)}
                >
                  <span className="truncate flex-1" title={col.title}>
                    {col.title}
                  </span>
                  
                  <div className="flex items-center gap-1 shrink-0">
                    <span className="text-[11px] opacity-75 mr-1">{col.itemCount || 0}</span>
                    
                    {/* 一键 AI 生成描述 */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleGenerateDesc(col);
                      }}
                      className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-black/10 dark:hover:bg-white/10 text-slate-400 hover:text-amber-500 transition"
                      title="AI 为本收藏夹生成简介"
                    >
                      <FileText className="w-3 h-3" />
                    </button>

                    {/* 拉取同步 */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleFetchArticles(col.id);
                      }}
                      className="p-1 rounded bg-slate-100 hover:bg-blue-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-500 hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-400 transition"
                      title="从知乎拉取最新内容"
                    >
                      <RefreshCw className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* 已移出分拣范围 / 回收站区域 */}
            <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80">
              <button
                onClick={() => setSelectedCollectionId('__trash__')}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition ${
                  selectedCollectionId === '__trash__'
                    ? 'bg-rose-600 text-white shadow-sm shadow-rose-600/30'
                    : 'text-slate-500 dark:text-slate-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 hover:text-rose-600 dark:hover:text-rose-400'
                }`}
              >
                <span className="flex items-center gap-2 truncate">
                  <Trash2 className="w-3.5 h-3.5" /> 已移出分拣 (回收站)
                </span>
                <span className={`text-[11px] px-2 py-0.5 rounded-full ${
                  trashedArticles.length > 0 
                    ? selectedCollectionId === '__trash__' 
                      ? 'bg-white/20 text-white' 
                      : 'bg-rose-100 dark:bg-rose-950/80 text-rose-600 dark:text-rose-400 font-bold' 
                    : 'opacity-60'
                }`}>
                  {trashedArticles.length}
                </span>
              </button>
            </div>
          </div>
        </div>

        {/* 底部撤销与清空 */}
        <div className="pt-3 border-t border-slate-200/60 dark:border-slate-800 space-y-2 text-xs">
          {canUndo && (
            <button
              onClick={handleUndoRecent}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/60 transition font-medium"
            >
              <Undo2 className="w-3.5 h-3.5" /> 撤销上一次操作
            </button>
          )}

          {/* 数据备份与恢复快捷操作 */}
          <div className="grid grid-cols-2 gap-1.5 pt-1">
            <button
              onClick={handleExportBackup}
              className="flex items-center justify-center gap-1 py-1.5 px-2 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition text-[11px] font-medium"
              title="导出当前全部数据为 JSON 文件进行安全冷备份"
            >
              <Download className="w-3 h-3 text-blue-500" />
              <span>数据导出</span>
            </button>

            <button
              onClick={() => sidebarFileInputRef.current?.click()}
              className="flex items-center justify-center gap-1 py-1.5 px-2 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition text-[11px] font-medium"
              title="从 JSON 备份文件还原全量数据"
            >
              <Upload className="w-3 h-3 text-emerald-500" />
              <span>数据导入</span>
            </button>
            <input
              ref={sidebarFileInputRef}
              type="file"
              accept=".json"
              onChange={handleSidebarFileChange}
              className="hidden"
            />
          </div>

          <button
            onClick={handleClearLocalCache}
            className="w-full text-center px-2 py-1 rounded-lg text-slate-400 dark:text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/20 transition text-[11px]"
          >
            清空本地缓存
          </button>
        </div>
      </div>

      {/* 右侧主视窗：分拣台与卡片流 */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        {/* 顶部搜索与筛选栏 */}
        <div className="glass-panel shrink-0 border-b border-slate-200/80 dark:border-slate-800 px-6 py-3.5 flex items-center justify-between gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400 dark:text-slate-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索标题、作者、AI核心观点、标签..."
              className="w-full pl-9 pr-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-white/80 dark:bg-slate-900/80 text-xs text-slate-800 dark:text-slate-100"
            />
          </div>

          {/* 状态筛选药丸标签 (全部 / 值得留 / 可清理 / 不确定 / 已失效) */}
          <div className="flex items-center gap-1.5 bg-slate-100/80 dark:bg-slate-900/80 p-1 rounded-xl text-xs">
            <button
              onClick={() => setFilterRating('all')}
              className={`px-2.5 py-1 rounded-lg font-medium transition ${
                filterRating === 'all'
                  ? 'bg-white dark:bg-slate-800 shadow-sm text-slate-900 dark:text-slate-100'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              全部 ({currentPool.length})
            </button>
            <button
              onClick={() => setFilterRating('keep')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg font-medium transition ${
                filterRating === 'keep' ? 'bg-emerald-500 text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-emerald-600'
              }`}
            >
              <CheckCircle2 className="w-3 h-3" />
              值得留 ({currentPool.filter((a) => a.aiTriageRating === 'keep').length})
            </button>
            <button
              onClick={() => setFilterRating('discard')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg font-medium transition ${
                filterRating === 'discard' ? 'bg-rose-500 text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-rose-600'
              }`}
            >
              <XCircle className="w-3 h-3" />
              可清理 ({currentPool.filter((a) => a.aiTriageRating === 'discard').length})
            </button>
            <button
              onClick={() => setFilterRating('review')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg font-medium transition ${
                filterRating === 'review' ? 'bg-amber-500 text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-amber-600'
              }`}
            >
              <HelpCircle className="w-3 h-3" />
              不确定 ({currentPool.filter((a) => a.aiTriageRating === 'review').length})
            </button>
            <button
              onClick={() => setFilterRating('invalid')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg font-medium transition ${
                filterRating === 'invalid' ? 'bg-red-500 text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-red-600'
              }`}
            >
              <AlertTriangle className="w-3 h-3" />
              已失效 ({currentPool.filter((a) => a.isDeletedOrInvalid).length})
            </button>
          </div>
        </div>

        {/* 标签过滤与全局收敛管理栏 (当有标签存在时显示) */}
        {availableTags.length > 0 && !isTrashView && (
          <div className="px-6 py-2 bg-slate-50/80 dark:bg-slate-900/40 border-b border-slate-200/60 dark:border-slate-800 flex items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-1.5 overflow-x-auto py-0.5 min-w-0 pr-2">
              <span className="text-[11px] text-slate-400 font-semibold flex items-center gap-1 shrink-0">
                <Tag className="w-3 h-3 text-indigo-500" /> 标签筛选 ({availableTags.length}个):
              </span>
              <button
                onClick={() => setSelectedTag('')}
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
                    onClick={() => setSelectedTag(selectedTag === tag ? '' : tag)}
                    className={`group/topTag px-2 py-0.5 rounded-md text-[11px] font-medium transition shrink-0 flex items-center gap-1 cursor-pointer select-none ${
                      selectedTag === tag
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'bg-white dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 border border-slate-200/60 dark:border-slate-700 hover:border-indigo-300 hover:text-indigo-600'
                    }`}
                  >
                    <span>#{tag}</span>
                    <span className="opacity-70 text-[10px]">({count})</span>
                    <button
                      onClick={(e) => handleRemoveGlobalTag(tag, e)}
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
                onClick={handleClearAllTags}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-rose-200 dark:border-rose-900/60 bg-rose-50/70 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 hover:bg-rose-100 transition text-[11px] font-medium"
                title="清空当前所有文章的历史标签，彻底解决标签膨胀，以便重新规范分类"
              >
                <Trash2 className="w-3 h-3" />
                <span>清空全部旧标签</span>
              </button>
            </div>
          </div>
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
        <div className="px-6 py-2.5 bg-slate-100/40 dark:bg-slate-900/40 border-b border-slate-200/50 dark:border-slate-800 flex items-center justify-between text-xs">
          <div className="flex items-center gap-3">
            <button
              onClick={handleToggleSelectAll}
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
                    onClick={() => handleBatchAI('quick')}
                    disabled={loading}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/60 font-medium transition text-xs"
                    title="【阶段1·初筛】正文限前3000字，评级分拣(留/删/疑)，不打标签"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    1. 批量粗读初筛
                  </button>

                  <button
                    onClick={() => handleBatchAI('categorize')}
                    disabled={loading}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/60 font-medium transition text-xs"
                    title="【阶段2·分类】归档推荐与规范打标，优先收敛已有标签池，严格限制1~2个标签"
                  >
                    <Tag className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                    2. 批量词条分类
                  </button>

                  <button
                    onClick={() => handleBatchAI('deep')}
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
                        handleBatchMove(e.target.value);
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
                    onClick={handleBatchMoveToTrash}
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
                    onClick={handleBatchRestore}
                    disabled={loading}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 font-medium transition"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    批量恢复回分拣台
                  </button>

                  <button
                    onClick={handleBatchPermanentDelete}
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

        {/* 卡片流展示区 */}
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
                  isQueueProcessing={queueState.currentArticleId === article.id}
                  onSelect={(sel) => {
                    const next = new Set(selectedIds);
                    sel ? next.add(article.id) : next.delete(article.id);
                    setSelectedIds(next);
                  }}
                  onQuickRead={() => handleAnalyzeSingle(article, 'quick')}
                  onCategorize={() => handleAnalyzeSingle(article, 'categorize')}
                  onDeepRead={() => handleAnalyzeSingle(article, 'deep')}
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
                    await handleMoveToTrashSingle(article);
                  }}
                  onRestore={async () => {
                    // 从回收站恢复
                    await handleRestoreSingle(article);
                  }}
                  onPermanentDelete={async () => {
                    // 彻底删除
                    await handlePermanentDeleteSingle(article);
                  }}
                  onUpdateRating={async (rating) => {
                    await db.articles.update(article.id, { aiTriageRating: rating });
                  }}
                  onUpdateTags={async (tags) => {
                    await db.articles.update(article.id, { tags });
                  }}
                  onTagClick={(tag) => {
                    setSelectedTag(selectedTag === tag ? '' : tag);
                  }}
                />
              ))}
            </div>
          )}
        </div>
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
