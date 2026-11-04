import React, { useState } from 'react';
import { 
  Sparkles, 
  Pause, 
  Play, 
  X, 
  CheckCircle2, 
  AlertCircle,
  AlertTriangle,
  Loader2,
  Trash2,
  Minimize2,
  Maximize2,
  RotateCcw,
  Settings
} from 'lucide-react';
import { type AIQueueState } from '../services/aiQueue';

interface AIQueueBarProps {
  queueState: AIQueueState;
  onPause: () => void;
  onResume: () => void;
  onClear: () => void;
  onRetryFailed?: () => void;
  onOpenSettings?: () => void;
}

export const AIQueueBar: React.FC<AIQueueBarProps> = ({
  queueState,
  onPause,
  onResume,
  onClear,
  onRetryFailed,
  onOpenSettings,
}) => {
  const [isMinimized, setIsMinimized] = useState<boolean>(false);
  const { status, mode, tasks, currentTitle } = queueState;

  if (status === 'idle' || tasks.length === 0) {
    return null;
  }

  const total = tasks.length;
  const doneCount = tasks.filter((t) => t.status === 'done').length;
  const failedTasks = tasks.filter((t) => t.status === 'failed');
  const failedCount = failedTasks.length;
  const pendingCount = tasks.filter((t) => t.status === 'pending' || t.status === 'processing').length;
  const percent = total > 0 ? Math.round(((doneCount + failedCount) / total) * 100) : 0;
  const firstError = failedTasks.find((t) => t.error)?.error;

  const getModeLabel = () => {
    if (mode === 'categorize') return '🏷️ 2. 词条分类 (限1~2标签)';
    if (mode === 'deep') return '✨ 3. 深度精读 (+热评Top5)';
    return '⚡ 1. 快速粗读初筛';
  };

  const getPillLabel = () => {
    if (mode === 'categorize') return '分类';
    if (mode === 'deep') return '精读';
    return '粗读';
  };

  // 最小化胶囊状态 (避免遮挡视线，保持极简)
  if (isMinimized) {
    return (
      <div className="fixed bottom-6 right-6 z-40 animate-fade-in">
        <div className="flex items-center gap-2.5 px-3.5 py-2 rounded-2xl bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border border-slate-200/80 dark:border-slate-800 shadow-xl shadow-slate-900/10 dark:shadow-black/40 text-xs">
          <div className="flex items-center gap-2">
            {status === 'running' ? (
              <Loader2 className="w-3.5 h-3.5 text-blue-500 animate-spin" />
            ) : status === 'paused' ? (
              <Pause className="w-3.5 h-3.5 text-amber-500" />
            ) : failedCount > 0 && doneCount === 0 ? (
              <AlertCircle className="w-3.5 h-3.5 text-rose-500" />
            ) : failedCount > 0 ? (
              <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
            ) : (
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
            )}
            <span className="font-bold text-slate-800 dark:text-slate-200">
              {doneCount}/{total} ({percent}%)
            </span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 font-medium">
              {getPillLabel()}
            </span>
          </div>

          <div className="h-3 w-px bg-slate-200 dark:bg-slate-700" />

          {status === 'running' && (
            <button
              onClick={onPause}
              className="p-1 rounded-lg text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/40 transition"
              title="暂停"
            >
              <Pause className="w-3.5 h-3.5" />
            </button>
          )}

          {status === 'paused' && (
            <button
              onClick={onResume}
              className="p-1 rounded-lg text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/40 transition"
              title="继续执行"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
            </button>
          )}

          {failedCount > 0 && onRetryFailed && (
            <button
              onClick={onRetryFailed}
              className="p-1 rounded-lg text-blue-600 hover:bg-blue-50 transition"
              title={`重试 ${failedCount} 篇失败项`}
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          )}

          <button
            onClick={() => setIsMinimized(false)}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition"
            title="展开详细浮岛"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    );
  }

  // 展开的完整浮岛状态
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-[92%] max-w-2xl animate-fade-in">
      <div className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border border-slate-200/80 dark:border-slate-800 rounded-3xl p-4 shadow-2xl shadow-slate-900/10 dark:shadow-black/50 space-y-3 transition-all duration-200">
        {/* 顶部标题与状态标识 */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            {status === 'running' && (
              <div className="w-8 h-8 rounded-2xl bg-blue-50 dark:bg-blue-950/80 flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0">
                <Loader2 className="w-4 h-4 animate-spin" />
              </div>
            )}
            {status === 'paused' && (
              <div className="w-8 h-8 rounded-2xl bg-amber-50 dark:bg-amber-950/80 flex items-center justify-center text-amber-600 dark:text-amber-400 shrink-0">
                <Pause className="w-4 h-4" />
              </div>
            )}
            {status === 'completed' && (
              failedCount === 0 ? (
                <div className="w-8 h-8 rounded-2xl bg-emerald-50 dark:bg-emerald-950/80 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
              ) : doneCount === 0 ? (
                <div className="w-8 h-8 rounded-2xl bg-rose-50 dark:bg-rose-950/80 flex items-center justify-center text-rose-600 dark:text-rose-400 shrink-0">
                  <AlertCircle className="w-4 h-4" />
                </div>
              ) : (
                <div className="w-8 h-8 rounded-2xl bg-amber-50 dark:bg-amber-950/80 flex items-center justify-center text-amber-600 dark:text-amber-400 shrink-0">
                  <AlertTriangle className="w-4 h-4" />
                </div>
              )
            )}

            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-bold text-xs text-slate-800 dark:text-slate-100">
                  {status === 'running' && 'AI 分拣队列运行中'}
                  {status === 'paused' && 'AI 分拣队列已暂停 (断点已保护)'}
                  {status === 'completed' && (
                    failedCount === 0
                      ? '🎉 AI 分拣队列已全部完成'
                      : doneCount === 0
                      ? `❌ AI 分拣队列执行失败 (${failedCount} 篇异常)`
                      : `⚠️ AI 分拣完成 (含 ${failedCount} 篇异常)`
                  )}
                </span>
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                  mode === 'deep'
                    ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border border-indigo-200/50 dark:border-indigo-800/50'
                    : mode === 'categorize'
                    ? 'bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 border border-amber-200/50 dark:border-amber-800/50'
                    : 'bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 border border-blue-200/50 dark:border-blue-800/50'
                }`}>
                  {getModeLabel()}
                </span>
              </div>

              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                {status === 'running' && (currentTitle ? `正在处理: ${currentTitle}` : '正在准备下一篇...')}
                {status === 'paused' && `已完成 ${doneCount} 篇，剩余 ${pendingCount} 篇待处理，随时可点击继续`}
                {status === 'completed' && (
                  failedCount === 0
                    ? `本次任务共 ${total} 篇内容全部完成处理`
                    : `失败原因: ${firstError || '大模型请求异常，请检查接口配置或网络'}`
                )}
              </p>
            </div>
          </div>

          {/* 右侧动作控制按钮 */}
          <div className="flex items-center gap-1.5 shrink-0">
            {status === 'running' && (
              <button
                onClick={onPause}
                className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-amber-500 text-white hover:bg-amber-600 active:scale-95 text-xs font-semibold shadow-md shadow-amber-500/20 transition"
                title="暂停当前 AI 队列处理"
              >
                <Pause className="w-3.5 h-3.5" />
                <span>暂停</span>
              </button>
            )}

            {status === 'paused' && (
              <>
                <button
                  onClick={onResume}
                  className="flex items-center gap-1 px-3.5 py-1.5 rounded-xl bg-blue-600 text-white hover:bg-blue-700 active:scale-95 text-xs font-semibold shadow-md shadow-blue-600/20 transition"
                  title="继续执行剩余文章的 AI 分拣"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>继续执行</span>
                </button>

                <button
                  onClick={onClear}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 text-xs font-medium transition"
                  title="放弃剩余任务并清空队列"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>清空</span>
                </button>
              </>
            )}

            {failedCount > 0 && onRetryFailed && (
              <button
                onClick={onRetryFailed}
                className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-blue-600 text-white hover:bg-blue-700 active:scale-95 text-xs font-semibold shadow-md shadow-blue-600/20 transition"
                title="一键重新尝试处理所有异常项"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>重试失败项 ({failedCount})</span>
              </button>
            )}

            {failedCount > 0 && onOpenSettings && (
              <button
                onClick={onOpenSettings}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-medium transition"
                title="检查 AI 接口、模型与 API Key 设置"
              >
                <Settings className="w-3.5 h-3.5" />
                <span>检查设置</span>
              </button>
            )}

            {status === 'completed' && (
              <button
                onClick={onClear}
                className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-medium transition"
              >
                <X className="w-3.5 h-3.5" />
                <span>关闭</span>
              </button>
            )}

            {/* 最小化折叠按钮 */}
            <button
              onClick={() => setIsMinimized(true)}
              className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              title="折叠为右下角微缩胶囊"
            >
              <Minimize2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* 底部进度条与数据指示 */}
        <div className="space-y-1">
          <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-300 rounded-full ${
                status === 'completed'
                  ? failedCount === 0
                    ? 'bg-emerald-500'
                    : doneCount === 0
                    ? 'bg-rose-500'
                    : 'bg-amber-500'
                  : status === 'paused'
                  ? 'bg-amber-500'
                  : 'bg-gradient-to-r from-blue-600 to-indigo-500 animate-pulse'
              }`}
              style={{ width: `${percent}%` }}
            />
          </div>

          <div className="flex items-center justify-between text-[10px] text-slate-400 dark:text-slate-500">
            <span>
              已完成 {doneCount} / {total} 篇 ({percent}%)
              {failedCount > 0 && <span className="text-rose-500 font-semibold ml-1">· {failedCount} 篇异常</span>}
            </span>
            <span>
              {status === 'running' 
                ? '分拣进行中...' 
                : status === 'paused' 
                ? '队列已暂停' 
                : failedCount === 0 
                ? '全部成功完成' 
                : doneCount === 0 
                ? '全部执行失败' 
                : '已完成(含异常)'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
