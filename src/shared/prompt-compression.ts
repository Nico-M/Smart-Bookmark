/**
 * 文本限长，避免单条样本过长拖垮上下文。
 */
export function truncatePromptText(input: string, maxLength: number): string {
  const text = input.trim();
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, Math.max(0, maxLength - 3))}...`;
}

/**
 * 规范化 URL 用于提示词：只保留 host 与少量高价值路径片段。
 */
export function normalizeUrlForPrompt(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  try {
    const url = new URL(trimmed);
    const host = url.host.toLowerCase();
    const pathSegments = url.pathname
      .split("/")
      .filter(Boolean)
      .map((segment) => segment.trim())
      .filter((segment) => segment.length > 0);
    const summarizedPath = summarizeUrlPath(host, pathSegments);
    const normalized = summarizedPath ? `${host}/${summarizedPath}` : host;
    return truncatePromptText(normalized, 220);
  } catch {
    const normalized = trimmed.split(/[?#]/, 1)[0] || trimmed;
    return truncatePromptText(normalized, 220);
  }
}

/**
 * 路径仅保留最后 2 级并限制总长度，保留目录上下文但减少重复噪音。
 */
export function formatPathForPrompt(path: string[]): string {
  const compact = path
    .slice(-2)
    .map((segment) => truncatePromptText(segment.trim(), 16))
    .filter((segment) => segment.length > 0)
    .join(" / ");
  return truncatePromptText(compact, 64);
}

/**
 * 提炼 URL 路径中的有效语义，尽量保留分类线索并去掉冗长 slug。
 */
function summarizeUrlPath(host: string, segments: string[]): string {
  if (segments.length === 0) {
    return "";
  }

  // 仓库站点保留 owner/repo，通常这已经是最有价值的主题信息。
  if (["github.com", "www.github.com", "gitlab.com", "www.gitlab.com", "gitee.com"].includes(host)) {
    return segments.slice(0, 2).map(compactUrlSegment).join("/");
  }

  const meaningful = segments.filter(isMeaningfulUrlSegment);
  const picked = (meaningful.length > 0 ? meaningful : segments).slice(0, 2);
  return picked.map(compactUrlSegment).join("/");
}

/**
 * 过滤掉日期、纯数字等弱语义路径片段，避免无意义 slug 占满 token。
 */
function isMeaningfulUrlSegment(segment: string): boolean {
  const normalized = segment.toLowerCase();
  if (!normalized) {
    return false;
  }
  if (/^\d+$/.test(normalized)) {
    return false;
  }
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(normalized)) {
    return false;
  }
  if (/^[0-9a-f]{16,}$/i.test(normalized)) {
    return false;
  }
  return true;
}

/**
 * 压缩单个 URL 路径片段，去掉噪音字符并限制长度。
 */
function compactUrlSegment(segment: string): string {
  const normalized = segment
    .toLowerCase()
    .replace(/\.(html?|md|pdf)$/i, "")
    .replace(/[^a-z0-9\u4e00-\u9fa5-]+/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return truncatePromptText(normalized || segment.toLowerCase(), 24);
}
