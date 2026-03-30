import type { BookmarkItem, GroupPlan } from "./types.js";

export type GroupReviewCandidate = {
  id: string;
  groupPath: string[];
  count: number;
  sampleTitles: string[];
};

/**
 * 按固定条数切分批次，便于第一阶段稳定控制单次请求规模。
 */
export function splitIntoFixedBatches<T>(items: T[], batchSize: number): T[][] {
  if (batchSize <= 0) {
    return [items];
  }

  const batches: T[][] = [];
  for (let index = 0; index < items.length; index += batchSize) {
    batches.push(items.slice(index, index + batchSize));
  }

  return batches.length > 0 ? batches : [items];
}

/**
 * 构建第二阶段组名复检候选，只保留分组路径、条目数和少量标题样本。
 */
export function buildGroupReviewCandidates(
  groups: GroupPlan[],
  bookmarkById: ReadonlyMap<string, BookmarkItem>,
  sampleTitleLimit = 3
): GroupReviewCandidate[] {
  return groups.map((group, index) => ({
    id: `g${index + 1}`,
    groupPath: [...group.groupPath],
    count: group.bookmarkIds.length,
    sampleTitles: collectSampleTitles(group, bookmarkById, sampleTitleLimit)
  }));
}

/**
 * 采样少量标题，帮助第二阶段判断组名是否重复或偏题。
 */
function collectSampleTitles(
  group: GroupPlan,
  bookmarkById: ReadonlyMap<string, BookmarkItem>,
  sampleTitleLimit: number
): string[] {
  const sampleTitles: string[] = [];
  const seen = new Set<string>();

  for (const bookmarkId of group.bookmarkIds) {
    const title = (bookmarkById.get(bookmarkId)?.title ?? "").trim();
    if (!title || seen.has(title)) {
      continue;
    }

    sampleTitles.push(title);
    seen.add(title);
    if (sampleTitles.length >= sampleTitleLimit) {
      break;
    }
  }

  return sampleTitles;
}
