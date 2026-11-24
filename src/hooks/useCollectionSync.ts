import React from 'react';
import { db, safeUpsertArticles } from '../db';
import type { ZhihuArticleItem, ZhihuCollection } from '../db';
import { findVanishedMemberIds } from '../services/membershipCleanup';
import {
  fetchUserCollectionsList,
  fetchCollectionContents,
  fetchCollectionContentsDetailed,
} from '../services/zhihuApi';
import { generateCollectionDescription } from '../services/ai';

interface SyncDeps {
  collections: ZhihuCollection[];
  selectedCollectionId: string;
  setSelectedCollectionId: (id: string) => void;
  setLoading: (v: boolean) => void;
  setSyncProgress: (v: string) => void;
  showToast: (text: string) => void;
  setDescModalData: React.Dispatch<React.SetStateAction<{ isOpen: boolean; colId: string; colTitle: string; desc: string }>>;
}

export function useCollectionSync(deps: SyncDeps) {
  const { collections, selectedCollectionId, setSelectedCollectionId, setLoading, setSyncProgress, showToast, setDescModalData } = deps;

const handleSyncCollections = async () => {
  setLoading(true);
  setSyncProgress('正在同步知乎收藏夹列表...');
  try {
    const list = await fetchUserCollectionsList();
    if (!list || list.length === 0) {
      showToast('⚠️ 未能从知乎获取到收藏夹列表，请确认是否已在浏览器中登录知乎');
      return;
    }
    
    // 1. 获取本地既有收藏夹列表，找出远端已被物理删除的失效收藏夹
    const localCols = await db.collections.toArray();
    const remoteIds = new Set(list.map((c) => c.id));
    const deletedCols = localCols.filter((c) => !remoteIds.has(c.id));

    if (deletedCols.length > 0) {
      const deletedIds = deletedCols.map((c) => c.id);
      // 从本地数据库清理已被删除的收藏夹元数据
      await db.collections.bulkDelete(deletedIds);

      // 如果当前高亮查看的收藏夹恰好被删除，安全回退到“全部”
      if (deletedIds.includes(selectedCollectionId)) {
        setSelectedCollectionId('all');
      }

      // 绝不物理删除文章！用户的阅读记录、标签、金句是宝贵资产，
      // 将原属于被删收藏夹的文章标记为移入回收站保护起来，避免悬空
      for (const delId of deletedIds) {
        const orphanArticles = await db.articles.where('collectionId').equals(delId).toArray();
        for (const art of orphanArticles) {
          await db.articles.update(art.id, {
            collectionTitle: '（已解散收藏夹）',
            inTrash: true,
            trashedAt: Date.now(),
          });
        }
      }
    }

    // 2. 将远端最新的有效收藏夹列表写入本地
    for (const col of list) {
      const localCount = await db.articles.where('collectionId').equals(col.id).count();
      if (localCount > 0 && (!col.itemCount || col.itemCount === 0)) {
        col.itemCount = localCount;
      }
    }
    await db.collections.bulkPut(list);

    if (deletedCols.length > 0) {
      showToast(`✅ 收藏夹目录已同步！已自动移除 ${deletedCols.length} 个知乎端已注销的收藏夹，其文章已移入回收站保护。`);
    } else {
      showToast(`✅ 收藏夹目录已与知乎最新状态同步！`);
    }
  } catch (err: any) {
    console.error(err);
    setSyncProgress(`同步失败: ${err.message}`);
  } finally {
    setLoading(false);
    setSyncProgress('');
  }
};

// 同步抓取选中收藏夹中的内容 (增量安全合并，完整保留本地AI分析与用户标记状态)
const handleFetchArticles = async (collectionId: string) => {
  const col = collections.find((c) => c.id === collectionId);
  if (!col) return;

  setLoading(true);
  setSyncProgress(`正在读取「${col.title}」内容...`);
  try {
    const { items, complete } = await fetchCollectionContentsDetailed(collectionId, col.title, (count) => {
      setSyncProgress(`已抓取 ${count} 条内容...`);
    });
    await safeUpsertArticles(items);

    // ticket 14：成员关系消失的行移入回收站（可恢复、不删 AI 产物）。
    // 只有抓取完整才敢做差集——备用接口 / 分页中断时不处理，避免误伤未抓到的正常成员。
    let trashed = 0;
    if (complete) {
      const localRows = await db.articles.where('collectionId').equals(collectionId).toArray();
      const remoteIds = new Set(items.map((a) => a.id));
      const vanishedIds = findVanishedMemberIds(localRows, remoteIds, collectionId);
      if (vanishedIds.length > 0) {
        const trashedAt = Date.now();
        await db.articles.bulkUpdate(
          vanishedIds.map((key) => ({ key, changes: { inTrash: true, trashedAt } }))
        );
        trashed = vanishedIds.length;
      }
    }

    const actualCount = await db.articles.where('collectionId').equals(collectionId).count();
    await db.collections.update(collectionId, { itemCount: actualCount });
    const tail = trashed > 0
      ? `，${trashed} 篇已不在知乎端，已移入回收站（可恢复）`
      : complete ? '' : '（抓取未完整，本次跳过成员失效检查）';
    showToast(`✅ 成功同步「${col.title}」最新内容，已完整保留已有粗读与标签数据${tail}！`);
  } catch (err: any) {
    alert(`读取收藏夹失败: ${err.message}`);
  } finally {
    setLoading(false);
    setSyncProgress('');
  }
};

// 一键为收藏夹生成 AI 简介
const handleGenerateDesc = async (col: ZhihuCollection) => {
  setLoading(true);
  setSyncProgress(`正在分析「${col.title}」并提炼宏观简介...`);
  try {
    let colArticles = await db.articles.where('collectionId').equals(col.id).toArray();
    if (colArticles.length === 0) {
      colArticles = await fetchCollectionContents(col.id, col.title);
      await safeUpsertArticles(colArticles);
    }

    if (colArticles.length === 0) {
      alert('当前收藏夹为空，无法生成简介');
      return;
    }

    const generated = await generateCollectionDescription(colArticles);
    setDescModalData({
      isOpen: true,
      colId: col.id,
      colTitle: col.title,
      desc: generated,
    });
  } catch (e: any) {
    alert(`生成简介失败: ${e.message}`);
  } finally {
    setLoading(false);
    setSyncProgress('');
  }
};

  return { handleSyncCollections, handleFetchArticles, handleGenerateDesc };
}
