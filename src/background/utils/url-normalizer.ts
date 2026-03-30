const TRACKING_PARAM_PREFIX = "utm_";
const TRACKING_PARAMS = new Set(["fbclid", "gclid"]);

/**
 * 生成去重用的 URL 规范化 key。
 */
export function normalizeUrlForDedup(input: string): string {
  try {
    const url = new URL(input);

    for (const key of [...url.searchParams.keys()]) {
      const lowerKey = key.toLowerCase();
      if (lowerKey.startsWith(TRACKING_PARAM_PREFIX) || TRACKING_PARAMS.has(lowerKey)) {
        url.searchParams.delete(key);
      }
    }

    url.hash = "";
    url.hostname = url.hostname.toLowerCase();

    const protocol =
      url.protocol === "http:" || url.protocol === "https:" ? "https:" : url.protocol;
    const pathname = url.pathname.replace(/\/+$/, "");
    const params = [...url.searchParams.entries()].sort(([a], [b]) => a.localeCompare(b));
    const search = params.length > 0 ? `?${new URLSearchParams(params).toString()}` : "";

    return `${protocol}//${url.host}${pathname}${search}`;
  } catch {
    return input.trim().toLowerCase();
  }
}

/**
 * 基于 URL 生成默认分组名，AI 不可用时可作为兜底分组。
 */
export function getGroupNameFromUrl(input: string): string {
  try {
    const { hostname } = new URL(input);
    return hostname.replace(/^www\./i, "") || "未分类";
  } catch {
    return "未分类";
  }
}
