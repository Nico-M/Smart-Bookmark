import type { BookmarkItem } from "../../shared/types.js";
import { normalizeUrlForDedup } from "./url-normalizer.js";

export type DedupResult = {
  uniqueItems: BookmarkItem[];
  duplicateIds: string[];
};

/**
 * 对书签执行 URL 去重并返回唯一项与重复项。
 */
export function deduplicateBookmarks(items: BookmarkItem[]): DedupResult {
  const bucket = new Map<string, BookmarkItem[]>();
  for (const item of items) {
    const key = normalizeUrlForDedup(item.url);
    const current = bucket.get(key) ?? [];
    bucket.set(key, [...current, item]);
  }

  const uniqueItems: BookmarkItem[] = [];
  const duplicateIds: string[] = [];

  for (const entries of bucket.values()) {
    const sorted = [...entries].sort(compareMainBookmark);
    uniqueItems.push(sorted[0]);
    duplicateIds.push(...sorted.slice(1).map((item) => item.id));
  }

  return { uniqueItems, duplicateIds };
}

/**
 * 比较主记录优先级：标题非空 > 路径更短 > ID 更小。
 */
export function compareMainBookmark(a: BookmarkItem, b: BookmarkItem): number {
  const aHasTitle = Number(Boolean(a.title.trim()));
  const bHasTitle = Number(Boolean(b.title.trim()));
  if (aHasTitle !== bHasTitle) {
    return bHasTitle - aHasTitle;
  }
  if (a.path.length !== b.path.length) {
    return a.path.length - b.path.length;
  }
  return a.id.localeCompare(b.id, "zh-CN");
}
