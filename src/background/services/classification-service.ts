import type { BookmarkItem, OrganizePreview } from "@/shared/types";
import { classifyWithAi } from "./ai-service";
import { getBookmarksFromFolder } from "./tree-scope-service";
import { getConfig, hasAiConfig } from "./config-service";
import {
  flattenBookmarkTree,
  getBookmarkTree,
  validatePreviewConsistency
} from "./bookmark-service";
import { ServiceError } from "../utils/service-error";
import { deduplicateBookmarks } from "../utils/dedup";

const SESSION_PREVIEW_KEY = "session:preview";

/**
 * 生成整理预览，包含去重统计和分组结果。
 */
export async function generatePreview(folderId?: string): Promise<OrganizePreview> {
  const items = await listScopeBookmarks(folderId);
  const dedupResult = deduplicateBookmarks(items);
  const config = await getConfig();
  if (!hasAiConfig(config)) {
    throw new ServiceError(
      "AI_CONFIG_REQUIRED",
      "请先在设置页配置 API Key、Base URL、Model 后再进行分类。"
    );
  }
  const groups = await classifyWithAi(dedupResult.uniqueItems, config);

  const preview: OrganizePreview = {
    generatedAt: Date.now(),
    totalCount: items.length,
    uniqueCount: dedupResult.uniqueItems.length,
    duplicateCount: dedupResult.duplicateIds.length,
    estimatedMoveCount: dedupResult.uniqueItems.length,
    groups,
    duplicateIds: dedupResult.duplicateIds,
    source: "ai"
  };
  validatePreviewConsistency(preview);

  await chrome.storage.session.set({ [SESSION_PREVIEW_KEY]: preview });
  return preview;
}

/**
 * 按文件夹重跑预览。
 */
export async function regeneratePreviewByFolder(folderId: string): Promise<OrganizePreview> {
  return generatePreview(folderId);
}

/**
 * 读取缓存的最近一次预览结果。
 */
export async function getLastPreview(): Promise<OrganizePreview | null> {
  const result = await chrome.storage.session.get(SESSION_PREVIEW_KEY);
  return (result[SESSION_PREVIEW_KEY] as OrganizePreview | undefined) ?? null;
}

/**
 * 根据作用域获取书签列表。
 */
async function listScopeBookmarks(folderId?: string): Promise<BookmarkItem[]> {
  if (!folderId) {
    const tree = await getBookmarkTree();
    return flattenBookmarkTree(tree);
  }

  return getBookmarksFromFolder(folderId);
}
