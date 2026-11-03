import React, { useState, useEffect, useRef } from 'react';
import { Settings, X, Save, Key, Globe, Cpu, Download, Upload, Database, CheckCircle2, AlertCircle } from 'lucide-react';
import { type AISettings } from '../db';
import { getAISettings, saveAISettings } from '../services/ai';
import { exportAllDataToJson, importDataFromJsonFile } from '../services/backup';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDataImported?: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, onDataImported }) => {
  const [settings, setSettings] = useState<AISettings>({
    endpoint: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
    apiKey: '',
  });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [backupMsg, setBackupMsg] = useState('');
  const [backupLoading, setBackupLoading] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      getAISettings().then(setSettings);
      setMsg('');
      setBackupMsg('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveAISettings(settings);
      setMsg('设置已成功保存！');
      setTimeout(() => {
        setMsg('');
        onClose();
      }, 800);
    } finally {
      setSaving(false);
    }
  };

  const handleExportBackup = async () => {
    setBackupLoading(true);
    try {
      const res = await exportAllDataToJson();
      setBackupMsg(`备份成功！已导出 ${res.collectionsCount} 个收藏夹与 ${res.articlesCount} 篇内容。`);
    } catch (e: any) {
      setBackupMsg(`导出失败: ${e.message}`);
    } finally {
      setBackupLoading(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setBackupLoading(true);
    try {
      const res = await importDataFromJsonFile(file);
      setBackupMsg(`🎉 导入成功！已还原 ${res.collectionsCount} 个收藏夹与 ${res.articlesCount} 篇内容。`);
      onDataImported?.();
    } catch (err: any) {
      setBackupMsg(`导入失败: ${err.message}`);
    } finally {
      setBackupLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const setPreset = (preset: 'deepseek' | 'openai' | 'ollama' | 'kimi') => {
    if (preset === 'deepseek') {
      setSettings((prev) => ({
        ...prev,
        endpoint: 'https://api.deepseek.com/v1',
        model: 'deepseek-chat',
      }));
    } else if (preset === 'openai') {
      setSettings((prev) => ({
        ...prev,
        endpoint: 'https://api.openai.com/v1',
        model: 'gpt-4o-mini',
      }));
    } else if (preset === 'ollama') {
      setSettings((prev) => ({
        ...prev,
        endpoint: 'http://127.0.0.1:11434/v1',
        model: 'qwen2.5:7b',
      }));
    } else if (preset === 'kimi') {
      setSettings((prev) => ({
        ...prev,
        endpoint: 'https://api.moonshot.cn/v1',
        model: 'moonshot-v1-8k',
      }));
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-fade-in">
      <div className="glass-panel w-full max-w-lg rounded-3xl p-6 shadow-2xl space-y-5 border border-slate-200 dark:border-slate-800 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-3 border-b border-slate-200/60 dark:border-slate-800">
          <div className="flex items-center gap-2 text-slate-800 dark:text-slate-100 font-bold text-base">
            <Settings className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <span>设置与本地数据管理</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 快速预设药丸 */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">一键填入常用提供商：</label>
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => setPreset('deepseek')}
              className="px-2.5 py-1 text-xs rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/60 font-medium"
            >
              DeepSeek
            </button>
            <button
              onClick={() => setPreset('openai')}
              className="px-2.5 py-1 text-xs rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 font-medium"
            >
              OpenAI
            </button>
            <button
              onClick={() => setPreset('kimi')}
              className="px-2.5 py-1 text-xs rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 font-medium"
            >
              Kimi 月之暗面
            </button>
            <button
              onClick={() => setPreset('ollama')}
              className="px-2.5 py-1 text-xs rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 font-medium"
            >
              本地 Ollama
            </button>
          </div>
        </div>

        {/* AI 配置表单 */}
        <div className="space-y-3.5 text-xs">
          <div>
            <label className="flex items-center gap-1 font-medium text-slate-700 dark:text-slate-300 mb-1">
              <Globe className="w-3.5 h-3.5 text-slate-400" />
              API 地址 (Base URL / 本地 IP):
            </label>
            <input
              type="text"
              value={settings.endpoint}
              onChange={(e) => setSettings({ ...settings, endpoint: e.target.value })}
              placeholder="例如: https://api.deepseek.com/v1"
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-white dark:bg-slate-800 dark:text-slate-100"
            />
            <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
              标准 OpenAI 兼容格式，会自动补全 /chat/completions
            </p>
          </div>

          <div>
            <label className="flex items-center gap-1 font-medium text-slate-700 dark:text-slate-300 mb-1">
              <Cpu className="w-3.5 h-3.5 text-slate-400" />
              模型名称 (Model):
            </label>
            <input
              type="text"
              value={settings.model}
              onChange={(e) => setSettings({ ...settings, model: e.target.value })}
              placeholder="例如: deepseek-chat 或 gpt-4o-mini"
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-white dark:bg-slate-800 dark:text-slate-100"
            />
          </div>

          <div>
            <label className="flex items-center gap-1 font-medium text-slate-700 dark:text-slate-300 mb-1">
              <Key className="w-3.5 h-3.5 text-slate-400" />
              API Key (密钥):
            </label>
            <input
              type="password"
              value={settings.apiKey}
              onChange={(e) => setSettings({ ...settings, apiKey: e.target.value })}
              placeholder="sk-xxxxxxxx (本地无鉴权可留空)"
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-white dark:bg-slate-800 dark:text-slate-100"
            />
          </div>
        </div>

        {msg && <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium text-center">{msg}</p>}

        {/* 数据备份与恢复区域 (MoonDigest 风格) */}
        <div className="pt-3 border-t border-slate-200/60 dark:border-slate-800 space-y-3">
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 dark:text-slate-100">
            <Database className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <span>本地优先数据备份与恢复 (Local-First Backup)</span>
          </div>
          <p className="text-[11px] text-slate-400 dark:text-slate-500 leading-relaxed">
            所有收藏夹内容、AI去水摘要、要点、标签、分拣评级及回收站状态均存储在浏览器本地 IndexedDB 中。你可以随时将全量数据导出为 JSON 文件进行安全冷备份，或跨浏览器导入恢复。
          </p>

          <div className="flex items-center gap-2.5">
            <button
              onClick={handleExportBackup}
              disabled={backupLoading}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-medium transition"
            >
              <Download className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              <span>导出全量备份 (.json)</span>
            </button>

            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={backupLoading}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-medium transition"
            >
              <Upload className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>导入备份数据 (.json)</span>
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              onChange={handleFileChange}
              className="hidden"
            />
          </div>

          {backupMsg && (
            <p className="text-xs text-center font-medium text-blue-600 dark:text-blue-400 animate-fade-in">
              {backupMsg}
            </p>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-slate-200/60 dark:border-slate-800">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 font-medium"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs bg-blue-600 hover:bg-blue-700 text-white font-medium shadow-md shadow-blue-500/20 disabled:opacity-50"
          >
            <Save className="w-3.5 h-3.5" />
            {saving ? '保存中...' : '保存配置'}
          </button>
        </div>
      </div>
    </div>
  );
};
