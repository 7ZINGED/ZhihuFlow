import React, { useState, useEffect } from 'react';
import { Settings, X, Save, Key, Globe, Cpu } from 'lucide-react';
import { type AISettings } from '../db';
import { getAISettings, saveAISettings } from '../services/ai';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const [settings, setSettings] = useState<AISettings>({
    endpoint: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
    apiKey: '',
  });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    if (isOpen) {
      getAISettings().then(setSettings);
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
      <div className="glass-panel w-full max-w-md rounded-3xl p-6 shadow-2xl space-y-5 border border-slate-200 dark:border-slate-800">
        <div className="flex items-center justify-between pb-3 border-b border-slate-200/60 dark:border-slate-800">
          <div className="flex items-center gap-2 text-slate-800 dark:text-slate-100 font-bold text-base">
            <Settings className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <span>AI 大模型与接口配置</span>
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

        {/* 表单 */}
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

        <div className="flex justify-end gap-2 pt-2">
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
