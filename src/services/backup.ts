import { db, type ZhihuCollection, type ZhihuArticleItem } from '../db';
import {
  getActiveSettings,
  loadProfileStore,
  redactProfilesForBackup,
  restoreProfilesFromBackup,
  type ApiProfile,
} from './apiProfiles';

export interface ZhihuFlowBackupData {
  version: number;
  appName: string;
  exportedAt: string;
  collections: ZhihuCollection[];
  articles: ZhihuArticleItem[];
  /** 新格式：完整档案，但 Key 已置空。 */
  profiles?: ApiProfile[];
  activeProfileId?: string;
  /** 旧格式兼容字段；导出时 Key 同样置空。 */
  settings?: any;
}

export interface BackupImportResult {
  collectionsCount: number;
  articlesCount: number;
  /** 备份中的 Key 已按 ADR-0007 置空，用户需要重新填写。 */
  keyRequiresRefill: boolean;
}

/**
 * 导出全量本地数据（收藏夹、文章、AI提炼、标签、分拣评级、回收站状态）为 JSON 文件
 */
export async function exportAllDataToJson(): Promise<{ collectionsCount: number; articlesCount: number }> {
  const collections = await db.collections.toArray();
  const articles = await db.articles.toArray();
  const store = await loadProfileStore();
  const settings = getActiveSettings(store);

  const backupData: ZhihuFlowBackupData = {
    version: 1,
    appName: 'ZhihuFlow',
    exportedAt: new Date().toISOString(),
    collections,
    articles,
    profiles: redactProfilesForBackup(store),
    activeProfileId: store.activeProfileId,
    // 兼容旧版备份读取方；Key 一律置空（ADR-0007）
    settings: settings ? { ...settings, apiKey: '' } : undefined,
  };

  const jsonString = JSON.stringify(backupData, null, 2);
  const blob = new Blob([jsonString], { type: 'application/json;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const dateStr = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `ZhihuFlow_Backup_${dateStr}_(${articles.length}篇).json`;
  a.click();
  URL.revokeObjectURL(url);

  return { collectionsCount: collections.length, articlesCount: articles.length };
}

/**
 * 从 JSON 文件解析并导入数据到本地 IndexedDB
 */
export async function importDataFromJsonFile(file: File): Promise<BackupImportResult> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const text = e.target?.result as string;
        if (!text) throw new Error('文件内容为空！');
        const data = JSON.parse(text) as Partial<ZhihuFlowBackupData>;

        if (!Array.isArray(data.collections) || !Array.isArray(data.articles)) {
          throw new Error('无效的备份文件：未包含有效的收藏夹或文章数据');
        }

        if (data.collections.length > 0) {
          await db.collections.bulkPut(data.collections);
        }
        if (data.articles.length > 0) {
          await db.articles.bulkPut(data.articles);
        }
        const hasApiBackup = Array.isArray(data.profiles) || Boolean(data.settings?.endpoint);
        if (hasApiBackup) {
          // 无论新档案还是旧扁平设置，导入的 Key 都会被置空（ADR-0007）
          await restoreProfilesFromBackup({
            profiles: data.profiles,
            activeProfileId: data.activeProfileId,
            settings: data.settings,
          });
        }

        resolve({
          collectionsCount: data.collections.length,
          articlesCount: data.articles.length,
          keyRequiresRefill: hasApiBackup,
        });
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error('读取备份文件失败'));
    reader.readAsText(file);
  });
}
