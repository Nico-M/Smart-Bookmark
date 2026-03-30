import {
  FALLBACK_TOP_LEVEL_NAME,
  FORBIDDEN_GROUP_NAME_PATTERNS,
  SECOND_LEVEL_RULES,
  THIRD_LEVEL_RULES,
  TOP_LEVEL_ALIAS_RULES,
  TOP_LEVEL_GROUPS,
  TOP_LEVEL_INFER_RULES
} from "./taxonomy.js";
import type { TopLevelGroupName } from "./taxonomy.js";
import type { BookmarkItem } from "./types.js";

export const MAX_GROUP_DEPTH = 3;
export const MAX_TOP_LEVEL_GROUPS = 10;
export const FALLBACK_CHILD_NAME = "站点分组";
export { FALLBACK_TOP_LEVEL_NAME, TOP_LEVEL_GROUPS } from "./taxonomy.js";

const TOP_LEVEL_GROUP_SET = new Set<string>(TOP_LEVEL_GROUPS);
const AI_HINT_PATTERN =
  /(artificial intelligence|aigc|agent|mcp|llm|gpt|claude|gemini|deepseek|ollama|prompt|提示词|midjourney|stable diffusion|文生图|图生图|ai\b)/i;

/**
 * 归一化路径文本，减少 AI 命名时的标点和空白噪音。
 */
function normalizeSegmentText(segment: string): string {
  return segment
    .replace(/[｜|]+/g, "与")
    .replace(/\s*\/\s*/g, "与")
    .replace(/\s*&\s*/gi, "与")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * 将书签元数据压平为便于规则匹配的文本。
 */
function buildBookmarkText(bookmark?: BookmarkItem): string {
  return `${bookmark?.title ?? ""} ${bookmark?.url ?? ""} ${(bookmark?.path ?? []).join(" ")}`
    .trim()
    .toLowerCase();
}

/**
 * 判断书签正文是否真的包含 AI 语义，避免把普通编程资源误塞进 AI。
 */
function hasAiHint(bookmark?: BookmarkItem): boolean {
  return AI_HINT_PATTERN.test(buildBookmarkText(bookmark));
}

/**
 * 将已有或 AI 生成的一级分类名归并到固定白名单。
 */
function canonicalizeTopLevelGroupName(segment: string): string | undefined {
  const normalized = normalizeSegmentText(segment);
  if (!normalized) {
    return undefined;
  }
  if (TOP_LEVEL_GROUP_SET.has(normalized)) {
    return normalized;
  }
  return TOP_LEVEL_ALIAS_RULES.find((rule) => rule.pattern.test(normalized))?.name;
}

/**
 * 根据书签内容推断稳定的一级分类。
 */
export function inferTopLevelGroupName(bookmark?: BookmarkItem): string {
  const text = buildBookmarkText(bookmark);
  const matched = TOP_LEVEL_INFER_RULES.find((rule) => rule.pattern.test(text));
  return matched?.name ?? FALLBACK_TOP_LEVEL_NAME;
}

/**
 * 解析二级分类，优先将常见别名归并为稳定名称。
 */
function inferSecondLevelGroupName(topLevel: string, text: string): string | undefined {
  return SECOND_LEVEL_RULES[topLevel as TopLevelGroupName]?.find((rule) => rule.pattern.test(text))
    ?.name;
}

/**
 * 解析三级分类，按已经确认的二级分类做更细粒度归并。
 */
function inferThirdLevelGroupName(secondLevel: string, text: string): string | undefined {
  return THIRD_LEVEL_RULES[secondLevel]?.find((rule) => rule.pattern.test(text))?.name;
}

/**
 * 兜底提取域名主体，避免极少数无法归类的书签丢失可读性。
 */
function extractDomainLabel(rawUrl: string): string | undefined {
  try {
    const hostname = new URL(rawUrl).hostname.toLowerCase().replace(/^www\./, "");
    const parts = hostname.split(".").filter(Boolean);
    if (parts.length === 0) {
      return undefined;
    }
    let core = parts[parts.length - 2] ?? parts[0];
    if (parts.length >= 3 && parts[parts.length - 1].length <= 2) {
      core = parts[parts.length - 3] ?? core;
    }
    const cleaned = core.replace(/[^a-z0-9\u4e00-\u9fa5-]/gi, "");
    return cleaned || undefined;
  } catch {
    return undefined;
  }
}

/**
 * 根据书签内容推断语义化的二级分类，避免直接按站点名分桶。
 */
export function inferSubLevelGroupName(bookmark?: BookmarkItem): string | undefined {
  if (!bookmark) {
    return undefined;
  }

  const topLevel = inferTopLevelGroupName(bookmark);
  const text = buildBookmarkText(bookmark);
  const semanticName = inferSecondLevelGroupName(topLevel, text);
  if (semanticName) {
    return semanticName;
  }

  const domainLabel = extractDomainLabel(bookmark.url);
  if (!domainLabel) {
    return undefined;
  }

  const normalized = normalizeSegmentText(domainLabel).slice(0, 12);
  return normalized || undefined;
}

/**
 * 根据书签内容推断稳定三级分类，仅在二级分类已明确时启用。
 */
export function inferThirdLevelGroupNameFromBookmark(bookmark?: BookmarkItem): string | undefined {
  if (!bookmark) {
    return undefined;
  }

  const secondLevel = inferSubLevelGroupName(bookmark);
  if (!secondLevel) {
    return undefined;
  }

  return inferThirdLevelGroupName(secondLevel, buildBookmarkText(bookmark));
}

/**
 * 从路径各级中反推可能的一级分类，优先用于修正“其他主题”等弱分类。
 */
function inferTopLevelFromPathSegments(path: string[]): string | undefined {
  for (const segment of path.slice(1)) {
    const canonical = canonicalizeTopLevelGroupName(segment);
    if (canonical && canonical !== FALLBACK_TOP_LEVEL_NAME) {
      return canonical;
    }
  }
  return undefined;
}

/**
 * 归一化一级分类，必要时按书签内容推翻 AI 的弱分类或误分类。
 */
function resolveTopLevelGroupName(path: string[], bookmark?: BookmarkItem): string {
  const rawTopLevel = path[0];
  const rawCanonical = canonicalizeTopLevelGroupName(rawTopLevel);
  const pathInferredTopLevel = inferTopLevelFromPathSegments(path);
  const bookmarkInferredTopLevel = inferTopLevelGroupName(bookmark);

  if (!rawCanonical) {
    return pathInferredTopLevel ?? bookmarkInferredTopLevel;
  }

  if (rawCanonical === FALLBACK_TOP_LEVEL_NAME) {
    if (pathInferredTopLevel) {
      return pathInferredTopLevel;
    }
    return bookmarkInferredTopLevel;
  }

  if (rawCanonical === "AI" && bookmarkInferredTopLevel !== "AI" && !hasAiHint(bookmark)) {
    return bookmarkInferredTopLevel;
  }

  return rawCanonical;
}

/**
 * 仅根据书签正文推断稳定二级分类，避免被错误路径污染。
 */
function inferSecondLevelGroupNameFromBookmark(
  topLevel: string,
  bookmark?: BookmarkItem
): string | undefined {
  return inferSecondLevelGroupName(topLevel, buildBookmarkText(bookmark));
}

/**
 * 从原始路径中提取可归并的二级分类，深层节点优先于上层广义节点。
 */
function inferSecondLevelGroupNameFromPath(topLevel: string, path: string[]): {
  name?: string;
  consumedIndex?: number;
} {
  for (let index = path.length - 1; index >= 1; index -= 1) {
    const name = inferSecondLevelGroupName(topLevel, path[index].toLowerCase());
    if (name) {
      return { name, consumedIndex: index };
    }
  }
  return {};
}

/**
 * 从原始路径中提取可归并的三级分类，优先使用更深层的具体节点。
 */
function inferThirdLevelGroupNameFromPath(secondLevel: string, path: string[]): {
  name?: string;
  consumedIndex?: number;
} {
  for (let index = path.length - 1; index >= 1; index -= 1) {
    const name = inferThirdLevelGroupName(secondLevel, path[index].toLowerCase());
    if (name) {
      return { name, consumedIndex: index };
    }
  }
  return {};
}

/**
 * 统一生成兜底分组，确保 AI 失败时仍然遵循同一套分类体系。
 */
export function inferGroupPathFromBookmark(bookmark?: BookmarkItem): string[] {
  const topLevel = inferTopLevelGroupName(bookmark);
  const subLevel = inferSubLevelGroupName(bookmark);
  if (!subLevel || subLevel === topLevel) {
    return [topLevel];
  }
  return [topLevel, subLevel];
}

/**
 * 归一化 AI 返回路径，强制一级分类落在固定白名单内。
 */
export function normalizeGroupPathWithTaxonomy(
  path: string[],
  bookmark?: BookmarkItem
): string[] {
  const cleanedPath = path.map(normalizeSegmentText).filter((segment) => segment.length > 0);
  if (cleanedPath.length === 0) {
    return inferGroupPathFromBookmark(bookmark);
  }

  const rawTopLevel = cleanedPath[0];
  const topLevel = resolveTopLevelGroupName(cleanedPath, bookmark);
  const normalizedPath: string[] = [topLevel];
  const bookmarkSecondLevel = inferSecondLevelGroupNameFromBookmark(topLevel, bookmark);
  const { name: pathSecondLevel, consumedIndex } = inferSecondLevelGroupNameFromPath(
    topLevel,
    cleanedPath
  );
  const fallbackSecondLevel =
    cleanedPath[1] ?? (topLevel !== rawTopLevel ? rawTopLevel : undefined);
  const secondLevel = bookmarkSecondLevel ?? pathSecondLevel ?? fallbackSecondLevel;

  if (secondLevel && secondLevel !== topLevel) {
    normalizedPath.push(secondLevel);
  }

  const shouldResolveThirdLevel = cleanedPath.length >= 3 && Boolean(secondLevel);
  const bookmarkThirdLevel =
    shouldResolveThirdLevel && secondLevel && bookmark
      ? inferThirdLevelGroupName(secondLevel, buildBookmarkText(bookmark))
      : undefined;
  const { name: pathThirdLevel, consumedIndex: thirdConsumedIndex } = shouldResolveThirdLevel && secondLevel
    ? inferThirdLevelGroupNameFromPath(secondLevel, cleanedPath)
    : {};
  const thirdLevel = bookmarkThirdLevel ?? pathThirdLevel;

  if (
    thirdLevel &&
    thirdLevel !== topLevel &&
    thirdLevel !== secondLevel &&
    !FORBIDDEN_GROUP_NAME_PATTERNS.some((pattern) => pattern.test(thirdLevel))
  ) {
    normalizedPath.push(thirdLevel);
  }

  for (let index = 1; index < cleanedPath.length; index += 1) {
    const segment = cleanedPath[index];
    if (normalizedPath.length >= MAX_GROUP_DEPTH) {
      break;
    }
    if (!segment || normalizedPath.includes(segment)) {
      continue;
    }
    if (index === consumedIndex) {
      continue;
    }
    if (index === thirdConsumedIndex) {
      continue;
    }
    if (segment === rawTopLevel || segment === normalizedPath[1]) {
      continue;
    }
    const normalizedSegmentAlias = inferSecondLevelGroupName(topLevel, segment.toLowerCase());
    if (normalizedSegmentAlias && index < (consumedIndex ?? Number.MAX_SAFE_INTEGER)) {
      continue;
    }
    if (normalizedSegmentAlias === normalizedPath[1]) {
      continue;
    }
    if (FORBIDDEN_GROUP_NAME_PATTERNS.some((pattern) => pattern.test(segment))) {
      continue;
    }
    normalizedPath.push(segment);
  }

  if (normalizedPath.length === 1 && bookmark) {
    const fallbackSubLevel = inferSubLevelGroupName(bookmark);
    if (fallbackSubLevel && fallbackSubLevel !== normalizedPath[0]) {
      normalizedPath.push(fallbackSubLevel);
    }
  }

  return normalizedPath.slice(0, MAX_GROUP_DEPTH);
}
