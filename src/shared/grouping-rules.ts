import type { BookmarkItem } from "./types.js";

export const MAX_GROUP_DEPTH = 3;
export const MAX_TOP_LEVEL_GROUPS = 10;
export const FALLBACK_TOP_LEVEL_NAME = "其他主题";
export const FALLBACK_CHILD_NAME = "站点分组";
export const TOP_LEVEL_GROUPS = [
  "技术",
  "AI",
  "工具",
  "设计",
  "学习",
  "资讯",
  "工作",
  "生活",
  "影音",
  FALLBACK_TOP_LEVEL_NAME
] as const;

const TOP_LEVEL_GROUP_SET = new Set<string>(TOP_LEVEL_GROUPS);
const AI_HINT_PATTERN =
  /(artificial intelligence|aigc|agent|mcp|llm|gpt|claude|gemini|deepseek|ollama|prompt|提示词|midjourney|stable diffusion|文生图|图生图|ai\b)/i;
const TOP_LEVEL_ALIAS_RULES: Array<{ pattern: RegExp; name: string }> = [
  {
    pattern:
      /(技术开发|技术社区|技术资源|技术博客|技术资讯|核心技术|前端开发|前端框架|编程语言|博客系统|后端开发|语言与规范|react生态|vue与node|移动与小程序|开发工具)/i,
    name: "技术"
  },
  {
    pattern:
      /(人工智能|aigc|ai与python|ai 与 数字化|ai编程与api|ai创作与提示词|模型|llm|agent|mcp|prompt|提示词)/i,
      name: "AI"
  },
  {
    pattern:
      /(个人工具|效率工具|软件工具|资源下载|资源搜索|网络工具|代理与增强|搜索镜像|在线工具|软件资源与系统工具|实用工具)/i,
    name: "工具"
  },
  {
    pattern: /(设计素材|设计与ui|视觉资源|图标与图片|可视化|ui|设计)/i,
    name: "设计"
  },
  {
    pattern:
      /(学习教育|综合学习|编程与技术基础|知识共享|电子书|在线课程|语言与综合技能|学习成长)/i,
    name: "学习"
  },
  {
    pattern: /(综合资讯|科技媒体|资讯与社区|技术资讯|新闻|媒体|资讯阅读|资讯)/i,
    name: "资讯"
  },
  {
    pattern: /(公司业务|内部系统|办公门户|项目平台|工作台|控制台|仪表盘|dashboard|办公)/i,
    name: "工作"
  },
  {
    pattern: /(购物社交|生活兴趣|购物|社交|消费|生活)/i,
    name: "生活"
  },
  {
    pattern: /(影视娱乐|在线影视|音乐与兴趣|视频影视|音乐兴趣|视频|影视|娱乐)/i,
    name: "影音"
  }
];

const TOP_LEVEL_INFER_RULES: Array<{ pattern: RegExp; name: string }> = [
  {
    pattern:
      /(github|gitlab|stack|docs|developer|前端|后端|编程|开发|代码|技术|react|vue|angular|javascript|typescript|node|webpack|vite|css|html)/i,
    name: "技术"
  },
  {
    pattern:
      /(aigc|artificial intelligence|agent|mcp|llm|gpt|claude|gemini|deepseek|ollama|prompt|提示词|midjourney|stable diffusion|模型|ai )/i,
    name: "AI"
  },
  {
    pattern:
      /(tool|util|convert|generator|下载|软件|系统|proxy|clash|hosts|网盘|磁力|工具|效率)/i,
    name: "工具"
  },
  {
    pattern: /(design|ui|icon|illustration|素材|设计|图标|图片|视觉|配色|可视化)/i,
    name: "设计"
  },
  {
    pattern: /(learn|course|edu|study|教程|课程|学习|教育|book|ebook|guide)/i,
    name: "学习"
  },
  {
    pattern: /(news|资讯|新闻|article|blog|媒体|日报|快讯)/i,
    name: "资讯"
  },
  {
    pattern:
      /(oa|workspace|console|platform|dashboard|jenkins|yapi|devops|内部|办公|项目|工作台|仪表盘)/i,
    name: "工作"
  },
  {
    pattern: /(shop|mall|amazon|taobao|jd|购物|电商|社交|社区|论坛|消费)/i,
    name: "生活"
  },
  {
    pattern: /(youtube|bilibili|video|music|movie|netflix|影视|视频|音乐|娱乐|游戏)/i,
    name: "影音"
  }
];

const SECOND_LEVEL_RULES: Record<string, Array<{ pattern: RegExp; name: string }>> = {
  技术: [
    {
      pattern:
        /(前端|react|vue|angular|css|html|javascript|typescript|rxjs|web|浏览器|小程序|uniapp|ionic)/i,
      name: "前端开发"
    },
    {
      pattern: /(后端|server|java|spring|api|golang|rust|nodejs|数据库|sql|mysql|redis)/i,
      name: "后端开发"
    },
    {
      pattern: /(编程语言|基础与语言|语言|编程|基础|规范|算法|python|go|rust|swift)/i,
      name: "基础与语言"
    },
    {
      pattern: /(工具|debug|调试|构建|工程化|代理|mock|sandbox|git|npm|webpack|vite|ci|cd|devops)/i,
      name: "开发工具"
    },
    {
      pattern:
        /(社区与博客|社区博客|社区|博客|专栏|forum|community|segmentfault|掘金|cnblogs|alloyteam|aotu|fex)/i,
      name: "社区博客"
    },
    {
      pattern: /(资源导航|文档资源|文档|手册|docs|wiki|guide|导航|资源|cheatsheet|参考|教程集合)/i,
      name: "文档资源"
    }
  ],
  AI: [
    {
      pattern:
        /(编程与平台|工具|平台|编程|api|agent|mcp|sdk|token|console|模型|llm|gpt|claude|gemini|deepseek|ollama|code|vibe coding)/i,
      name: "编程与平台"
    },
    {
      pattern:
        /(创作与提示词|提示词|prompt|midjourney|text2img|image|图片|music|音乐|创作|anime|draw|ui|design|图库|素材|风格)/i,
      name: "创作与提示词"
    },
    {
      pattern: /(教程|课程|学习|python|入门|lesson|guide)/i,
      name: "学习资源"
    },
    {
      pattern: /(论文|research|资讯|新闻|paper)/i,
      name: "资讯研究"
    }
  ],
  工具: [
    {
      pattern: /(效率|whiteboard|resume|简历|excalidraw|airdroid|效率工具|个人工具)/i,
      name: "效率工具"
    },
    {
      pattern: /(资源搜索|搜索镜像|搜索|网盘搜索|导航搜索)/i,
      name: "资源搜索"
    },
    {
      pattern: /(资源下载|下载站|bt|torrent|磁力|解析下载|下载器|下载)/i,
      name: "资源下载"
    },
    {
      pattern: /(软件资源|软件下载|mac|windows|app|ipa|store|软件|软件站|应用分享)/i,
      name: "软件资源"
    },
    {
      pattern: /(系统与网络|网络工具|代理与增强|proxy|clash|hosts|dns|network|ip verify|geo)/i,
      name: "系统与网络"
    },
    {
      pattern: /(在线工具|在线|json|convert|generator|markdown|tool|util|占位图片|format)/i,
      name: "在线工具"
    }
  ],
  设计: [
    { pattern: /(图标|icon|图片|image|插画|素材|stock)/i, name: "图标素材" },
    { pattern: /(可视化|chart|echarts|dashboard|图表)/i, name: "可视化" },
    { pattern: /(ui|设计|组件|配色|灵感)/i, name: "UI设计" }
  ],
  学习: [
    { pattern: /(课程|教程|study|guide|learn|lesson)/i, name: "课程教程" },
    { pattern: /(book|ebook|电子书|文档|资料)/i, name: "资料文档" },
    { pattern: /(英语|词典|语言)/i, name: "语言技能" }
  ],
  资讯: [
    { pattern: /(技术|开发|程序员|前端|后端)/i, name: "技术资讯" },
    { pattern: /(科技|数码|行业|综合)/i, name: "综合资讯" }
  ],
  工作: [
    { pattern: /(公司业务|内部|oa|门户|workspace|console|系统)/i, name: "内部系统" },
    { pattern: /(项目|平台|dashboard|devops|jenkins|yapi)/i, name: "项目平台" }
  ],
  生活: [
    { pattern: /(购物|电商|消费)/i, name: "购物消费" },
    { pattern: /(社交|社区|论坛)/i, name: "社交社区" }
  ],
  影音: [
    { pattern: /(在线影视|影视导航|视频影视|视频|影视|movie|tv|anime|bilibili|youtube|影院|剧)/i, name: "在线影视" },
    { pattern: /(音乐与兴趣|音乐兴趣|音乐|music|radio|吉他|listen|live)/i, name: "音乐兴趣" }
  ],
  其他主题: []
};

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
  return SECOND_LEVEL_RULES[topLevel]?.find((rule) => rule.pattern.test(text))?.name;
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
