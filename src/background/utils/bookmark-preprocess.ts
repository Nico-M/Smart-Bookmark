import {
  DEFAULT_EXCLUDED_GROUP_PATH,
  EXCLUDED_REASON_GROUP_PATHS,
  LOCAL_FILE_PROTOCOL_PREFIXES,
  TEST_ENV_SUBDOMAIN_LABELS
} from "../../shared/preprocess-config.js";
import type { BookmarkItem, ExcludeReason } from "../../shared/types.js";

export type ExcludedBookmark = {
  id: string;
  title: string;
  url: string;
  reason: ExcludeReason;
  suggestedGroupPath: string[];
};

export type PreprocessResult = {
  includedItems: BookmarkItem[];
  excludedItems: ExcludedBookmark[];
};

const TEST_ENV_LABEL_SET = new Set<string>(TEST_ENV_SUBDOMAIN_LABELS);

/**
 * 对书签进行预清洗，识别不应进入公共 AI 分类流程的本地、内网和测试环境链接。
 */
export function preprocessBookmarks(items: BookmarkItem[]): PreprocessResult {
  const includedItems: BookmarkItem[] = [];
  const excludedItems: ExcludedBookmark[] = [];

  for (const item of items) {
    const reason = detectExcludeReason(item.url);
    if (!reason) {
      includedItems.push(item);
      continue;
    }

    excludedItems.push({
      id: item.id,
      title: item.title,
      url: item.url,
      reason,
      suggestedGroupPath: buildSuggestedGroupPath(reason)
    });
  }

  return { includedItems, excludedItems };
}

/**
 * 根据 URL 判断书签是否应被排除出公共分类流程，并返回排除原因。
 */
export function detectExcludeReason(rawUrl: string): ExcludeReason | undefined {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return undefined;
  }
  if (LOCAL_FILE_PROTOCOL_PREFIXES.some((prefix) => trimmed.toLowerCase().startsWith(prefix))) {
    return "本地文件";
  }

  try {
    const url = new URL(trimmed);
    const hostname = url.hostname.toLowerCase();

    if (hostname === "localhost" || hostname === "127.0.0.1") {
      return "本地服务";
    }
    if (isPrivateIpHost(hostname)) {
      return "内网地址";
    }
    if (hasTestEnvironmentLabel(hostname)) {
      return "测试环境";
    }
  } catch {
    if (LOCAL_FILE_PROTOCOL_PREFIXES.some((prefix) => trimmed.toLowerCase().startsWith(prefix))) {
      return "本地文件";
    }
  }

  return undefined;
}

/**
 * 为排除项生成稳定的建议归档路径，供预览阶段手动纳入时复用。
 */
export function buildSuggestedGroupPath(reason: ExcludeReason): string[] {
  return EXCLUDED_REASON_GROUP_PATHS[reason] ?? [...DEFAULT_EXCLUDED_GROUP_PATH];
}

/**
 * 判断主机名是否为常见私网地址。
 */
function isPrivateIpHost(hostname: string): boolean {
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)) {
    return true;
  }
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname)) {
    return true;
  }

  const match = hostname.match(/^172\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/);
  if (!match) {
    return false;
  }

  const secondOctet = Number(match[1]);
  return secondOctet >= 16 && secondOctet <= 31;
}

/**
 * 判断主机名中是否包含测试环境标签，仅匹配子域标签，避免误伤 `.dev` 这类公开域名。
 */
function hasTestEnvironmentLabel(hostname: string): boolean {
  const segments = hostname.split(".").filter(Boolean);
  if (segments.length < 3) {
    return false;
  }

  // 只检查真实子域标签，避免把 `dev.to` 这类公开主域名误判成测试环境。
  return segments.slice(0, -2).some((segment) => TEST_ENV_LABEL_SET.has(segment));
}
