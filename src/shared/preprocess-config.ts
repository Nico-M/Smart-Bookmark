import type { ExcludeReason } from "./types.js";

/**
 * 识别测试环境时允许命中的子域标签。
 * 这里只匹配子域，不匹配公开后缀，避免误伤 `react.dev` 这类正常站点。
 */
export const TEST_ENV_SUBDOMAIN_LABELS = ["test", "dev", "staging", "sit", "uat"] as const;

/**
 * 需要走本地文件排除逻辑的协议前缀。
 */
export const LOCAL_FILE_PROTOCOL_PREFIXES = ["file:"] as const;

/**
 * 排除原因到建议归档路径的映射。
 * 这份表是预清洗层的核心配置，后续若需要调整归档策略，优先修改这里。
 */
export const EXCLUDED_REASON_GROUP_PATHS: Record<ExcludeReason, string[]> = {
  测试环境: ["工作", "项目平台", "测试环境"],
  本地文件: ["工作", "内部系统", "本地文件"],
  本地服务: ["工作", "内部系统", "本地服务"],
  内网地址: ["工作", "内部系统", "内网地址"]
};

/**
 * 排除项建议归档的默认路径。
 */
export const DEFAULT_EXCLUDED_GROUP_PATH = ["工作", "内部系统"] as const;
