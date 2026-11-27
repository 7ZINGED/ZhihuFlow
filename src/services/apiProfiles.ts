import type { AISettings } from '../db';
import { DEFAULT_CATEGORIZE_PROMPT, DEFAULT_TRIAGE_PROMPT } from './aiPrompts';

/** 所有 API 配置的默认值；Key 默认为空，只从用户设置读入。 */
export const DEFAULT_AI_SETTINGS: AISettings = {
  endpoint: 'https://api.deepseek.com/v1',
  model: 'deepseek-chat',
  apiKey: '',
  customTriagePrompt: DEFAULT_TRIAGE_PROMPT,
  customCategorizePrompt: DEFAULT_CATEGORIZE_PROMPT,
  maxTagCount: 2,
  allowModifyTags: true,
  allowModifyDescription: true,
  batchLimitQuick: 30,
  batchLimitCategorize: 20,
  batchLimitDeep: 10,
  maxGlobalTags: 8,
  adaptiveGlobalTags: true,
};

/** 老备份可能缺字段；统一补齐，避免迁移、导入与编辑三处规则漂移。 */
export function normalizeAISettings(settings?: Partial<AISettings>): AISettings {
  return {
    ...DEFAULT_AI_SETTINGS,
    ...(settings ?? {}),
    customTriagePrompt: settings?.customTriagePrompt || DEFAULT_TRIAGE_PROMPT,
    customCategorizePrompt: settings?.customCategorizePrompt || DEFAULT_CATEGORIZE_PROMPT,
    maxTagCount: settings?.maxTagCount || 2,
    allowModifyTags: settings?.allowModifyTags ?? true,
    allowModifyDescription: settings?.allowModifyDescription ?? true,
    batchLimitQuick: settings?.batchLimitQuick ?? 30,
    batchLimitCategorize: settings?.batchLimitCategorize ?? 20,
    batchLimitDeep: settings?.batchLimitDeep ?? 10,
    maxGlobalTags: settings?.maxGlobalTags ?? 8,
    adaptiveGlobalTags: settings?.adaptiveGlobalTags ?? true,
  };
}

export interface ApiProfile {
  id: string;
  name: string;
  settings: AISettings;
}

export interface ApiProfileStore {
  profiles: ApiProfile[];
  activeProfileId: string;
}

/** chrome.storage.local 的最小接口，便于测试注入内存实现。 */
export interface ProfileStorage {
  get(keys: string[]): Promise<Record<string, unknown>>;
  set(values: Record<string, unknown>): Promise<void>;
}

export const PROFILES_STORAGE_KEY = 'ai_profiles';
export const ACTIVE_PROFILE_STORAGE_KEY = 'active_profile_id';
export const LEGACY_SETTINGS_STORAGE_KEY = 'ai_settings';

export function createProfileStorage(): ProfileStorage {
  return {
    get: (keys) => chrome.storage.local.get(keys),
    set: (values) => chrome.storage.local.set(values),
  };
}

/**
 * 载入配置档案。若还没有档案，则把旧扁平 ai_settings 迁移为唯一默认档案并写回。
 */
export async function loadProfileStore(storage: ProfileStorage = createProfileStorage()): Promise<ApiProfileStore> {
  const raw = await storage.get([PROFILES_STORAGE_KEY, ACTIVE_PROFILE_STORAGE_KEY, LEGACY_SETTINGS_STORAGE_KEY]);
  const profiles = raw[PROFILES_STORAGE_KEY];

  if (Array.isArray(profiles) && profiles.length > 0) {
    const activeId = typeof raw[ACTIVE_PROFILE_STORAGE_KEY] === 'string'
      ? raw[ACTIVE_PROFILE_STORAGE_KEY] as string
      : profiles[0]?.id ?? '';
    return { profiles: profiles as ApiProfile[], activeProfileId: activeId };
  }

  const legacy = raw[LEGACY_SETTINGS_STORAGE_KEY];
  const settings = normalizeAISettings(
    legacy && typeof legacy === 'object' ? legacy as Partial<AISettings> : undefined
  );
  const store: ApiProfileStore = {
    profiles: [{ id: 'default', name: '默认配置', settings }],
    activeProfileId: 'default',
  };
  await saveProfileStore(store, storage);
  return store;
}

export async function saveProfileStore(store: ApiProfileStore, storage: ProfileStorage = createProfileStorage()): Promise<void> {
  await storage.set({
    [PROFILES_STORAGE_KEY]: store.profiles,
    [ACTIVE_PROFILE_STORAGE_KEY]: store.activeProfileId,
  });
}

export function getActiveSettings(store: ApiProfileStore): AISettings | undefined {
  const active = store.profiles.find((p) => p.id === store.activeProfileId) ?? store.profiles[0];
  return active?.settings;
}

/** 入队时复制激活档案；返回独立对象，后续切换或修改档案都不影响已快照内容。 */
export function snapshotForTask(store: ApiProfileStore): AISettings {
  const active = getActiveSettings(store) ?? DEFAULT_AI_SETTINGS;
  return { ...active };
}

let pinnedSettings: AISettings | undefined;

/** 在一次队列运行期间钉住配置快照；返回解除函数。已钉住时所有 AI 调用都读这份快照。 */
export function pinSettings(settings: AISettings): () => void {
  const pinned = { ...settings };
  pinnedSettings = pinned;
  return () => {
    if (pinnedSettings === pinned) pinnedSettings = undefined;
  };
}

/** 读取当前钉住的配置，未钉住时返回 undefined。 */
export function getPinnedSettings(): AISettings | undefined {
  return pinnedSettings;
}

export function addProfile(store: ApiProfileStore, name: string, settings: AISettings): ApiProfileStore {
  const id = `profile-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return {
    profiles: [...store.profiles, { id, name, settings: { ...settings } }],
    activeProfileId: id,
  };
}

export function renameProfile(store: ApiProfileStore, id: string, name: string): ApiProfileStore {
  return {
    ...store,
    profiles: store.profiles.map((p) => (p.id === id ? { ...p, name } : p)),
  };
}

export function setActiveProfile(store: ApiProfileStore, id: string): ApiProfileStore {
  return store.profiles.some((p) => p.id === id) ? { ...store, activeProfileId: id } : store;
}

export function deleteProfile(store: ApiProfileStore, id: string): ApiProfileStore {
  if (store.profiles.length <= 1) return store;
  const profiles = store.profiles.filter((p) => p.id !== id);
  if (profiles.length === store.profiles.length) return store;
  return {
    profiles,
    activeProfileId: store.activeProfileId === id ? (profiles[0]?.id ?? '') : store.activeProfileId,
  };
}

export interface ApiProfilesBackup {
  profiles?: ApiProfile[];
  activeProfileId?: string;
  settings?: Partial<AISettings>;
}

/** 生成用于导出的档案：Key 一律置空，备份文件永不携带密钥。 */
export function redactProfilesForBackup(store: ApiProfileStore): ApiProfile[] {
  return store.profiles.map((p) => ({
    ...p,
    settings: { ...p.settings, apiKey: '' },
  }));
}

/** 导入备份中的档案或旧扁平设置；无论来源，Key 都置空，要求用户重新填写。 */
export async function restoreProfilesFromBackup(
  backup: ApiProfilesBackup,
  storage: ProfileStorage = createProfileStorage()
): Promise<ApiProfileStore> {
  const source = Array.isArray(backup.profiles) && backup.profiles.length > 0
    ? backup.profiles
    : backup.settings
      ? [{ id: 'default', name: '默认配置', settings: backup.settings }]
      : [];

  const profiles: ApiProfile[] = source.map((p, index) => ({
    id: p.id || `profile-${index}`,
    name: p.name || '默认配置',
    settings: {
      ...normalizeAISettings(p.settings),
      apiKey: '',
    },
  }));

  const store: ApiProfileStore = profiles.length > 0
    ? {
        profiles,
        activeProfileId: profiles.some((p) => p.id === backup.activeProfileId)
          ? backup.activeProfileId as string
          : (profiles[0]?.id ?? ''),
      }
    : await loadProfileStore(storage);

  await saveProfileStore(store, storage);
  return store;
}
