import { beforeEach, describe, expect, it } from 'vitest';
import type { AISettings } from '../db';
import {
  DEFAULT_AI_SETTINGS,
  addProfile,
  deleteProfile,
  getActiveSettings,
  loadProfileStore,
  renameProfile,
  saveProfileStore,
  setActiveProfile,
  redactProfilesForBackup,
  restoreProfilesFromBackup,
  snapshotForTask,
  getPinnedSettings,
  pinSettings,
  type ProfileStorage,
} from './apiProfiles';

function memoryStorage(initial: Record<string, unknown> = {}): ProfileStorage & { data: Record<string, unknown> } {
  const data = { ...initial };
  return {
    data,
    async get(keys: string[]) {
      return Object.fromEntries(keys.filter((k) => k in data).map((k) => [k, data[k]]));
    },
    async set(values: Record<string, unknown>) {
      Object.assign(data, values);
    },
  };
}

const legacySettings: AISettings = {
  ...DEFAULT_AI_SETTINGS,
  endpoint: 'https://api.deepseek.com/v1',
  model: 'legacy-model',
  apiKey: 'sk-test-legacy',
  maxTagCount: 3,
};

describe('apiProfiles', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('migrates legacy flat settings into a default profile without losing fields', async () => {
    const storage = memoryStorage({ ai_settings: legacySettings });

    const store = await loadProfileStore(storage);

    expect(store.profiles).toHaveLength(1);
    expect(store.profiles[0]?.name).toBe('默认配置');
    expect(store.profiles[0]?.settings).toEqual(legacySettings);
    expect(store.activeProfileId).toBe(store.profiles[0]?.id);
  });

  it('adds, renames and switches profiles without mutating the others', async () => {
    const storage = memoryStorage();
    let store = await loadProfileStore(storage);

    store = addProfile(store, '本地 Ollama', {
      ...DEFAULT_AI_SETTINGS,
      endpoint: 'http://127.0.0.1:11434/v1',
      model: 'qwen2.5:7b',
      apiKey: 'sk-test-local',
    });
    const added = store.profiles.find((p) => p.name === '本地 Ollama');
    expect(added).toBeDefined();
    if (!added) return;

    store = setActiveProfile(store, added.id);
    const active = getActiveSettings(store);
    expect(active?.endpoint).toBe('http://127.0.0.1:11434/v1');
    expect(active?.apiKey).toBe('sk-test-local');

    store = renameProfile(store, added.id, '家中 Ollama');
    expect(store.profiles.find((p) => p.id === added.id)?.name).toBe('家中 Ollama');

    const before = store.profiles.length;
    store = deleteProfile(store, added.id);
    expect(store.profiles).toHaveLength(before - 1);
    expect(store.activeProfileId).toBe('default');
  });

  it('keeps the last profile when deletion is attempted', async () => {
    const storage = memoryStorage();
    const store = await loadProfileStore(storage);
    const id = store.profiles[0]?.id ?? '';

    expect(deleteProfile(store, id).profiles).toHaveLength(1);
  });

  it('persists the active profile across loads', async () => {
    const storage = memoryStorage();
    let store = await loadProfileStore(storage);
    store = addProfile(store, 'Kimi', { ...DEFAULT_AI_SETTINGS, model: 'moonshot-v1-8k' });
    const kimi = store.profiles.find((p) => p.name === 'Kimi');
    if (!kimi) throw new Error('missing profile');
    await saveProfileStore(setActiveProfile(store, kimi.id), storage);

    const reloaded = await loadProfileStore(storage);
    expect(reloaded.activeProfileId).toBe(kimi.id);
    expect(getActiveSettings(reloaded)?.model).toBe('moonshot-v1-8k');
  });

  it('redacts every profile key for backup export', async () => {
    const storage = memoryStorage();
    const store = await loadProfileStore(storage);
    const withKey = addProfile(store, '带 Key', {
      ...DEFAULT_AI_SETTINGS,
      apiKey: 'sk-test-should-be-removed',
    });

    const exported = redactProfilesForBackup(withKey);

    expect(exported).toHaveLength(2);
    expect(exported.every((p) => p.settings.apiKey === '')).toBe(true);
    expect(exported.some((p) => p.settings.apiKey === 'sk-test-should-be-removed')).toBe(false);
  });

  it('imports profiles from backup with keys blanked', async () => {
    const storage = memoryStorage();
    const imported = await restoreProfilesFromBackup(
      {
        profiles: [
          {
            id: 'old-1',
            name: '云端',
            settings: { ...DEFAULT_AI_SETTINGS, apiKey: 'sk-test-from-backup' },
          },
        ],
        activeProfileId: 'old-1',
      },
      storage
    );

    expect(imported.profiles).toHaveLength(1);
    expect(imported.profiles[0]?.settings.apiKey).toBe('');
    expect(imported.activeProfileId).toBe('old-1');
  });

  it('imports legacy flat settings from old backups with keys blanked', async () => {
    const storage = memoryStorage();
    const imported = await restoreProfilesFromBackup(
      { settings: { ...DEFAULT_AI_SETTINGS, apiKey: 'sk-test-legacy-backup' } },
      storage
    );

    expect(imported.profiles).toHaveLength(1);
    expect(imported.profiles[0]?.settings.apiKey).toBe('');
  });

  it('keeps a task settings snapshot unchanged after switching profiles', async () => {
    const storage = memoryStorage();
    const store = await loadProfileStore(storage);
    const snapshot = snapshotForTask(store);
    const next = addProfile(store, '另一个平台', {
      ...DEFAULT_AI_SETTINGS,
      model: 'other-model',
      apiKey: 'sk-test-other',
    });
    const switched = setActiveProfile(next, next.activeProfileId);

    expect(snapshot.model).toBe('deepseek-chat');
    expect(switched.activeProfileId).not.toBe(store.activeProfileId);
    expect(getActiveSettings(switched)?.model).toBe('other-model');
  });

  it('pinned settings stop AI calls from reading a switched profile', () => {
    const original = { ...DEFAULT_AI_SETTINGS, model: 'pinned-model' };
    const release = pinSettings(original);

    expect(getPinnedSettings()?.model).toBe('pinned-model');

    release();
    expect(getPinnedSettings()).toBeUndefined();
  });
});
