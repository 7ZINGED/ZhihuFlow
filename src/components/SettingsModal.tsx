import React, { useState, useEffect, useRef } from 'react';
import { 
  Settings, 
  X, 
  Save, 
  Key, 
  Globe, 
  Cpu, 
  Download, 
  Upload, 
  Database, 
  RotateCcw,
  Sparkles,
  Sliders,
  Tag,
  CheckCircle2, 
  AlertCircle 
} from 'lucide-react';
import { type AISettings } from '../db';
import { 
  getAISettings, 
  saveAISettings, 
  DEFAULT_TRIAGE_PROMPT, 
  DEFAULT_CATEGORIZE_PROMPT 
} from '../services/ai';
import { exportAllDataToJson, importDataFromJsonFile } from '../services/backup';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDataImported?: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, onDataImported }) => {
  const [activeTab, setActiveTab] = useState<'api' | 'prompts' | 'backup'>('api');
  const [settings, setSettings] = useState<AISettings>({
    endpoint: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
    apiKey: '',
    customTriagePrompt: DEFAULT_TRIAGE_PROMPT,
    customCategorizePrompt: DEFAULT_CATEGORIZE_PROMPT,
  });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [backupMsg, setBackupMsg] = useState('');
  const [backupLoading, setBackupLoading] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      getAISettings().then((s) => {
        setSettings({
          ...s,
          customTriagePrompt: s.customTriagePrompt || DEFAULT_TRIAGE_PROMPT,
          customCategorizePrompt: s.customCategorizePrompt || DEFAULT_CATEGORIZE_PROMPT,
        });
      });
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
      }, 700);
    } finally {
      setSaving(false);
    }
  };

  const handleResetTriage = () => {
    setSettings((prev) => ({
      ...prev,
      customTriagePrompt: DEFAULT_TRIAGE_PROMPT,
    }));
    setMsg('已将【分拣筛选】提示词重置为系统默认');
    setTimeout(() => setMsg(''), 2500);
  };

  const handleResetCategorize = () => {
    setSettings((prev) => ({
      ...prev,
      customCategorizePrompt: DEFAULT_CATEGORIZE_PROMPT,
    }));
    setMsg('已将【词条分类】提示词重置为系统默认');
    setTimeout(() => setMsg(''), 2500);
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
      <div className="glass-panel w-full max-w-xl rounded-3xl p-6 shadow-2xl space-y-4 border border-slate-200 dark:border-slate-800 max-h-[92vh] flex flex-col">
        {/* 顶部标题栏 */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-200/60 dark:border-slate-800 shrink-0">
          <div className="flex items-center gap-2 text-slate-800 dark:text-slate-100 font-bold text-base">
            <Settings className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <span>设置与自定义提示词 (MoonDigest 风格)</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab 导航切换 */}
        <div className="flex items-center gap-1.5 p-1 rounded-2xl bg-slate-100 dark:bg-slate-800/80 shrink-0 text-xs font-semibold">
          <button
            onClick={() => setActiveTab('api')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl transition ${
              activeTab === 'api'
                ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-sm'
                : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Globe className="w-3.5 h-3.5" />
            <span>模型与接口配置</span>
          </button>

          <button
            onClick={() => setActiveTab('prompts')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl transition ${
              activeTab === 'prompts'
                ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-sm'
                : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>分拣与词条提示词</span>
          </button>

          <button
            onClick={() => setActiveTab('backup')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl transition ${
              activeTab === 'backup'
                ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-sm'
                : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Database className="w-3.5 h-3.5" />
            <span>本地数据备份</span>
          </button>
        </div>

        {/* 主视窗内容滚动区 */}
        <div className="flex-1 overflow-y-auto space-y-4 pr-1 text-xs">
          {/* TAB 1: 接口配置 */}
          {activeTab === 'api' && (
            <div className="space-y-4 animate-fade-in">
              {/* 快速预设药丸 */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">一键填入常用提供商：</label>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    onClick={() => setPreset('deepseek')}
                    className="px-2.5 py-1 text-xs rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/60 font-medium transition"
                  >
                    DeepSeek
                  </button>
                  <button
                    onClick={() => setPreset('openai')}
                    className="px-2.5 py-1 text-xs rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 font-medium transition"
                  >
                    OpenAI
                  </button>
                  <button
                    onClick={() => setPreset('kimi')}
                    className="px-2.5 py-1 text-xs rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 font-medium transition"
                  >
                    Kimi 月之暗面
                  </button>
                  <button
                    onClick={() => setPreset('ollama')}
                    className="px-2.5 py-1 text-xs rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 font-medium transition"
                  >
                    本地 Ollama
                  </button>
                </div>
              </div>

              {/* AI 配置表单 */}
              <div className="space-y-3.5">
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
            </div>
          )}

          {/* TAB 2: 自定义提示词 (分拣筛选 + 词条分类) */}
          {activeTab === 'prompts' && (
            <div className="space-y-4 animate-fade-in">
              {/* 1. 分拣筛选提示词 */}
              <div className="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/40 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 font-bold text-slate-800 dark:text-slate-100 text-xs">
                    <Sparkles className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    <span>分拣筛选提示词 (控制“值得留/可清理/不确定”评估准则)</span>
                  </div>
                  <button
                    onClick={handleResetTriage}
                    className="flex items-center gap-1 text-[11px] text-blue-600 dark:text-blue-400 hover:underline font-medium"
                    title="重置为系统默认提示词"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>重置为默认</span>
                  </button>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                  定义 AI 对文章质量、干货密度、长期价值的评估规则，直接决定卡片评级是【值得留】、【可清理】还是【不确定】。
                </p>
                <textarea
                  rows={6}
                  value={settings.customTriagePrompt || ''}
                  onChange={(e) => setSettings({ ...settings, customTriagePrompt: e.target.value })}
                  placeholder="输入你的自定义分拣筛选评估提示词..."
                  className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 text-xs font-mono leading-relaxed focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>

              {/* 2. 词条分类与标签提示词 */}
              <div className="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/40 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 font-bold text-slate-800 dark:text-slate-100 text-xs">
                    <Tag className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                    <span>词条分类提示词 (控制主题标签与目标收藏夹归类规则)</span>
                  </div>
                  <button
                    onClick={handleResetCategorize}
                    className="flex items-center gap-1 text-[11px] text-indigo-600 dark:text-indigo-400 hover:underline font-medium"
                    title="重置为系统默认提示词"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>重置为默认</span>
                  </button>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                  定义 AI 如何提炼专业规范的主题词条/标签，以及如何为文章推荐最贴切的目标收藏夹归宿。
                </p>
                <textarea
                  rows={6}
                  value={settings.customCategorizePrompt || ''}
                  onChange={(e) => setSettings({ ...settings, customCategorizePrompt: e.target.value })}
                  placeholder="输入你的自定义词条分类与打标签提示词..."
                  className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 text-xs font-mono leading-relaxed focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>

              <div className="p-2.5 rounded-xl bg-blue-50/50 dark:bg-blue-950/20 text-slate-500 dark:text-slate-400 text-[11px] leading-relaxed">
                💡 <b>小提示</b>：系统在分析时会自动将上述准则注入上下文，并严格约束以 JSON 规范返回字段，您可以放心地根据个人知识管理习惯调整评估倾向或打标签偏好。
              </div>
            </div>
          )}

          {/* TAB 3: 数据备份与恢复 */}
          {activeTab === 'backup' && (
            <div className="space-y-4 animate-fade-in">
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 dark:text-slate-100">
                <Database className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <span>本地优先数据备份与冷迁移 (Local-First Backup)</span>
              </div>
              <p className="text-[11px] text-slate-400 dark:text-slate-500 leading-relaxed">
                所有知乎收藏夹内容、AI摘读要点、主题标签、分拣评级及回收站状态均存储在浏览器本地 IndexedDB 中。你可以随时将全量数据导出为 JSON 文件进行安全冷备份，或跨浏览器导入恢复。
              </p>

              <div className="flex items-center gap-2.5 pt-1">
                <button
                  onClick={handleExportBackup}
                  disabled={backupLoading}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold transition"
                >
                  <Download className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                  <span>导出全量备份 (.json)</span>
                </button>

                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={backupLoading}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold transition"
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
          )}
        </div>

        {/* 底部反馈消息与保存按钮 */}
        {msg && (
          <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium text-center shrink-0 animate-fade-in">
            {msg}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-3 border-t border-slate-200/60 dark:border-slate-800 shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 font-medium transition"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs bg-blue-600 hover:bg-blue-700 text-white font-medium shadow-md shadow-blue-500/20 disabled:opacity-50 transition"
          >
            <Save className="w-3.5 h-3.5" />
            {saving ? '保存中...' : '保存全部配置'}
          </button>
        </div>
      </div>
    </div>
  );
};
