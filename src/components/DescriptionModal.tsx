import React, { useState } from 'react';
import { Sparkles, X, Check, Edit3 } from 'lucide-react';
import { updateCollectionDescription } from '../services/zhihuApi';

interface DescriptionModalProps {
  isOpen: boolean;
  onClose: () => void;
  collectionId: string;
  collectionTitle: string;
  initialDescription: string;
  onSaved: (newDesc: string) => void;
}

export const DescriptionModal: React.FC<DescriptionModalProps> = ({
  isOpen,
  onClose,
  collectionId,
  collectionTitle,
  initialDescription,
  onSaved,
}) => {
  const [desc, setDesc] = useState(initialDescription);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleApply = async () => {
    setSaving(true);
    setError('');
    try {
      await updateCollectionDescription(collectionId, collectionTitle, desc.trim());
      onSaved(desc.trim());
      onClose();
    } catch (e: any) {
      setError(e.message || '更新失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-fade-in">
      <div className="glass-panel w-full max-w-md rounded-3xl p-6 shadow-2xl space-y-4 border border-slate-200 dark:border-slate-800">
        <div className="flex items-center justify-between pb-2 border-b border-slate-200/60 dark:border-slate-800">
          <div className="flex items-center gap-2 text-slate-800 dark:text-slate-100 font-bold text-sm">
            <Sparkles className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <span>AI 生成收藏夹描述 · 「{collectionTitle}」</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-2">
          <label className="text-xs text-slate-500 dark:text-slate-400">
            你可以在此微调，确认后将直接通过 API 写入并同步到知乎线上：
          </label>
          <textarea
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            rows={4}
            className="w-full p-3 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            placeholder="AI 正在或已生成的收藏夹描述..."
          />
          <div className="flex justify-between text-[11px] text-slate-400">
            <span>建议控制在 50 字以内</span>
            <span>{desc.length} 字</span>
          </div>
        </div>

        {error && <p className="text-xs text-red-500">{error}</p>}

        <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-xl text-xs text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 font-medium"
          >
            取消
          </button>
          <button
            onClick={handleApply}
            disabled={saving}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-xs bg-blue-600 hover:bg-blue-700 text-white font-medium shadow-md shadow-blue-500/20 disabled:opacity-50"
          >
            <Check className="w-3.5 h-3.5" />
            {saving ? '同步到知乎中...' : '确认并同步到知乎'}
          </button>
        </div>
      </div>
    </div>
  );
};
