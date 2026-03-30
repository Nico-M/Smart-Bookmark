import type { RollbackResult } from "@/shared/types";
import { ServiceError } from "../utils/service-error";

const SESSION_BACKUPS_KEY = "session:backups";
const SESSION_LAST_APPLIED_BACKUP_ID_KEY = "session:lastAppliedBackupId";
const MAX_BACKUP_COUNT = 5;

type BackupSnapshot = {
  backupId: string;
  createdAt: number;
  tree: chrome.bookmarks.BookmarkTreeNode[];
};

/**
 * 创建会话级书签备份并写入队列。
 */
export async function createBackupSnapshot(): Promise<string> {
  const tree = await chrome.bookmarks.getTree();
  const backupId = createBackupId();
  const current = await readBackupSnapshots();
  const next: BackupSnapshot[] = [
    {
      backupId,
      createdAt: Date.now(),
      tree
    },
    ...current
  ].slice(0, MAX_BACKUP_COUNT);

  await chrome.storage.session.set({ [SESSION_BACKUPS_KEY]: next });
  return backupId;
}

/**
 * 读取当前会话全部备份。
 */
export async function readBackupSnapshots(): Promise<BackupSnapshot[]> {
  const result = await chrome.storage.session.get(SESSION_BACKUPS_KEY);
  return (result[SESSION_BACKUPS_KEY] as BackupSnapshot[] | undefined) ?? [];
}

/**
 * 记录最近一次可回滚备份 ID。
 */
export async function markLastAppliedBackupId(backupId: string): Promise<void> {
  await chrome.storage.session.set({ [SESSION_LAST_APPLIED_BACKUP_ID_KEY]: backupId });
}

/**
 * 读取最近一次可回滚备份 ID。
 */
export async function getLastAppliedBackupId(): Promise<string | null> {
  const result = await chrome.storage.session.get(SESSION_LAST_APPLIED_BACKUP_ID_KEY);
  return (result[SESSION_LAST_APPLIED_BACKUP_ID_KEY] as string | undefined) ?? null;
}

/**
 * 回滚到最近一次备份并恢复书签树。
 */
export async function rollbackFromBackup(backupId?: string): Promise<RollbackResult> {
  const targetId = backupId ?? (await getLastAppliedBackupId());
  if (!targetId) {
    return {
      rolledBack: false,
      backupId: null,
      note: "未找到可回滚的备份。"
    };
  }

  const snapshots = await readBackupSnapshots();
  const snapshot = snapshots.find((item) => item.backupId === targetId);
  if (!snapshot) {
    return {
      rolledBack: false,
      backupId: targetId,
      note: "目标备份不存在，可能已失效或当前会话已结束。"
    };
  }

  await restoreFromSnapshot(snapshot.tree);

  const remaining = snapshots.filter((item) => item.backupId !== targetId);
  await chrome.storage.session.set({ [SESSION_BACKUPS_KEY]: remaining });
  if (remaining.length > 0) {
    await markLastAppliedBackupId(remaining[0].backupId);
  } else {
    await chrome.storage.session.remove(SESSION_LAST_APPLIED_BACKUP_ID_KEY);
  }

  return {
    rolledBack: true,
    backupId: targetId,
    note: "已恢复到本会话备份快照。"
  };
}

/**
 * 将当前书签树恢复为指定快照。
 */
async function restoreFromSnapshot(
  snapshotTree: chrome.bookmarks.BookmarkTreeNode[]
): Promise<void> {
  const snapshotRoot = snapshotTree[0];
  const currentRoot = (await chrome.bookmarks.getTree())[0];
  if (!snapshotRoot?.children?.length || !currentRoot?.children?.length) {
    throw new ServiceError("ROLLBACK_SNAPSHOT_INVALID", "备份快照无效，无法回滚。");
  }

  const currentRootsByTitle = new Map(
    currentRoot.children.map((node) => [node.title, node.id] as const)
  );

  for (const rootNode of currentRoot.children) {
    await clearFolderChildren(rootNode.id);
  }

  for (let index = 0; index < snapshotRoot.children.length; index += 1) {
    const snapshotRootNode = snapshotRoot.children[index];
    const targetRootId =
      currentRootsByTitle.get(snapshotRootNode.title) ?? currentRoot.children[index]?.id;
    if (!targetRootId) {
      continue;
    }
    await recreateChildren(targetRootId, snapshotRootNode.children ?? []);
  }
}

/**
 * 清空指定文件夹下的所有子节点。
 */
async function clearFolderChildren(folderId: string): Promise<void> {
  const subTree = await chrome.bookmarks.getSubTree(folderId);
  const node = subTree[0];
  const children = [...(node.children ?? [])].reverse();

  for (const child of children) {
    if (child.url) {
      await chrome.bookmarks.remove(child.id);
      continue;
    }
    await chrome.bookmarks.removeTree(child.id);
  }
}

/**
 * 按快照顺序重建指定文件夹下的子节点。
 */
async function recreateChildren(
  parentId: string,
  children: chrome.bookmarks.BookmarkTreeNode[]
): Promise<void> {
  for (let index = 0; index < children.length; index += 1) {
    const child = children[index];
    if (child.url) {
      await chrome.bookmarks.create({
        parentId,
        index,
        title: child.title,
        url: child.url
      });
      continue;
    }

    const createdFolder = await chrome.bookmarks.create({
      parentId,
      index,
      title: child.title
    });
    await recreateChildren(createdFolder.id, child.children ?? []);
  }
}

/**
 * 生成备份 ID。
 */
function createBackupId(): string {
  return `backup_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}
