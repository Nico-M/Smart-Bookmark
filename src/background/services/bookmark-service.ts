import type {
  BookmarkFolder,
  BookmarkItem,
  OrganizeApplyResult,
  OrganizePreview
} from "@/shared/types";
import {
  createBackupSnapshot,
  markLastAppliedBackupId,
  rollbackFromBackup
} from "./backup-service";
import { ServiceError } from "../utils/service-error";

const MAX_GROUP_DEPTH = 3;

/**
 * 读取原始书签树。
 */
export async function getBookmarkTree(): Promise<chrome.bookmarks.BookmarkTreeNode[]> {
  return chrome.bookmarks.getTree();
}

/**
 * 扁平化书签树，输出 URL 节点列表。
 */
export function flattenBookmarkTree(
  nodes: chrome.bookmarks.BookmarkTreeNode[],
  path: string[] = []
): BookmarkItem[] {
  const items: BookmarkItem[] = [];

  for (const node of nodes) {
    const nextPath = node.title ? [...path, node.title] : path;
    if (node.url) {
      items.push({
        id: node.id,
        title: node.title,
        url: node.url,
        parentId: node.parentId ?? "",
        path: path
      });
      continue;
    }
    if (node.children?.length) {
      items.push(...flattenBookmarkTree(node.children, nextPath));
    }
  }

  return items;
}

/**
 * 扁平化文件夹树，输出可筛选的目录列表。
 */
export function flattenFolderTree(
  nodes: chrome.bookmarks.BookmarkTreeNode[],
  path: string[] = []
): BookmarkFolder[] {
  const folders: BookmarkFolder[] = [];

  for (const node of nodes) {
    if (node.url) {
      continue;
    }
    const nextPath = node.title ? [...path, node.title] : path;
    if (node.id !== "0") {
      folders.push({
        id: node.id,
        title: node.title,
        path
      });
    }
    if (node.children?.length) {
      folders.push(...flattenFolderTree(node.children, nextPath));
    }
  }

  return folders;
}

/**
 * 查询书签列表，支持关键字和父文件夹过滤。
 */
export async function queryBookmarks(filters: {
  keyword?: string;
  folderId?: string;
}): Promise<BookmarkItem[]> {
  const tree = await getBookmarkTree();
  const all = flattenBookmarkTree(tree);

  const keyword = filters.keyword?.trim().toLowerCase();
  return all.filter((item) => {
    if (filters.folderId && item.parentId !== filters.folderId) {
      return false;
    }
    if (!keyword) {
      return true;
    }

    return (
      item.title.toLowerCase().includes(keyword) || item.url.toLowerCase().includes(keyword)
    );
  });
}

/**
 * 查询全部书签文件夹，供前端筛选使用。
 */
export async function queryBookmarkFolders(): Promise<BookmarkFolder[]> {
  const tree = await getBookmarkTree();
  return flattenFolderTree(tree).sort((a, b) => {
    const pathA = [...a.path, a.title].join(" / ");
    const pathB = [...b.path, b.title].join(" / ");
    return pathA.localeCompare(pathB, "zh-CN");
  });
}

/**
 * 更新单条书签。
 */
export async function updateBookmark(input: {
  id: string;
  title?: string;
  url?: string;
}): Promise<void> {
  await chrome.bookmarks.update(input.id, {
    title: input.title,
    url: input.url
  });
}

/**
 * 删除单条书签。
 */
export async function deleteBookmark(id: string): Promise<void> {
  await chrome.bookmarks.remove(id);
}

/**
 * 应用整理预览：创建分组目录（最多 3 级）、移动书签并删除重复项。
 */
export async function applyOrganizePreview(
  preview: OrganizePreview
): Promise<OrganizeApplyResult> {
  const previewSummary = validatePreviewConsistency(preview);
  const beforeTotalCount = await countAllBookmarkItems();
  const backupId = await createBackupSnapshot();
  const { targetRootId, targetRootTitle } = await resolveOrganizeTargetRoot();
  let movedCount = 0;
  let deletedDuplicateCount = 0;
  let cleanedEmptyFolderCount = 0;

  try {
    const movedBookmarkIds = new Set<string>();
    const sourceParentCandidates = new Set<string>();
    const folderCache = new Map<string, string>();

    for (let index = 0; index < preview.groups.length; index += 1) {
      const group = preview.groups[index];
      const groupPath = normalizePreviewGroupPath(group, index);
      const folderId = await ensureGroupFolders({
        rootId: targetRootId,
        groupPath,
        folderCache
      });

      for (const bookmarkId of group.bookmarkIds) {
        if (movedBookmarkIds.has(bookmarkId)) {
          throw new ServiceError(
            "PREVIEW_DUPLICATE_ASSIGNMENT",
            `书签 ${bookmarkId} 在预览中被重复分配，请重新生成预览。`
          );
        }
        const bookmarkNode = await getBookmarkNodeOrThrow(bookmarkId);
        if (bookmarkNode.parentId) {
          sourceParentCandidates.add(bookmarkNode.parentId);
        }
        await chrome.bookmarks.move(bookmarkId, { parentId: folderId });
        movedBookmarkIds.add(bookmarkId);
        movedCount += 1;
      }
    }

    for (const duplicateId of new Set(preview.duplicateIds)) {
      const duplicateNode = await getBookmarkNodeOrThrow(duplicateId);
      if (duplicateNode.parentId) {
        sourceParentCandidates.add(duplicateNode.parentId);
      }
      await chrome.bookmarks.remove(duplicateId);
      deletedDuplicateCount += 1;
    }

    cleanedEmptyFolderCount = await cleanupEmptyFolders(
      sourceParentCandidates,
      new Set([targetRootId])
    );
    cleanedEmptyFolderCount += await cleanupEmptyFoldersUnderRoot(targetRootId);

    if (movedCount !== previewSummary.uniqueCount) {
      throw new ServiceError(
        "APPLY_MOVED_COUNT_MISMATCH",
        `实际移动数量 ${movedCount} 与预览唯一数量 ${previewSummary.uniqueCount} 不一致，请重新生成预览。`
      );
    }
    if (deletedDuplicateCount !== previewSummary.duplicateCount) {
      throw new ServiceError(
        "APPLY_DUPLICATE_COUNT_MISMATCH",
        `实际删除重复数量 ${deletedDuplicateCount} 与预览重复数量 ${previewSummary.duplicateCount} 不一致，请重新生成预览。`
      );
    }

    const afterTotalCount = await countAllBookmarkItems();
    const expectedAfterCount = beforeTotalCount - deletedDuplicateCount;
    if (afterTotalCount !== expectedAfterCount) {
      throw new ServiceError(
        "APPLY_TOTAL_COUNT_MISMATCH",
        `整理后总数校验失败：整理前 ${beforeTotalCount}，删除重复 ${deletedDuplicateCount}，预期整理后 ${expectedAfterCount}，实际 ${afterTotalCount}。已自动回滚。`
      );
    }

    const note = [
      `目标根目录 ${targetRootTitle}`,
      `作用域总数 ${previewSummary.totalCount}`,
      `唯一保留 ${previewSummary.uniqueCount}`,
      `重复删除 ${deletedDuplicateCount}`,
      `清理空目录 ${cleanedEmptyFolderCount}`,
      `过滤/未分配 ${previewSummary.filteredCount}`,
      `整理前总数 ${beforeTotalCount}`,
      `整理后总数 ${afterTotalCount}`
    ].join("；");

    await markLastAppliedBackupId(backupId);
    return {
      backupId,
      movedCount,
      deletedDuplicateCount,
      applied: true,
      note
    };
  } catch (error) {
    const rollbackResult = await rollbackFromBackup(backupId);
    if (!rollbackResult.rolledBack) {
      throw new ServiceError(
        "APPLY_FAILED_ROLLBACK_FAILED",
        "写回失败且自动回滚失败，请检查日志后手动处理。"
      );
    }

    const reason = error instanceof Error ? error.message : "未知错误";
    throw new ServiceError("APPLY_FAILED", `写回失败，已自动回滚。原因：${reason}`);
  }
}

/**
 * 选择整理结果写回的目标根目录。
 * 优先 Bookmarks/Favorites bar，其次 Other bookmarks，再次任意可写根。
 */
async function resolveOrganizeTargetRoot(): Promise<{ targetRootId: string; targetRootTitle: string }> {
  const tree = await getBookmarkTree();
  const root = tree[0];
  const roots = root.children ?? [];
  if (roots.length === 0) {
    throw new ServiceError("BOOKMARK_ROOT_MISSING", "未找到可用的书签根目录。");
  }

  const writableRoots = roots.filter((node) => !isManagedRoot(node));
  if (writableRoots.length === 0) {
    throw new ServiceError("BOOKMARK_ROOT_MISSING", "未找到可写入的书签根目录。");
  }

  const byFolderTypeBar = writableRoots.find((node) => getFolderType(node) === "bookmarks-bar");
  if (byFolderTypeBar) {
    return { targetRootId: byFolderTypeBar.id, targetRootTitle: byFolderTypeBar.title || "Bookmarks Bar" };
  }
  const byIdBar = writableRoots.find((node) => node.id === "1");
  if (byIdBar) {
    return { targetRootId: byIdBar.id, targetRootTitle: byIdBar.title || "Bookmarks Bar" };
  }
  const byTitleBar = writableRoots.find((node) =>
    /bookmarks?\s*bar|favorites?\s*bar|书签栏|收藏夹栏/i.test(node.title)
  );
  if (byTitleBar) {
    return { targetRootId: byTitleBar.id, targetRootTitle: byTitleBar.title || "Bookmarks Bar" };
  }

  const byFolderTypeOther = writableRoots.find((node) => getFolderType(node) === "other");
  if (byFolderTypeOther) {
    return { targetRootId: byFolderTypeOther.id, targetRootTitle: byFolderTypeOther.title || "Other Bookmarks" };
  }
  const byIdOther = writableRoots.find((node) => node.id === "2");
  if (byIdOther) {
    return { targetRootId: byIdOther.id, targetRootTitle: byIdOther.title || "Other Bookmarks" };
  }
  const byTitleOther = writableRoots.find((node) =>
    /other|其他|其他书签|other bookmarks|other favorites/i.test(node.title)
  );
  if (byTitleOther) {
    return { targetRootId: byTitleOther.id, targetRootTitle: byTitleOther.title || "Other Bookmarks" };
  }

  return {
    targetRootId: writableRoots[0].id,
    targetRootTitle: writableRoots[0].title || "Root"
  };
}

/**
 * 判断顶级根目录是否为托管（不可写）。
 */
function isManagedRoot(node: chrome.bookmarks.BookmarkTreeNode): boolean {
  const unmodifiable = (node as chrome.bookmarks.BookmarkTreeNode & { unmodifiable?: string })
    .unmodifiable;
  const folderType = getFolderType(node);
  return unmodifiable === "managed" || folderType === "managed";
}

/**
 * 读取 FolderType（兼容旧版类型定义缺失）。
 */
function getFolderType(node: chrome.bookmarks.BookmarkTreeNode): string | undefined {
  return (node as chrome.bookmarks.BookmarkTreeNode & { folderType?: string }).folderType;
}

/**
 * 归一化预览分组路径，兼容旧字段并限制最多 3 级。
 */
function normalizePreviewGroupPath(
  group: { groupPath?: string[]; groupName?: string },
  index: number
): string[] {
  const rawPath =
    group.groupPath && group.groupPath.length > 0
      ? group.groupPath
      : [group.groupName ?? `分组_${index + 1}`];
  const normalized = rawPath
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);
  if (normalized.length === 0) {
    return [`分组_${index + 1}`];
  }
  if (normalized.length <= MAX_GROUP_DEPTH) {
    return normalized;
  }
  return [
    ...normalized.slice(0, MAX_GROUP_DEPTH - 1),
    normalized.slice(MAX_GROUP_DEPTH - 1).join(" / ")
  ];
}

/**
 * 逐级确保分组目录存在并返回叶子目录 ID。
 */
async function ensureGroupFolders(input: {
  rootId: string;
  groupPath: string[];
  folderCache: Map<string, string>;
}): Promise<string> {
  let parentId = input.rootId;
  for (const segment of input.groupPath) {
    const folderName = segment.trim() || "未命名分类";
    const cacheKey = `${parentId}\u0000${folderName}`;
    const cached = input.folderCache.get(cacheKey);
    if (cached) {
      parentId = cached;
      continue;
    }

    const existed = await findChildFolderIdByTitle(parentId, folderName);
    if (existed) {
      input.folderCache.set(cacheKey, existed);
      parentId = existed;
      continue;
    }

    const created = await chrome.bookmarks.create({ parentId, title: folderName });
    input.folderCache.set(cacheKey, created.id);
    parentId = created.id;
  }
  return parentId;
}

/**
 * 在父目录下按名称查找子文件夹 ID。
 */
async function findChildFolderIdByTitle(
  parentId: string,
  title: string
): Promise<string | undefined> {
  const children = await chrome.bookmarks.getChildren(parentId);
  const folder = children.find((node) => !node.url && node.title === title);
  return folder?.id;
}

type PreviewConsistencySummary = {
  totalCount: number;
  uniqueCount: number;
  duplicateCount: number;
  filteredCount: number;
};

/**
 * 校验预览中的数量关系与 ID 分配是否自洽。
 */
export function validatePreviewConsistency(
  preview: OrganizePreview
): PreviewConsistencySummary {
  const groupedBookmarkIds = new Set<string>();
  for (const group of preview.groups) {
    for (const rawId of group.bookmarkIds) {
      const bookmarkId = rawId.trim();
      if (!bookmarkId) {
        throw new ServiceError(
          "PREVIEW_INVALID_BOOKMARK_ID",
          "预览中存在空的书签 ID，请重新生成预览。"
        );
      }
      if (groupedBookmarkIds.has(bookmarkId)) {
        throw new ServiceError(
          "PREVIEW_DUPLICATE_IN_GROUPS",
          `书签 ${bookmarkId} 在多个分组中重复出现，请重新生成预览。`
        );
      }
      groupedBookmarkIds.add(bookmarkId);
    }
  }

  const duplicateIds = new Set<string>();
  for (const rawId of preview.duplicateIds) {
    const duplicateId = rawId.trim();
    if (!duplicateId) {
      throw new ServiceError(
        "PREVIEW_INVALID_DUPLICATE_ID",
        "预览中存在空的重复 ID，请重新生成预览。"
      );
    }
    if (duplicateIds.has(duplicateId)) {
      throw new ServiceError(
        "PREVIEW_DUPLICATE_LIST_CONFLICT",
        `重复列表中存在重复 ID（${duplicateId}），请重新生成预览。`
      );
    }
    duplicateIds.add(duplicateId);
  }

  for (const id of groupedBookmarkIds) {
    if (duplicateIds.has(id)) {
      throw new ServiceError(
        "PREVIEW_OVERLAP_IDS",
        `书签 ${id} 同时出现在“保留分组”和“重复列表”中，请重新生成预览。`
      );
    }
  }

  const uniqueCount = groupedBookmarkIds.size;
  const duplicateCount = duplicateIds.size;
  const totalCount = uniqueCount + duplicateCount;
  const filteredCount = preview.totalCount - totalCount;

  if (uniqueCount !== preview.uniqueCount) {
    throw new ServiceError(
      "PREVIEW_UNIQUE_COUNT_MISMATCH",
      `预览唯一数量不一致：声明 ${preview.uniqueCount}，实际 ${uniqueCount}。请重新生成预览。`
    );
  }
  if (duplicateCount !== preview.duplicateCount) {
    throw new ServiceError(
      "PREVIEW_DUPLICATE_COUNT_MISMATCH",
      `预览重复数量不一致：声明 ${preview.duplicateCount}，实际 ${duplicateCount}。请重新生成预览。`
    );
  }
  if (preview.estimatedMoveCount !== uniqueCount) {
    throw new ServiceError(
      "PREVIEW_MOVE_COUNT_MISMATCH",
      `预览预计移动数量不一致：声明 ${preview.estimatedMoveCount}，实际 ${uniqueCount}。请重新生成预览。`
    );
  }
  if (preview.totalCount !== totalCount) {
    throw new ServiceError(
      "PREVIEW_TOTAL_COUNT_MISMATCH",
      `预览总数不一致：声明 ${preview.totalCount}，实际 ${totalCount}（过滤/未分配 ${Math.max(filteredCount, 0)}）。请重新生成预览。`
    );
  }

  return {
    totalCount: preview.totalCount,
    uniqueCount,
    duplicateCount,
    filteredCount
  };
}

/**
 * 获取书签节点（不存在时抛错）。
 */
async function getBookmarkNodeOrThrow(
  bookmarkId: string
): Promise<chrome.bookmarks.BookmarkTreeNode> {
  const node = await getBookmarkNodeById(bookmarkId);
  if (node) {
    return node;
  }
  throw new ServiceError(
    "BOOKMARK_NOT_FOUND",
    `书签 ${bookmarkId} 不存在，预览可能已过期，请重新生成预览。`
  );
}

/**
 * 按 ID 读取书签节点，不存在时返回 null。
 */
async function getBookmarkNodeById(
  bookmarkId: string
): Promise<chrome.bookmarks.BookmarkTreeNode | null> {
  try {
    const nodes = await chrome.bookmarks.get(bookmarkId);
    return nodes[0] ?? null;
  } catch {
    return null;
  }
}

/**
 * 清理本次整理后遗留的空目录，并向上递归清理空父目录。
 */
async function cleanupEmptyFolders(
  candidateFolderIds: Set<string>,
  protectedRootIds: Set<string>
): Promise<number> {
  const queue = [...candidateFolderIds];
  const visited = new Set<string>();
  let cleanedCount = 0;

  while (queue.length > 0) {
    const folderId = queue.pop();
    if (!folderId || visited.has(folderId) || protectedRootIds.has(folderId)) {
      continue;
    }
    visited.add(folderId);

    const node = await getBookmarkNodeById(folderId);
    if (!node || node.url) {
      continue;
    }

    const children = await chrome.bookmarks.getChildren(folderId);
    if (children.length > 0) {
      continue;
    }

    const parentId = node.parentId ?? "";
    await chrome.bookmarks.remove(folderId);
    cleanedCount += 1;

    if (parentId && !protectedRootIds.has(parentId)) {
      queue.push(parentId);
    }
  }

  return cleanedCount;
}

/**
 * 在目标根目录下递归清理所有空目录（保留根目录本身）。
 */
async function cleanupEmptyFoldersUnderRoot(rootId: string): Promise<number> {
  return cleanupEmptyFolderNode(rootId, true);
}

/**
 * 后序遍历清理空目录。
 */
async function cleanupEmptyFolderNode(
  folderId: string,
  preserveSelf: boolean
): Promise<number> {
  const children = await chrome.bookmarks.getChildren(folderId);
  let cleanedCount = 0;

  for (const child of children) {
    if (child.url) {
      continue;
    }
    cleanedCount += await cleanupEmptyFolderNode(child.id, false);
  }

  if (preserveSelf) {
    return cleanedCount;
  }

  const latestChildren = await chrome.bookmarks.getChildren(folderId);
  if (latestChildren.length > 0) {
    return cleanedCount;
  }

  await chrome.bookmarks.remove(folderId);
  return cleanedCount + 1;
}

/**
 * 统计当前浏览器中的 URL 书签总数。
 */
async function countAllBookmarkItems(): Promise<number> {
  const tree = await getBookmarkTree();
  return flattenBookmarkTree(tree).length;
}
