import React, { useState, useEffect } from 'react';
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
  Redo2,
  Check
} from 'lucide-react';
import { db, type ZhihuArticleItem, type ZhihuCollection } from '../db';
import { ArticleCard } from '../components/ArticleCard';
import { SettingsModal } from '../components/SettingsModal';
import { DescriptionModal } from '../components/DescriptionModal';
import { 
  fetchUserCollectionsList, 
  fetchCollectionContents, 
  moveArticleBetweenCollections, 
  removeArticleFromCollection
} from '../services/zhihuApi';
import { analyzeArticleWithAI, generateCollectionDescription } from '../services/ai';

interface HistoryRecord {
  article: ZhihuArticleItem;
  fromCollectionId: string;
  toCollectionId?: string;
  action: 'move' | 'delete';
  undone?: boolean;
}

export const Dashboard: React.FC = () => {
  const [selectedCollectionId, setSelectedCollectionId] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterRating, setFilterRating] = useState<'all' | 'keep' | 'discard' | 'review' | 'invalid'>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [syncProgress, setSyncProgress] = useState<string>('');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // 描述生成弹窗状态
  const [descModalData, setDescModalData] = useState<{
    isOpen: boolean;
    colId: string;
    colTitle: string;
    desc: string;
  }>({ isOpen: false, colId: '', colTitle: '', desc: '' });

  // 撤销/重做操作历史记录
  const [historyList, setHistoryList] = useState<HistoryRecord[]>([]);

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
      // 优先从已缓存的本地文章中取前 15 篇
      let colArticles = await db.articles.where('collectionId').equals(col.id).toArray();
      if (colArticles.length === 0) {
        // 若本地未缓存，则先拉取
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

  // 过滤展示的列表
  const filteredArticles = articles.filter((item) => {
    if (selectedCollectionId !== 'all' && item.collectionId !== selectedCollectionId) {
      return false;
    }
    if (filterRating === 'invalid' && !item.isDeletedOrInvalid) {
      return false;
    }
    if (['keep', 'discard', 'review'].includes(filterRating) && item.aiTriageRating !== filterRating) {
      return false;
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const inTitle = item.title?.toLowerCase().includes(q);
      const inAuthor = item.authorName?.toLowerCase().includes(q);
      const inSummary = item.aiSummary?.toLowerCase().includes(q);
      return inTitle || inAuthor || inSummary;
    }
    return true;
  });

  // 全选/反选
  const handleToggleSelectAll = () => {
    if (selectedIds.size === filteredArticles.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredArticles.map((a) => a.id)));
    }
  };

  // 单条 AI 分析
  const handleAnalyzeSingle = async (article: ZhihuArticleItem) => {
    const res = await analyzeArticleWithAI(
      article.title,
      article.fullContent || article.title,
      collections
    );
    await db.articles.update(article.id, {
      aiSummary: res.summary,
      aiKeyTakeaways: res.keyTakeaways,
      aiCategory: res.recommendedCategory,
      aiTriageRating: res.triageRating,
      aiTriageReason: res.triageReason,
      aiProcessedAt: Date.now(),
    });
  };

  // 批量 AI 快速分拣
  const handleBatchAI = async () => {
    const targets = filteredArticles.filter((a) => selectedIds.has(a.id));
    if (targets.length === 0) {
      alert('请先勾选需要 AI 摘读分拣的文章！');
      return;
    }

    setLoading(true);
    let done = 0;
    for (const item of targets) {
      setSyncProgress(`正在 AI 分析 (${++done}/${targets.length}): ${item.title.slice(0, 15)}...`);
      try {
        await handleAnalyzeSingle(item);
      } catch (e) {
        console.warn('单条 AI 分析失败:', e);
      }
    }
    setLoading(false);
    setSyncProgress('');
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

  // 一键撤销最近的移动操作
  const handleUndoRecent = async () => {
    const lastActive = historyList.find((h) => !h.undone);
    if (!lastActive) return;

    setLoading(true);
    setSyncProgress(`正在撤销: 移回「${lastActive.article.title.slice(0, 15)}...」`);
    try {
      if (lastActive.action === 'move' && lastActive.toCollectionId) {
        await moveArticleBetweenCollections(
          lastActive.article.contentId,
          lastActive.article.contentType,
          lastActive.toCollectionId,
          lastActive.fromCollectionId
        );
        await db.articles.put(lastActive.article);
        lastActive.undone = true;
        setHistoryList([...historyList]);
      }
    } catch (e: any) {
      alert(`撤销失败: ${e.message}`);
    } finally {
      setLoading(false);
      setSyncProgress('');
    }
  };

  // 批量取消收藏
  const handleBatchRemove = async () => {
    const targets = filteredArticles.filter((a) => selectedIds.has(a.id));
    if (targets.length === 0) return;

    if (!confirm(`⚠️ 警告：确定将选中的 ${targets.length} 条内容彻底从收藏夹移除/取消收藏吗？`)) return;

    setLoading(true);
    let count = 0;
    for (const item of targets) {
      setSyncProgress(`正在从知乎移除 (${++count}/${targets.length})...`);
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
    alert(`已成功移除 ${count} 条收藏！`);
  };

  const handleClearLocalCache = async () => {
    if (confirm('确定清空本地缓存的知乎文章和 AI 分析结果吗？（不影响知乎线上的收藏夹）')) {
      await db.articles.clear();
      setSelectedIds(new Set());
    }
  };

  const totalCount = articles.length;
  const keepCount = articles.filter((a) => a.aiTriageRating === 'keep').length;
  const discardCount = articles.filter((a) => a.aiTriageRating === 'discard').length;
  const invalidCount = articles.filter((a) => a.isDeletedOrInvalid).length;
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
                <span className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">MoonDigest 分拣台</span>
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

          {/* 状态统计迷你卡片 */}
          <div className="grid grid-cols-3 gap-1.5 p-2 rounded-2xl bg-white/70 dark:bg-slate-900/60 border border-slate-100 dark:border-slate-800 text-center text-xs">
            <div className="p-1.5 rounded-xl bg-slate-50 dark:bg-slate-800/60">
              <span className="block text-[11px] text-slate-400 dark:text-slate-500">总收藏</span>
              <span className="font-bold text-slate-800 dark:text-slate-200 text-sm">{totalCount}</span>
            </div>
            <div className="p-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40">
              <span className="block text-[11px] text-emerald-600 dark:text-emerald-400">留存</span>
              <span className="font-bold text-emerald-700 dark:text-emerald-300 text-sm">{keepCount}</span>
            </div>
            <div className="p-1.5 rounded-xl bg-amber-50 dark:bg-amber-950/40">
              <span className="block text-[11px] text-amber-600 dark:text-amber-400">建议弃置</span>
              <span className="font-bold text-amber-700 dark:text-amber-300 text-sm">{discardCount}</span>
            </div>
          </div>

          {/* 收藏夹列表 */}
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

            <div className="max-h-[38vh] overflow-y-auto space-y-0.5 pr-1">
              <button
                onClick={() => setSelectedCollectionId('all')}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition ${
                  selectedCollectionId === 'all'
                    ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/30'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <span className="flex items-center gap-2 truncate">
                  <Archive className="w-3.5 h-3.5" /> 全部缓存条目
                </span>
                <span className="text-[11px] opacity-75">{articles.length}</span>
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
          </div>
        </div>

        {/* 底部功能链接 */}
        <div className="pt-3 border-t border-slate-200/60 dark:border-slate-800 space-y-2 text-xs">
          {canUndo && (
            <button
              onClick={handleUndoRecent}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-200/60 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-300/60 transition font-medium"
            >
              <Undo2 className="w-3.5 h-3.5" /> 撤销上一次移动
            </button>
          )}

          <button
            onClick={handleClearLocalCache}
            className="w-full text-left px-2 py-1 rounded-lg text-slate-400 dark:text-slate-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/20 transition"
          >
            清空本地缓存
          </button>
          <div className="px-2 text-[11px] text-slate-400 dark:text-slate-500">
            MoonDigest 风格 · 离线优先架构
          </div>
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
              placeholder="搜索标题、作者、AI核心观点..."
              className="w-full pl-9 pr-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-white/80 dark:bg-slate-900/80 text-xs text-slate-800 dark:text-slate-100"
            />
          </div>

          {/* 状态筛选药丸标签 */}
          <div className="flex items-center gap-1.5 bg-slate-100/80 dark:bg-slate-900/80 p-1 rounded-xl text-xs">
            <button
              onClick={() => setFilterRating('all')}
              className={`px-2.5 py-1 rounded-lg font-medium transition ${
                filterRating === 'all'
                  ? 'bg-white dark:bg-slate-800 shadow-sm text-slate-900 dark:text-slate-100'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              全部 ({articles.length})
            </button>
            <button
              onClick={() => setFilterRating('keep')}
              className={`px-2.5 py-1 rounded-lg font-medium transition ${
                filterRating === 'keep' ? 'bg-emerald-500 text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-emerald-600'
              }`}
            >
              留存 ({keepCount})
            </button>
            <button
              onClick={() => setFilterRating('discard')}
              className={`px-2.5 py-1 rounded-lg font-medium transition ${
                filterRating === 'discard' ? 'bg-amber-500 text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-amber-600'
              }`}
            >
              建议弃置 ({discardCount})
            </button>
            <button
              onClick={() => setFilterRating('invalid')}
              className={`px-2.5 py-1 rounded-lg font-medium transition ${
                filterRating === 'invalid' ? 'bg-red-500 text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-red-600'
              }`}
            >
              已失效 ({invalidCount})
            </button>
          </div>
        </div>

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
              <button
                onClick={handleBatchAI}
                disabled={loading}
                className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/60 font-medium transition"
              >
                <Sparkles className="w-3.5 h-3.5" />
                AI 批量摘读评级
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
                onClick={handleBatchRemove}
                disabled={loading}
                className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-red-50 dark:bg-red-950/60 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/60 font-medium transition"
              >
                <Trash2 className="w-3.5 h-3.5" />
                批量取消/清理
              </button>
            </div>
          )}
        </div>

        {/* 卡片流展示区 */}
        <div className="flex-1 overflow-y-auto p-6">
          {filteredArticles.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-400 dark:text-slate-600 space-y-3">
              <div className="w-16 h-16 rounded-3xl bg-slate-100 dark:bg-slate-900 flex items-center justify-center text-slate-300 dark:text-slate-700">
                <FolderOpen className="w-8 h-8" />
              </div>
              <p className="text-sm">暂无内容，请在左侧收藏夹点击刷新拉取</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredArticles.map((article) => (
                <ArticleCard
                  key={article.id}
                  article={article}
                  collections={collections}
                  isSelected={selectedIds.has(article.id)}
                  onSelect={(sel) => {
                    const next = new Set(selectedIds);
                    sel ? next.add(article.id) : next.delete(article.id);
                    setSelectedIds(next);
                  }}
                  onTriageAI={() => handleAnalyzeSingle(article)}
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
                    if (confirm(`确定取消收藏「${article.title}」吗？`)) {
                      if (!article.isDeletedOrInvalid) {
                        await removeArticleFromCollection(
                          article.contentId,
                          article.contentType,
                          article.collectionId
                        );
                      }
                      await db.articles.delete(article.id);
                    }
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
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
