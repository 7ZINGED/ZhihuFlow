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
  DEFAULT_TRIAGE_PROMPT,
  DEFAULT_CATEGORIZE_PROMPT,
  testApiConnection,
  type ConnectionTestResult,
} from '../services/ai';
import {
  DEFAULT_AI_SETTINGS,
  addProfile,
  deleteProfile,
  getActiveSettings,
  loadProfileStore,
  renameProfile,
  saveProfileStore,
  setActiveProfile,
  type ApiProfileStore,
} from '../services/apiProfiles';
import { exportAllDataToJson, importDataFromJsonFile } from '../services/backup';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDataImported?: () => void;
}

/** 老备份可能缺字段，编辑前统一补齐，避免档案之间字段漂移。 */
function normalizeSettings(settings: AISettings): AISettings {
  return {
    ...DEFAULT_AI_SETTINGS,
    ...settings,
    customTriagePrompt: settings.customTriagePrompt || DEFAULT_TRIAGE_PROMPT,
    customCategorizePrompt: settings.customCategorizePrompt || DEFAULT_CATEGORIZE_PROMPT,
    maxTagCount: settings.maxTagCount || 2,
    allowModifyTags: settings.allowModifyTags ?? true,
    allowModifyDescription: settings.allowModifyDescription ?? true,
    batchLimitQuick: settings.batchLimitQuick ?? 30,
    batchLimitCategorize: settings.batchLimitCategorize ?? 20,
    batchLimitDeep: settings.batchLimitDeep ?? 10,
    maxGlobalTags: settings.maxGlobalTags ?? 8,
    adaptiveGlobalTags: settings.adaptiveGlobalTags ?? true,
  };
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, onDataImported }) => {
  const [activeTab, setActiveTab] = useState<'api' | 'prompts' | 'backup'>('api');
  const [settings, setSettings] = useState<AISettings>(DEFAULT_AI_SETTINGS);
  const [profileStore, setProfileStore] = useState<ApiProfileStore>({
    profiles: [],
    activeProfileId: '',
  });
  const [profileName, setProfileName] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [backupMsg, setBackupMsg] = useState('');
  const [backupLoading, setBackupLoading] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [testResult, setTestResult] = useState<ConnectionTestResult | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      void (async () => {
        const store = await loadProfileStore();
        const active = store.profiles.find((p) => p.id === store.activeProfileId);
        setProfileStore(store);
        setProfileName(active?.name ?? '默认配置');
        setSettings(normalizeSettings(getActiveSettings(store) ?? DEFAULT_AI_SETTINGS));
      })();
      setMsg('');
      setBackupMsg('');
      setTestResult(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  /** 先把当前编辑内容写回激活档案，避免切换/新增/删除时丢失未保存编辑。 */
  const persistDraftToActive = async (): Promise<ApiProfileStore> => {
    const next = renameProfile(profileStore, profileStore.activeProfileId, profileName.trim() || '未命名配置');
    const active = next.profiles.find((p) => p.id === next.activeProfileId);
    if (!active) return profileStore;
    active.settings = normalizeSettings(settings);
    await saveProfileStore(next);
    setProfileStore(next);
    return next;
  };

  const loadActiveIntoEditor = (store: ApiProfileStore) => {
    const active = store.profiles.find((p) => p.id === store.activeProfileId);
    setProfileName(active?.name ?? '默认配置');
    setSettings(normalizeSettings(getActiveSettings(store) ?? DEFAULT_AI_SETTINGS));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await persistDraftToActive();
      setMsg('设置已成功保存！');
      setTimeout(() => {
        setMsg('');
        onClose();
      }, 700);
    } finally {
      setSaving(false);
    }
  };

  const handleSwitchProfile = async (id: string) => {
    if (id === profileStore.activeProfileId) return;
    try {
      const saved = await persistDraftToActive();
      const next = setActiveProfile(saved, id);
      await saveProfileStore(next);
      setProfileStore(next);
      loadActiveIntoEditor(next);
      setMsg(`已切换到档案「${next.profiles.find((p) => p.id === id)?.name ?? ''}」`);
      setTimeout(() => setMsg(''), 2200);
    } catch (e: any) {
      setMsg(`切换失败: ${e.message}`);
    }
  };

  const handleAddProfile = async () => {
    const name = window.prompt('新 API 配置档案名称', '新配置');
    if (!name?.trim()) return;
    try {
      const saved = await persistDraftToActive();
      const next = addProfile(saved, name.trim(), normalizeSettings(settings));
      await saveProfileStore(next);
      setProfileStore(next);
      loadActiveIntoEditor(next);
      setMsg(`已新增并切换到档案「${name.trim()}」`);
      setTimeout(() => setMsg(''), 2200);
    } catch (e: any) {
      setMsg(`新增失败: ${e.message}`);
    }
  };

  const handleRenameProfile = async () => {
    if (!profileName.trim()) {
      setMsg('档案名称不能为空');
      return;
    }
    try {
      await persistDraftToActive();
      setMsg('档案名称已更新');
      setTimeout(() => setMsg(''), 2200);
    } catch (e: any) {
      setMsg(`重命名失败: ${e.message}`);
    }
  };

  const handleDeleteProfile = async () => {
    if (profileStore.profiles.length <= 1) {
      setMsg('至少需要保留一份 API 配置档案');
      setTimeout(() => setMsg(''), 2202);
      return;
    }
    if (!window.confirm(`确定删除当前档案「${profileName}」吗？此操作不可撤销。`)) return;
    try {
      const saved = await persistDraftToActive();
      const next = deleteProfile(saved, saved.activeProfileId);
      if (next.profiles.length === saved.profiles.length) {
        setMsg('无法删除最后一份档案');
        return;
      }
      await saveProfileStore(next);
      setProfileStore(next);
      loadActiveIntoEditor(next);
      setMsg('档案已删除，已切换到剩余档案');
      setTimeout(() => setMsg(''), 2202);
    } catch (e: any) {
      setMsg(`删除失败: ${e.message}`);
    }
  };

  const handleTestConnection = async () => {
    if (testingConnection) return;
    setTestingConnection(true);
    setTestResult(null);
    try {
      // 用正在编辑的档案值（含未保存的 Key），不读已保存的旧值
      const result = await testApiConnection(settings);
      setTestResult(result);
    } catch (e: any) {
      setTestResult({
        ok: false,
        latencyMs: 0,
        category: 'response',
        message: `测试失败: ${e.message}`,
      });
    } finally {
      setTestingConnection(false);
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
      setBackupMsg(`备份成功！已导出 ${res.collectionsCount} 个收藏夹与 ${res.articlesCount} 篇内容；API Key 未写入备份。`);
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
      const keyHint = res.keyRequiresRefill ? ' API Key 已按安全策略置空，请重新填写后再测试连通性。' : '';
      setBackupMsg(`🎉 导入成功！已还原 ${res.collectionsCount} 个收藏夹与 ${res.articlesCount} 篇内容。${keyHint}`);
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
              {/* API 配置档案：档案是完整设置集合，预设只改接口与模型 */}
              <div className="p-3 rounded-2xl border border-blue-200/80 dark:border-blue-900/60 bg-blue-50/40 dark:bg-blue-950/20 space-y-2.5">
                <div className="flex items-center gap-1.5 font-bold text-slate-800 dark:text-slate-100 text-xs">
                  <Database className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  <span>API 配置档案</span>
                  <span className="ml-auto text-[10px] font-medium text-blue-600 dark:text-blue-400">
                    正在编辑：{profileName || '默认配置'}
                  </span>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  <select
                    value={profileStore.activeProfileId}
                    onChange={(e) => void handleSwitchProfile(e.target.value)}
                    className="flex-1 min-w-[140px] px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  >
                    {profileStore.profiles.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => void handleAddProfile()}
                    className="px-2.5 py-1.5 rounded-xl bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 transition"
                  >
                    新增档案
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleRenameProfile()}
                    className="px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 text-xs hover:bg-white dark:hover:bg-slate-800 transition"
                  >
                    重命名
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDeleteProfile()}
                    disabled={profileStore.profiles.length <= 1}
                    className="px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-rose-600 dark:text-rose-400 text-xs hover:bg-rose-50 dark:hover:bg-rose-950/30 disabled:opacity-40 transition"
                  >
                    删除
                  </button>
                </div>

                <input
                  type="text"
                  value={profileName}
                  onChange={(e) => setProfileName(e.target.value)}
                  placeholder="档案名称，例如：工作 DeepSeek"
                  className="w-full px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
                <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed">
                  档案包含接口、模型、Key、提示词与批次上限。切换只影响新入队任务，运行中的队列仍用入队时快照。
                </p>
              </div>

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

                {/* 连通性测试：使用正在编辑的档案值，含未保存的 Key */}
                <div className="p-3 rounded-2xl border border-emerald-200/80 dark:border-emerald-900/60 bg-emerald-50/40 dark:bg-emerald-950/20 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 font-semibold text-slate-700 dark:text-slate-200">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                      <span>连通性测试</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleTestConnection()}
                      disabled={testingConnection}
                      className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold disabled:opacity-50 transition"
                    >
                      {testingConnection ? '测试中...' : '测试当前档案'}
                    </button>
                  </div>

                  {testResult && (
                    <div
                      className={`flex items-start gap-1.5 text-[11px] leading-relaxed ${
                        testResult.ok
                          ? 'text-emerald-700 dark:text-emerald-300'
                          : 'text-rose-600 dark:text-rose-400'
                      }`}
                    >
                      {testResult.ok ? (
                        <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                      ) : (
                        <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                      )}
                      <span>
                        {testResult.ok
                          ? `连接成功：模型 ${testResult.model ?? settings.model}，耗时 ${testResult.latencyMs}ms`
                          : `${testResult.message}（耗时 ${testResult.latencyMs}ms）`}
                      </span>
                    </div>
                  )}
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

              {/* 3. AI 词条打标与描述控制选项 (Tag数目与描述开关) */}
              <div className="p-3.5 rounded-2xl border border-indigo-200/80 dark:border-indigo-900/60 bg-indigo-50/40 dark:bg-indigo-950/20 space-y-3">
                <div className="flex items-center gap-1.5 font-bold text-slate-800 dark:text-slate-100 text-xs">
                  <Sliders className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  <span>AI 打标数量与描述开关选项</span>
                </div>

                {/* 标签数目限制 */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      AI 生成 Tag 数量限制 (每篇文章最大标签数)：
                    </label>
                    <span className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400">
                      最多 {settings.maxTagCount || 2} 个
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {[1, 2, 3, 4].map((num) => (
                      <button
                        key={num}
                        type="button"
                        onClick={() => setSettings({ ...settings, maxTagCount: num })}
                        className={`flex-1 py-1.5 rounded-xl text-xs font-medium transition ${
                          (settings.maxTagCount || 2) === num
                            ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/30'
                            : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-indigo-300'
                        }`}
                      >
                        {num} 个标签 {num === 2 ? '(推荐)' : ''}
                      </button>
                    ))}
                  </div>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500">
                    严格限定 AI 提炼的标签上限，数值越低标签收敛度越高，彻底杜绝标签泛滥膨胀。
                  </p>
                </div>

                {/* 开关选项 1：是否允许 AI 修改/覆盖已有标签 */}
                <label className="flex items-start gap-2.5 p-2 rounded-xl bg-white/70 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={settings.allowModifyTags ?? true}
                    onChange={(e) => setSettings({ ...settings, allowModifyTags: e.target.checked })}
                    className="mt-0.5 rounded text-indigo-600 focus:ring-0"
                  />
                  <div className="space-y-0.5">
                    <span className="font-semibold text-xs text-slate-800 dark:text-slate-200 block">
                      重新分类时允许 AI 调整并覆盖已有 Tag
                    </span>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-normal">
                      开启后，点击重新分类将直接根据最新 Prompt 提示词与数量限制更新替换旧标签；关闭则保留已有标签，仅对未打标内容处理。
                    </p>
                  </div>
                </label>

                {/* 开关选项 2：是否允许 AI 生成/修改描述 */}
                <label className="flex items-start gap-2.5 p-2 rounded-xl bg-white/70 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={settings.allowModifyDescription ?? true}
                    onChange={(e) => setSettings({ ...settings, allowModifyDescription: e.target.checked })}
                    className="mt-0.5 rounded text-indigo-600 focus:ring-0"
                  />
                  <div className="space-y-0.5">
                    <span className="font-semibold text-xs text-slate-800 dark:text-slate-200 block">
                      AI 词条分类时允许提炼并更新文章描述 (Summary)
                    </span>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-normal">
                      开启后，AI 在分类打标时会根据正文提炼 80 字以内的精简摘要描述；关闭则分类仅处理标签和归档收藏夹，不修改正文摘要描述。
                    </p>
                  </div>
                </label>
              </div>

              {/* 4. 单批次处理上限与批次全局聚类设置 (可调无上限/下限自由设定) */}
              <div className="p-3.5 rounded-2xl border border-blue-200/80 dark:border-blue-900/60 bg-blue-50/30 dark:bg-blue-950/20 space-y-3">
                <div className="flex items-center gap-1.5 font-bold text-slate-800 dark:text-slate-100 text-xs">
                  <Sliders className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  <span>单批次处理上限与全局标签聚类 (无上限/下限自由设定)</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  {/* 粗读上限 */}
                  <div className="p-2.5 rounded-xl bg-white/80 dark:bg-slate-800/80 border border-slate-200/70 dark:border-slate-700/70 space-y-1">
                    <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 block">
                      ⚡ 快速粗读单批上限：
                    </label>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        min="1"
                        value={settings.batchLimitQuick ?? 30}
                        onChange={(e) => {
                          const v = parseInt(e.target.value, 10);
                          setSettings({ ...settings, batchLimitQuick: isNaN(v) ? 1 : Math.max(1, v) });
                        }}
                        className="w-full px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                      <span className="text-[11px] text-slate-400 shrink-0">篇</span>
                    </div>
                    <span className="text-[10px] text-slate-400 block">默认 30 篇，任意设定</span>
                  </div>

                  {/* 分类上限 */}
                  <div className="p-2.5 rounded-xl bg-white/80 dark:bg-slate-800/80 border border-slate-200/70 dark:border-slate-700/70 space-y-1">
                    <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 block">
                      🏷️ 分类单次打包篇数 (1次请求)：
                    </label>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        min="1"
                        value={settings.batchLimitCategorize ?? 20}
                        onChange={(e) => {
                          const v = parseInt(e.target.value, 10);
                          setSettings({ ...settings, batchLimitCategorize: isNaN(v) ? 1 : Math.max(1, v) });
                        }}
                        className="w-full px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                      <span className="text-[11px] text-slate-400 shrink-0">篇</span>
                    </div>
                    <span className="text-[10px] text-slate-400 block">默认 20 篇，不设上下限</span>
                  </div>

                  {/* 精读上限 */}
                  <div className="p-2.5 rounded-xl bg-white/80 dark:bg-slate-800/80 border border-slate-200/70 dark:border-slate-700/70 space-y-1">
                    <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 block">
                      📖 全文精读单批上限：
                    </label>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        min="1"
                        value={settings.batchLimitDeep ?? 10}
                        onChange={(e) => {
                          const v = parseInt(e.target.value, 10);
                          setSettings({ ...settings, batchLimitDeep: isNaN(v) ? 1 : Math.max(1, v) });
                        }}
                        className="w-full px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                      <span className="text-[11px] text-slate-400 shrink-0">篇</span>
                    </div>
                    <span className="text-[10px] text-slate-400 block">默认 10 篇，任意设定</span>
                  </div>
                </div>

                {/* 批次全局总标签数上限 */}
                <div className="p-2.5 rounded-xl bg-white/80 dark:bg-slate-800/80 border border-slate-200/70 dark:border-slate-700/70 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 block">
                        🌐 批次全局总标签数上限 (Two-pass 聚类词典总容量)：
                      </span>
                      <span className="text-[10px] text-slate-400 block">
                        大模型在 Pass 1 全局提炼时，整批文章最多归纳出的核心全局标签总数
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <input
                        type="number"
                        min="1"
                        value={settings.maxGlobalTags ?? 8}
                        onChange={(e) => {
                          const v = parseInt(e.target.value, 10);
                          setSettings({ ...settings, maxGlobalTags: isNaN(v) ? 1 : Math.max(1, v) });
                        }}
                        className="w-16 px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 text-xs font-semibold text-center focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                      <span className="text-[11px] text-slate-400">个</span>
                    </div>
                  </div>

                  <label className="flex items-center gap-2 pt-1 border-t border-slate-100 dark:border-slate-700/50 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={settings.adaptiveGlobalTags ?? true}
                      onChange={(e) => setSettings({ ...settings, adaptiveGlobalTags: e.target.checked })}
                      className="rounded text-blue-600 focus:ring-0"
                    />
                    <div className="text-[11px] text-slate-600 dark:text-slate-300">
                      <span className="font-semibold">允许 AI 根据提示词与正文丰度在上限内自适应调整</span>
                      <span className="text-[10px] text-slate-400 block">
                        开启后，若这批文章内容较集中，AI 会自适应生成更少（如 3~5 个）的高纯度标签，避免无意义凑数。
                      </span>
                    </div>
                  </label>
                </div>
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
