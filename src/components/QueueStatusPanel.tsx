import React from 'react';
import {
  Loader2,
  Pause,
  Play,
  AlertCircle,
  CheckCircle2,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import type { AIQueueState } from '../services/aiQueue';

interface QueueStatusPanelProps {
  queueState: AIQueueState;
  onPause: () => void;
  onResume: () => void;
  onClear: () => void;
  onRetryFailed: () => void;
}

export const QueueStatusPanel: React.FC<QueueStatusPanelProps> = ({
  queueState,
  onPause,
  onResume,
  onClear,
  onRetryFailed,
}) => {
  if (queueState.status === 'idle' || queueState.tasks.length === 0) return null;
  return (
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
          onClick={onPause}
          className="flex-1 flex items-center justify-center gap-1 py-1 rounded-lg bg-amber-500 text-white hover:bg-amber-600 text-[11px] font-semibold shadow-sm transition"
        >
          <Pause className="w-3 h-3" />
          <span>暂停任务</span>
        </button>
      )}

      {queueState.status === 'paused' && (
        <>
          <button
            onClick={onResume}
            className="flex-1 flex items-center justify-center gap-1 py-1 rounded-lg bg-blue-600 text-white hover:bg-blue-700 text-[11px] font-semibold shadow-sm transition"
          >
            <Play className="w-3 h-3 fill-current" />
            <span>继续分析</span>
          </button>
          <button
            onClick={onClear}
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
              onClick={onRetryFailed}
              className="flex-1 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-semibold flex items-center justify-center gap-1 shadow-sm transition"
            >
              <RotateCcw className="w-3 h-3" />
              <span>重试失败项 ({queueState.tasks.filter((t) => t.status === 'failed').length})</span>
            </button>
            <button
              onClick={onClear}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition"
              title="关闭任务"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <button
            onClick={onClear}
            className="flex-1 py-1 rounded-lg bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 text-[11px] font-semibold"
          >
            ✓ 全部完成 (点击关闭)
          </button>
        )
      )}
    </div>
  </div>
  );
};