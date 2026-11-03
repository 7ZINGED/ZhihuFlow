import React from 'react';
import { 
  Sparkles, 
  Pause, 
  Play, 
  X, 
  CheckCircle2, 
  AlertCircle,
  Loader2,
  Trash2
} from 'lucide-react';
import { type AIQueueState } from '../services/aiQueue';

interface AIQueueBarProps {
  queueState: AIQueueState;
  onPause: () => void;
  onResume: () => void;
  onClear: () => void;
}

export const AIQueueBar: React.FC<AIQueueBarProps> = ({
  queueState,
  onPause,
  onResume,
  onClear,
}) => {
  const { status, mode, tasks, currentTitle } = queueState;

  if (status === 'idle' || tasks.length === 0) {
    return null;
  }

  const total = tasks.length;
  const doneCount = tasks.filter((t) => t.status === 'done').length;
  const failedCount = tasks.filter((t) => t.status === 'failed').length;
  const pendingCount = tasks.filter((t) => t.status === 'pending' || t.status === 'processing').length;
  const percent = total > 0 ? Math.round(((doneCount + failedCount) / total) * 100) : 0;

  const isDeep = mode === 'deep';

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
              <div className="w-8 h-8 rounded-2xl bg-emerald-50 dark:bg-emerald-950/80 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0">
                <CheckCircle2 className="w-4 h-4" />
              </div>
            )}

            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-bold text-xs text-slate-800 dark:text-slate-100">
                  {status === 'running' && 'AI 分拣队列运行中'}
                  {status === 'paused' && 'AI 分拣队列已暂停 (刷新已保护)'}
                  {status === 'completed' && '🎉 AI 分拣队列已全部完成'}
                </span>
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                  isDeep 
                    ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border border-indigo-200/50 dark:border-indigo-800/50'
                    : 'bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 border border-blue-200/50 dark:border-blue-800/50'
                }`}>
                  {isDeep ? '✨ 深度精读 (+热评Top5)' : '⚡ 快速粗读 (3000字截断)'}
                </span>
              </div>

              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                {status === 'running' && (currentTitle ? `正在分析: ${currentTitle}` : '正在准备下一篇...')}
                {status === 'paused' && `已完成 ${doneCount} 篇，剩余 ${pendingCount} 篇待处理，随时可点击继续`}
                {status === 'completed' && `本次任务共 ${total} 篇内容全部完成 AI 分析分类与标签提炼`}
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
                  <span>清空队列</span>
                </button>
              </>
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
          </div>
        </div>

        {/* 底部进度条与数据指示 */}
        <div className="space-y-1">
          <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-300 rounded-full ${
                status === 'completed'
                  ? 'bg-emerald-500'
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
              {failedCount > 0 && <span className="text-rose-500 ml-1">· {failedCount} 篇异常</span>}
            </span>
            <span>
              {status === 'running' ? '分拣进行中...' : status === 'paused' ? '队列等待中' : '分拣完成'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
