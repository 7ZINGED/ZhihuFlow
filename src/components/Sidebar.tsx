import React from 'react';
import { Sparkles, Moon, Sun, Settings, RefreshCw, Archive, Trash2, FileText, Undo2, Upload, Download } from 'lucide-react';
import type { ZhihuArticleItem, ZhihuCollection } from '../db';
import type { AIQueueState } from '../services/aiQueue';
import { QueueStatusPanel } from './QueueStatusPanel';

interface SidebarProps {
  activeArticles: readonly ZhihuArticleItem[];
  trashedArticles: readonly ZhihuArticleItem[];
  collections: readonly ZhihuCollection[];
  selectedCollectionId: string;
  queueState: AIQueueState;
  isDark: boolean;
  canUndo: boolean;
  loading: boolean;
  sidebarFileInputRef: React.RefObject<HTMLInputElement | null>;
  onSelectCollection: (id: string) => void;
  onSetDark: (v: boolean) => void;
  onOpenSettings: () => void;
  onOpenAutoOrganize: () => void;
  onPauseQueue: () => void;
  onResumeQueue: () => void;
  onClearQueue: () => void;
  onRetryFailed: () => void;
  onSyncCollections: () => void;
  onFetchArticles: (id: string) => void;
  onGenerateDesc: (col: ZhihuCollection) => void;
  onUndoRecent: () => void;
  onExportBackup: () => void;
  onSidebarFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onClearLocalCache: () => void;
}

export const Sidebar: React.FC<SidebarProps> = (props) => {
  const {
    activeArticles, trashedArticles, collections, selectedCollectionId,
    queueState, isDark, canUndo, loading, sidebarFileInputRef,
    onSelectCollection, onSetDark, onOpenSettings, onOpenAutoOrganize,
    onPauseQueue, onResumeQueue, onClearQueue, onRetryFailed,
    onSyncCollections, onFetchArticles, onGenerateDesc,
    onUndoRecent, onExportBackup, onSidebarFileChange, onClearLocalCache,
  } = props;
  const totalCount = activeArticles.length;
  const keepCount = activeArticles.filter((a) => a.aiTriageRating === 'keep').length;
  const discardCount = activeArticles.filter((a) => a.aiTriageRating === 'discard').length;
  const reviewCount = activeArticles.filter((a) => a.aiTriageRating === 'review').length;
  return (
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
            onClick={() => onSetDark(!isDark)}
            className="p-1.5 rounded-xl hover:bg-slate-200/60 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition"
            title={isDark ? '切换亮色模式' : '切换暗黑模式'}
          >
            {isDark ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4" />}
          </button>

          <button
            onClick={() => onOpenSettings()}
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

      <QueueStatusPanel
        queueState={queueState}
        onPause={onPauseQueue}
        onResume={onResumeQueue}
        onClear={onClearQueue}
        onRetryFailed={onRetryFailed}
      />

      {/* AI 智能一键整理主按钮 */}
      <button
        onClick={() => onOpenAutoOrganize()}
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
            onClick={onSyncCollections}
            className="hover:text-blue-600 dark:hover:text-blue-400 transition"
            title="重新刷新收藏夹列表"
          >
            <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        <div className="max-h-[34vh] overflow-y-auto space-y-0.5 pr-1">
          <button
            onClick={() => onSelectCollection('all')}
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
              onClick={() => onSelectCollection(col.id)}
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
                    onGenerateDesc(col);
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
                    onFetchArticles(col.id);
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
            onClick={() => onSelectCollection('__trash__')}
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
          onClick={onUndoRecent}
          className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/60 transition font-medium"
        >
          <Undo2 className="w-3.5 h-3.5" /> 撤销上一次操作
        </button>
      )}

      {/* 数据备份与恢复快捷操作 */}
      <div className="grid grid-cols-2 gap-1.5 pt-1">
        <button
          onClick={onExportBackup}
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
          onChange={onSidebarFileChange}
          className="hidden"
        />
      </div>

      <button
        onClick={onClearLocalCache}
        className="w-full text-center px-2 py-1 rounded-lg text-slate-400 dark:text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/20 transition text-[11px]"
      >
        清空本地缓存
      </button>
    </div>
  </div>
  );
};
