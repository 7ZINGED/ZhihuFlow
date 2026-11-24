import React from 'react';
import { db } from '../db';
import type { ZhihuArticleItem, ZhihuCollection } from '../db';
import { moveArticleBetweenCollections, removeArticleFromCollection } from '../services/zhihuApi';

export interface HistoryRecord {
  article: ZhihuArticleItem;
  fromCollectionId: string;
  toCollectionId?: string;
  action: 'move' | 'delete' | 'trash';
  undone?: boolean;
}

interface UseArticleActionsArgs {
  collections: readonly ZhihuCollection[];
  filteredArticles: readonly ZhihuArticleItem[];
  selectedIds: Set<string>;
  historyList: HistoryRecord[];
  setHistoryList: React.Dispatch<React.SetStateAction<HistoryRecord[]>>;
  setSelectedIds: (ids: Set<string>) => void;
  setLoading: (v: boolean) => void;
  setSyncProgress: (v: string) => void;
  showToast: (text: string) => void;
}

export function useArticleActions(args: UseArticleActionsArgs) {
  const { collections, filteredArticles, selectedIds, historyList, setHistoryList, setSelectedIds, setLoading, setSyncProgress, showToast } = args;

// 批量移动 (记录历史用于撤销)
const handleBatchMove = async (targetColId: string) => {
  const targetCol = collections.find((c) => c.id === targetColId);
  if (!targetCol) return;

  const targets = filteredArticles.filter((a) => selectedIds.has(a.id) && !a.isDeletedOrInvalid);
  if (targets.length === 0) return;

  if (!confirm(`确定将选中的 ${targets.length} 篇内容移动到「${targetCol.title}」吗？`)) return;

  setLoading(true);
  let count = 0;
  const newRecords: HistoryRecord[] = [];

  for (const item of targets) {
    setSyncProgress(`正在移动 (${++count}/${targets.length})...`);
    try {
      await moveArticleBetweenCollections(item.contentId, item.contentType, item.collectionId, targetColId);
      await db.articles.delete(item.id);
      newRecords.push({
        article: item,
        fromCollectionId: item.collectionId,
        toCollectionId: targetColId,
        action: 'move',
      });
    } catch (err) {
      console.error(err);
    }
  }
  setHistoryList((prev) => [...newRecords, ...prev].slice(0, 50));
  setSelectedIds(new Set());
  setLoading(false);
  setSyncProgress('');
};

// 单篇移出分拣范围 (放入回收站，不直接删除知乎线上)
const handleMoveToTrashSingle = async (article: ZhihuArticleItem) => {
  await db.articles.update(article.id, { inTrash: true, trashedAt: Date.now() });
  setHistoryList((prev) => [
    {
      article,
      fromCollectionId: article.collectionId,
      action: 'trash',
    },
    ...prev,
  ]);
  showToast(`已将「${article.title.slice(0, 14)}...」移出分拣范围 (已放入回收站)`);
};

// 批量移出分拣范围 (放入回收站)
const handleBatchMoveToTrash = async () => {
  const targets = filteredArticles.filter((a) => selectedIds.has(a.id));
  if (targets.length === 0) return;

  const newRecords: HistoryRecord[] = [];
  for (const item of targets) {
    await db.articles.update(item.id, { inTrash: true, trashedAt: Date.now() });
    newRecords.push({
      article: item,
      fromCollectionId: item.collectionId,
      action: 'trash',
    });
  }

  setHistoryList((prev) => [...newRecords, ...prev].slice(0, 50));
  setSelectedIds(new Set());
  showToast(`已将选中的 ${targets.length} 篇内容放入回收站（已移出分拣范围）`);
};

// 单篇从回收站恢复
const handleRestoreSingle = async (article: ZhihuArticleItem) => {
  await db.articles.update(article.id, { inTrash: false });
  showToast(`已将「${article.title.slice(0, 14)}...」恢复至分拣台`);
};

// 批量从回收站恢复
const handleBatchRestore = async () => {
  const targets = filteredArticles.filter((a) => selectedIds.has(a.id));
  if (targets.length === 0) return;

  for (const item of targets) {
    await db.articles.update(item.id, { inTrash: false });
  }
  setSelectedIds(new Set());
  showToast(`已将 ${targets.length} 篇内容恢复至分拣台`);
};

// 单篇彻底从知乎线上取消收藏
const handlePermanentDeleteSingle = async (article: ZhihuArticleItem) => {
  if (!confirm(`⚠️ 确定要彻底从知乎线上取消收藏「${article.title}」吗？此操作不可逆！`)) return;

  setLoading(true);
  try {
    if (!article.isDeletedOrInvalid) {
      await removeArticleFromCollection(article.contentId, article.contentType, article.collectionId);
    }
    await db.articles.delete(article.id);
    showToast(`已从知乎线上彻底取消收藏`);
  } catch (e: any) {
    alert(`彻底删除失败: ${e.message}`);
  } finally {
    setLoading(false);
  }
};

// 批量彻底从知乎线上删除 (清空选中回收站)
const handleBatchPermanentDelete = async () => {
  const targets = filteredArticles.filter((a) => selectedIds.has(a.id));
  if (targets.length === 0) return;

  if (!confirm(`⚠️ 危险警告：确定将选中的 ${targets.length} 条内容彻底从知乎线上取消收藏吗？此操作将在线上删除！`)) return;

  setLoading(true);
  let count = 0;
  for (const item of targets) {
    setSyncProgress(`正在从知乎线上彻底删除 (${++count}/${targets.length})...`);
    try {
      if (!item.isDeletedOrInvalid) {
        await removeArticleFromCollection(item.contentId, item.contentType, item.collectionId);
      }
      await db.articles.delete(item.id);
    } catch (err) {
      console.error(err);
    }
  }
  setSelectedIds(new Set());
  setLoading(false);
  setSyncProgress('');
  showToast(`已成功从知乎线上彻底删除 ${count} 条内容！`);
};

// 一键撤销最近的操作 (支持移动撤销与回收站撤销)
const handleUndoRecent = async () => {
  const lastActive = historyList.find((h) => !h.undone);
  if (!lastActive) return;

  setLoading(true);
  try {
    if (lastActive.action === 'trash') {
      await db.articles.update(lastActive.article.id, { inTrash: false });
      lastActive.undone = true;
      setHistoryList([...historyList]);
      showToast(`已撤销！「${lastActive.article.title.slice(0, 14)}...」已恢复至分拣台`);
    } else if (lastActive.action === 'move' && lastActive.toCollectionId) {
      setSyncProgress(`正在撤销移动:「${lastActive.article.title.slice(0, 15)}...」`);
      await moveArticleBetweenCollections(
        lastActive.article.contentId,
        lastActive.article.contentType,
        lastActive.toCollectionId,
        lastActive.fromCollectionId
      );
      await db.articles.put(lastActive.article);
      lastActive.undone = true;
      setHistoryList([...historyList]);
      showToast(`已撤销移动！「${lastActive.article.title.slice(0, 14)}...」已移回原收藏夹`);
    }
  } catch (e: any) {
    alert(`撤销失败: ${e.message}`);
  } finally {
    setLoading(false);
    setSyncProgress('');
  }
};

  return {
    handleBatchMove,
    handleMoveToTrashSingle,
    handleBatchMoveToTrash,
    handleRestoreSingle,
    handleBatchRestore,
    handlePermanentDeleteSingle,
    handleBatchPermanentDelete,
    handleUndoRecent,
  };
}
