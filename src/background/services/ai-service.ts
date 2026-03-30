import { aiGroupReviewOutputSchema, aiOutputSchema } from "@/shared/schemas";
import {
  FALLBACK_CHILD_NAME,
  FALLBACK_TOP_LEVEL_NAME,
  MAX_TOP_LEVEL_GROUPS,
  TOP_LEVEL_GROUPS,
  inferGroupPathFromBookmark,
  normalizeGroupPathWithTaxonomy
} from "@/shared/grouping-rules";
import {
  FACET_OPTIONS,
  FORBIDDEN_GROUP_NAME_PATTERNS,
  FORBIDDEN_GROUP_NAMES,
  SECOND_LEVEL_GROUP_OPTIONS,
  THIRD_LEVEL_GROUP_OPTIONS
} from "@/shared/taxonomy";
import { buildGroupReviewCandidates, splitIntoFixedBatches } from "@/shared/group-review";
import {
  formatPathForPrompt,
  normalizeUrlForPrompt,
  truncatePromptText
} from "@/shared/prompt-compression";
import type { AppConfig, BookmarkItem, GroupPlan } from "@/shared/types";
import { ServiceError } from "../utils/service-error";
import { appendErrorLog } from "../utils/logger";

const AI_RETRY_COUNT = 2;
const MAX_AUTO_SPLIT_DEPTH = 12;
const AI_FIRST_PASS_BATCH_SIZE = 300;
const AI_FIRST_PASS_CONCURRENCY = 3;
const AI_DEBUG_PRINT_ONLY = false;
const AI_INCLUDE_FACETS = false;
const AI_REVIEW_SAMPLE_TITLE_LIMIT = 3;
const NON_RETRYABLE_AI_ERROR_CODES = new Set<string>([
  "AI_AUTH_INVALID",
  "AI_EMPTY_RESPONSE",
  "AI_JSON_PARSE_ERROR",
  "AI_SCHEMA_INVALID",
  "AI_CONFIG_MISSING",
  "AI_INPUT_TOO_LARGE"
]);
const TOP_LEVEL_GROUP_OPTIONS_TEXT = TOP_LEVEL_GROUPS.join("、");
const FORBIDDEN_GROUP_NAMES_TEXT = FORBIDDEN_GROUP_NAMES.join("、");

type GroupBucket = { groupPath: string[]; bookmarkIds: string[]; reason?: string };
type GroupBucketMap = Map<string, GroupBucket>;
type PromptBookmark = {
  id: string;
  title: string;
  url: string;
  pathIndex: number;
};
type PromptPayload = {
  task: "group_bookmarks";
  instruction: string[];
  facetSchema: {
    primary_topic: string;
    resource_type: string[];
    source_type: string[];
    usage_intent: string[];
    scope: string[];
  };
  taxonomy: {
    topLevel: typeof TOP_LEVEL_GROUPS;
    secondLevelByTop: typeof SECOND_LEVEL_GROUP_OPTIONS;
    thirdLevelBySecond: typeof THIRD_LEVEL_GROUP_OPTIONS;
    forbiddenGroupNames: typeof FORBIDDEN_GROUP_NAMES;
  };
  pathDict: string[];
  bookmarks: PromptBookmark[];
};
type GroupReviewPromptGroup = {
  id: string;
  groupPath: string[];
  count: number;
  sampleTitles: string[];
};
type GroupReviewPromptPayload = {
  task: "review_group_names";
  instruction: string[];
  taxonomy: {
    topLevel: typeof TOP_LEVEL_GROUPS;
    secondLevelByTop: typeof SECOND_LEVEL_GROUP_OPTIONS;
    thirdLevelBySecond: typeof THIRD_LEVEL_GROUP_OPTIONS;
    forbiddenGroupNames: typeof FORBIDDEN_GROUP_NAMES;
  };
  groups: GroupReviewPromptGroup[];
};

type ChatCompletionResponse = {
  choices?: Array<{
    finish_reason?: string;
    message?: {
      content?: unknown;
    };
  }>;
};

/**
 * 调用 AI 进行分组与分组命名。
 */
export async function classifyWithAi(
  bookmarks: BookmarkItem[],
  config: AppConfig
): Promise<GroupPlan[]> {
  validateConfig(config);
  if (bookmarks.length === 0) {
    return [];
  }

  if (AI_DEBUG_PRINT_ONLY) {
    await traceDebugRequest(bookmarks, config);
    return buildDebugGroupPlans(bookmarks);
  }

  const bookmarkById = new Map(bookmarks.map((item) => [item.id, item] as const));
  const grouped: GroupBucketMap = new Map();
  const batches = splitBatchesForAi(bookmarks);
  await classifyFirstPassBatches(batches, config, grouped);

  const firstPassGroups = finalizeGroupPlans(grouped);
  return reviewGroupPlansWithAi(firstPassGroups, bookmarkById, config);
}

/**
 * 第一阶段按受限并发执行，兼顾速度与 provider 限流风险。
 */
async function classifyFirstPassBatches(
  batches: BookmarkItem[][],
  config: AppConfig,
  grouped: GroupBucketMap
): Promise<void> {
  const total = batches.length;
  let nextIndex = 0;
  const workerCount = Math.min(AI_FIRST_PASS_CONCURRENCY, total);

  const workers = Array.from({ length: workerCount }, async () => {
    while (nextIndex < total) {
      const currentIndex = nextIndex;
      nextIndex += 1;

      await classifyAndMergeWithAutoSplit({
        batch: batches[currentIndex],
        config,
        grouped,
        batchNo: currentIndex + 1,
        batchTotal: total,
        splitDepth: 0
      });
    }
  });

  await Promise.all(workers);
}

/**
 * 优先单次请求；若输入过大则自动二分拆分并合并结果。
 */
async function classifyAndMergeWithAutoSplit(input: {
  batch: BookmarkItem[];
  config: AppConfig;
  grouped: GroupBucketMap;
  batchNo: number;
  batchTotal: number;
  splitDepth: number;
}): Promise<void> {
  try {
    const output = await classifyBatchWithRetry(
      input.batch,
      input.config,
      input.batchNo,
      input.batchTotal
    );
    mergeBatchResult(input.grouped, input.batch, output.groups);
  } catch (error) {
    const normalized = normalizeAiError(error);
    if (!shouldAutoSplit(normalized, input.batch.length)) {
      throw normalized;
    }
    if (input.splitDepth >= MAX_AUTO_SPLIT_DEPTH) {
      throw new ServiceError(
        "AI_INPUT_TOO_LARGE",
        "输入样本过大，自动拆分后仍无法完成，请缩小范围后重试。",
        false
      );
    }

    const [left, right] = splitBatchInHalf(input.batch);
    await traceAutoSplit({
      splitDepth: input.splitDepth + 1,
      batchSize: input.batch.length,
      leftSize: left.length,
      rightSize: right.length,
      reason: normalized.message
    });

    await classifyAndMergeWithAutoSplit({
      ...input,
      batch: left,
      splitDepth: input.splitDepth + 1
    });
    await classifyAndMergeWithAutoSplit({
      ...input,
      batch: right,
      splitDepth: input.splitDepth + 1
    });
  }
}

/**
 * 第一阶段按固定条数分批，优先控制输出体积；若单批仍超限，再自动二分降载。
 */
function splitBatchesForAi(bookmarks: BookmarkItem[]): BookmarkItem[][] {
  return splitIntoFixedBatches(bookmarks, AI_FIRST_PASS_BATCH_SIZE);
}

/**
 * 带重试地执行单批次分类请求。
 */
async function classifyBatchWithRetry(
  batch: BookmarkItem[],
  config: AppConfig,
  batchNo: number,
  batchTotal: number
) {
  let lastError: unknown;

  for (let attempt = 0; attempt <= AI_RETRY_COUNT; attempt += 1) {
    try {
      return await classifyBatchOnce(batch, config);
    } catch (error) {
      const normalized = normalizeAiError(error);
      lastError = normalized;
      const shouldRetry =
        normalized.retryable &&
        !NON_RETRYABLE_AI_ERROR_CODES.has(normalized.code) &&
        attempt < AI_RETRY_COUNT;

      await traceRetryDecision({
        batchNo,
        batchTotal,
        attempt: attempt + 1,
        retryable: normalized.retryable,
        shouldRetry,
        code: normalized.code,
        message: normalized.message
      });

      if (!shouldRetry) {
        throw normalized;
      }

      await sleep((2 ** attempt) * 1_000);
    }
  }

  throw normalizeAiError(lastError);
}

/**
 * 执行单批次 AI 分类请求并做结构校验。
 */
async function classifyBatchOnce(
  batch: BookmarkItem[],
  config: AppConfig
) {
  const url = toChatCompletionsUrl(config.baseUrl);
  const body = buildChatCompletionBody(batch, config.model);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`
      },
      body: JSON.stringify(body)
    });
    const errorDetail = response.ok ? "" : await readErrorDetail(response);

    if (response.status === 401) {
      throw new ServiceError("AI_AUTH_INVALID", "API Key 无效或已过期。");
    }
    if (response.status === 429) {
      throw new ServiceError("AI_RATE_LIMIT", "请求频率过高，请稍后重试。", true);
    }
    if (response.status >= 500) {
      throw new ServiceError(
        "AI_SERVER_ERROR",
        `AI 服务暂时不可用（${response.status}）。`,
        true
      );
    }
    if (isLikelyInputTooLarge(response.status, errorDetail)) {
      const detail = errorDetail ? `详情：${errorDetail}` : "请减少样本或缩小作用域。";
      throw new ServiceError("AI_INPUT_TOO_LARGE", `输入样本过大，${detail}`, false);
    }
    if (!response.ok) {
      throw new ServiceError(
        "AI_HTTP_ERROR",
        buildHttpErrorMessage(response.status, errorDetail),
        response.status === 408
      );
    }

    const payload = (await response.json()) as ChatCompletionResponse;
    ensureResponseNotTruncated(payload);
    const content = extractMessageContent(payload);
    if (!content || !content.trim()) {
      throw new ServiceError(
        "AI_EMPTY_RESPONSE",
        "AI 返回为空内容（HTTP 成功但 message.content 为空），请检查模型兼容性或切换模型。",
        false
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(stripCodeBlock(content));
    } catch {
      throw new ServiceError(
        "AI_JSON_PARSE_ERROR",
        "AI 返回 JSON 解析失败，请检查模型输出格式是否符合 JSON 要求。",
        false
      );
    }

    try {
      return aiOutputSchema.parse(parsed);
    } catch {
      throw new ServiceError(
        "AI_SCHEMA_INVALID",
        "AI 返回数据结构不符合预期，请检查模型是否遵循约定 schema。",
        false
      );
    }
  } catch (error) {
    if (error instanceof ServiceError) {
      throw error;
    }
    if (error instanceof TypeError) {
      throw new ServiceError("AI_NETWORK_ERROR", "网络异常，无法访问 AI 服务。", true);
    }
    throw new ServiceError("AI_UNKNOWN_ERROR", "AI 调用失败。", true);
  }
}

/**
 * 第二阶段只复检分组命名与重复问题，不再回到书签粒度重分配。
 */
async function reviewGroupPlansWithAi(
  groups: GroupPlan[],
  bookmarkById: ReadonlyMap<string, BookmarkItem>,
  config: AppConfig
): Promise<GroupPlan[]> {
  if (groups.length <= 1) {
    return groups;
  }

  const reviewCandidates = buildGroupReviewCandidates(
    groups,
    bookmarkById,
    AI_REVIEW_SAMPLE_TITLE_LIMIT
  );
  const url = toChatCompletionsUrl(config.baseUrl);
  const body = buildGroupReviewCompletionBody(reviewCandidates, config.model);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`
      },
      body: JSON.stringify(body)
    });
    const errorDetail = response.ok ? "" : await readErrorDetail(response);

    if (response.status === 401) {
      throw new ServiceError("AI_AUTH_INVALID", "API Key 无效或已过期。");
    }
    if (response.status === 429) {
      throw new ServiceError("AI_RATE_LIMIT", "请求频率过高，请稍后重试。", true);
    }
    if (response.status >= 500) {
      throw new ServiceError(
        "AI_SERVER_ERROR",
        `AI 服务暂时不可用（${response.status}）。`,
        true
      );
    }
    if (isLikelyInputTooLarge(response.status, errorDetail)) {
      throw new ServiceError("AI_INPUT_TOO_LARGE", "分组复检请求过大，请缩小整理范围后重试。", false);
    }
    if (!response.ok) {
      throw new ServiceError(
        "AI_HTTP_ERROR",
        buildHttpErrorMessage(response.status, errorDetail),
        response.status === 408
      );
    }

    const payload = (await response.json()) as ChatCompletionResponse;
    ensureResponseNotTruncated(payload);
    const content = extractMessageContent(payload);
    if (!content || !content.trim()) {
      throw new ServiceError("AI_EMPTY_RESPONSE", "AI 分组复检返回为空。", false);
    }

    const parsed = aiGroupReviewOutputSchema.parse(JSON.parse(stripCodeBlock(content)));
    return applyReviewedGroups(groups, parsed.groups, bookmarkById);
  } catch (error) {
    const normalized = normalizeAiError(error);
    await traceReviewFallback(normalized.message);
    return groups;
  }
}

/**
 * 构造发往 AI 的完整请求体，便于调试打印与正式请求复用同一份结构。
 */
function buildChatCompletionBody(
  batch: BookmarkItem[],
  model: string
) {
  const promptPayload = buildPromptPayload(batch);

  return {
    model,
    temperature: 0.2,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "You are an information-architecture-driven bookmark classifier. You must first identify the semantic facets of bookmarks, then map them to the controlled taxonomy. The folder tree should be organized primarily by topic. Output must be valid JSON only, with no extra text."
      },
      {
        role: "user",
        content: JSON.stringify(promptPayload)
      }
    ]
  };
}

/**
 * 构造第二阶段“组名复检”请求体，只讨论组路径，不再发送 URL。
 */
function buildGroupReviewCompletionBody(
  groups: GroupReviewPromptGroup[],
  model: string
) {
  const promptPayload = buildGroupReviewPromptPayload(groups);

  return {
    model,
    temperature: 0.1,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "You are a taxonomy reviewer for bookmark groups. Review only group names and duplicate group structures. Do not reclassify individual bookmarks. Output valid JSON only."
      },
      {
        role: "user",
        content: JSON.stringify(promptPayload)
      }
    ]
  };
}

/**
 * 构造发给 AI 的紧凑提示词载荷，压缩重复路径并只保留分类所需字段。
 */
function buildPromptPayload(
  batch: BookmarkItem[]
): PromptPayload {
  const pathDict: string[] = [];
  const pathIndexMap = new Map<string, number>();

  return {
    task: "group_bookmarks",
    instruction: [
      "Task: output stable group paths organized by topic, not by site name or resource format.",
      "Make an internal semantic judgment first, then decide groupPath. Do not classify directly from the original folder names.",
      "Return only non-empty groups. Omit facets by default; include facets only for a few genuinely ambiguous items if absolutely necessary.",
      "groupPath must be a 1-3 level string array, for example [\"技术\", \"前端开发\", \"React\"].",
      `The top-level category must be chosen only from: ${TOP_LEVEL_GROUP_OPTIONS_TEXT}.`,
      "Second-level and third-level categories must come from the taxonomy whitelist. Do not invent new category names or switch to synonyms.",
      `Do not use any fallback or dirty category names such as: ${FORBIDDEN_GROUP_NAMES_TEXT}.`,
      "The folder tree should be organized by topic only. Do not mix resource type, source type, or access scope into the same hierarchy level as topic.",
      "Systematic learning resources such as courses, books, and bootcamps should prefer “学习”. Official docs, blog posts, community posts, and daily reference materials should prefer “技术”.",
      "Tool resources go to “工具”. Design assets go to “设计”. News and media go to “资讯”. Internal systems and business platforms go to “工作”.",
      "bookmarks[*].pathIndex refers to pathDict[pathIndex]. Use title, url, and path together when making decisions.",
      "url is only a compressed site summary without query or hash. Do not rely on tracking parameters.",
      "If a link is clearly localhost, file://, a private-network IP, or a test-environment domain, do not mix it into public topic groups. If you output facets, scope should be “本地”, “内网”, or “测试环境” accordingly.",
      "Use “其他主题” only when the topic is truly impossible to determine.",
      "You must use bookmarkIds from the input. Do not fabricate IDs.",
      "Do not output explanatory prose. Return JSON only.",
      AI_INCLUDE_FACETS
        ? "Output shape: { groups: [{ groupPath, bookmarkIds }], facets?: [{ id, primary_topic, resource_type, source_type, usage_intent, scope, confidence? }] }."
        : "Output shape: { groups: [{ groupPath, bookmarkIds }] }. Do not output facets by default."
    ],
    facetSchema: {
      primary_topic: "Content topic. It must be a short and clear Chinese phrase.",
      resource_type: FACET_OPTIONS.resourceTypes,
      source_type: FACET_OPTIONS.sourceTypes,
      usage_intent: FACET_OPTIONS.usageIntents,
      scope: FACET_OPTIONS.scopes
    },
    taxonomy: {
      topLevel: TOP_LEVEL_GROUPS,
      secondLevelByTop: SECOND_LEVEL_GROUP_OPTIONS,
      thirdLevelBySecond: THIRD_LEVEL_GROUP_OPTIONS,
      forbiddenGroupNames: FORBIDDEN_GROUP_NAMES
    },
    pathDict,
    bookmarks: batch.map((item) => toPromptBookmark(item, pathDict, pathIndexMap))
  };
}

/**
 * 第二阶段提示词只讨论分组命名是否重复、是否需要整组合并或重命名。
 */
function buildGroupReviewPromptPayload(groups: GroupReviewPromptGroup[]): GroupReviewPromptPayload {
  return {
    task: "review_group_names",
    instruction: [
      "Task: review group names and duplicate groups after the first-pass bookmark classification.",
      "This is a group-level review pass only. Do not reclassify individual bookmarks.",
      "Each input group has an id, a current groupPath, a bookmark count, and a few sample titles.",
      "You may keep a group as-is, rename its groupPath, or merge multiple input groups into one output group.",
      "If you merge groups, return one output item whose groupIds contains all merged input group ids.",
      "Never split one input group into multiple output groups.",
      "Do not use URLs, hostnames, or site-specific labels. Focus on taxonomy consistency and duplicate naming.",
      `The top-level category must stay within: ${TOP_LEVEL_GROUP_OPTIONS_TEXT}.`,
      "Second-level and third-level names must come from the taxonomy whitelist. Do not invent new names.",
      `Do not use fallback or dirty names such as: ${FORBIDDEN_GROUP_NAMES_TEXT}.`,
      "Use Chinese taxonomy names in groupPath.",
      "Return only non-empty groups and only valid input groupIds.",
      "Output shape: { groups: [{ groupPath, groupIds, reason? }] }."
    ],
    taxonomy: {
      topLevel: TOP_LEVEL_GROUPS,
      secondLevelByTop: SECOND_LEVEL_GROUP_OPTIONS,
      thirdLevelBySecond: THIRD_LEVEL_GROUP_OPTIONS,
      forbiddenGroupNames: FORBIDDEN_GROUP_NAMES
    },
    groups
  };
}

/**
 * 调试模式下打印整批完整请求体，便于核对重复标签与真实 payload。
 */
async function traceDebugRequest(bookmarks: BookmarkItem[], config: AppConfig): Promise<void> {
  const body = buildChatCompletionBody(bookmarks, config.model);
  const payloadBytes = encodeUtf8ByteLength(JSON.stringify(body));

  console.log(JSON.stringify(body, null, 2));

  try {
    await appendErrorLog({
      command: "organize.preview.generate",
      errorCode: "AI_DEBUG_PRINT_ONLY",
      message: `print-only mode, count=${bookmarks.length}, payloadBytes=${payloadBytes}`,
      context: {
        bookmarkCount: bookmarks.length,
        payloadBytes
      }
    });
  } catch {
    // 调试日志写入失败不影响预览生成
  }
}

/**
 * 调试模式不调用 AI，直接按本地稳定规则生成预览，保证后续校验可继续通过。
 */
function buildDebugGroupPlans(bookmarks: BookmarkItem[]): GroupPlan[] {
  const grouped: GroupBucketMap = new Map();

  for (const bookmark of bookmarks) {
    const groupPath = inferGroupPathFromBookmark(bookmark);
    const key = encodeGroupPath(groupPath);
    const bucket = grouped.get(key) ?? {
      groupPath,
      bookmarkIds: [],
      reason: "调试模式：未调用 AI，已按本地规则分组"
    };
    bucket.bookmarkIds.push(bookmark.id);
    grouped.set(key, bucket);
  }

  return finalizeGroupPlans(grouped);
}

/**
 * 把书签压缩为更短的提示词结构，减少上下文占用。
 */
function toPromptBookmark(
  item: BookmarkItem,
  pathDict: string[],
  pathIndexMap: Map<string, number>
): PromptBookmark {
  return {
    id: item.id,
    title: truncatePromptText(item.title || "(无标题)", 72),
    url: normalizeUrlForPrompt(item.url),
    pathIndex: internPromptPath(item.path, pathDict, pathIndexMap)
  };
}

/**
 * 把重复出现的路径文本提升到字典中，降低请求体体积。
 */
function internPromptPath(
  path: string[],
  pathDict: string[],
  pathIndexMap: Map<string, number>
): number {
  const normalizedPath = formatPathForPrompt(path);
  const existed = pathIndexMap.get(normalizedPath);
  if (existed !== undefined) {
    return existed;
  }

  const nextIndex = pathDict.length;
  pathDict.push(normalizedPath);
  pathIndexMap.set(normalizedPath, nextIndex);
  return nextIndex;
}

/**
 * 计算 UTF-8 字节长度。
 */
function encodeUtf8ByteLength(input: string): number {
  return new TextEncoder().encode(input).length;
}

/**
 * 通用文本限长：用于日志、错误详情等非提示词正文场景。
 */
function truncateText(input: string, maxLength: number): string {
  const text = input.trim();
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, Math.max(0, maxLength - 3))}...`;
}

/**
 * 读取 AI 服务端错误详情，供大样本判断和诊断使用。
 */
async function readErrorDetail(response: Response): Promise<string> {
  try {
    const raw = (await response.text()).trim();
    if (!raw) {
      return "";
    }
    try {
      const parsed = JSON.parse(raw) as unknown;
      const extracted = extractErrorMessage(parsed);
      return truncateText(extracted || raw, 240);
    } catch {
      return truncateText(raw, 240);
    }
  } catch {
    return "";
  }
}

/**
 * 从常见 OpenAI-compatible 错误对象提取 message。
 */
function extractErrorMessage(input: unknown): string {
  if (!input) {
    return "";
  }
  if (typeof input === "string") {
    return input;
  }
  if (typeof input !== "object") {
    return "";
  }

  const record = input as Record<string, unknown>;
  if (typeof record.message === "string") {
    return record.message;
  }
  if (typeof record.detail === "string") {
    return record.detail;
  }
  if (typeof record.error_description === "string") {
    return record.error_description;
  }
  if (record.error) {
    return extractErrorMessage(record.error);
  }
  return "";
}

/**
 * 识别“输入过大”类错误（413 或上下文超限提示）。
 */
function isLikelyInputTooLarge(status: number, detail: string): boolean {
  if (status === 413) {
    return true;
  }
  if (status !== 400 && status !== 422) {
    return false;
  }
  const normalized = detail.toLowerCase();
  const keywords = [
    "context length",
    "maximum context",
    "context window",
    "prompt is too long",
    "token limit",
    "too many tokens",
    "request too large",
    "input is too long",
    "max context"
  ];
  const cnKeywords = ["上下文", "过长", "超限", "请求体过大", "token 超"];
  return (
    keywords.some((keyword) => normalized.includes(keyword)) ||
    cnKeywords.some((keyword) => detail.includes(keyword))
  );
}

/**
 * 标准化 HTTP 错误消息并附带服务端详情。
 */
function buildHttpErrorMessage(status: number, detail: string): string {
  if (!detail) {
    return `AI 请求失败（${status}）。`;
  }
  return `AI 请求失败（${status}）：${detail}`;
}

/**
 * 兼容不同 OpenAI-compatible 返回格式，提取 message.content 文本。
 */
function extractMessageContent(payload: ChatCompletionResponse): string {
  const rawContent = payload.choices?.[0]?.message?.content;
  if (typeof rawContent === "string") {
    return rawContent;
  }
  if (Array.isArray(rawContent)) {
    return rawContent
      .map((part) => {
        if (typeof part === "string") {
          return part;
        }
        if (!part || typeof part !== "object") {
          return "";
        }
        if ("text" in part && typeof part.text === "string") {
          return part.text;
        }
        if ("content" in part && typeof part.content === "string") {
          return part.content;
        }
        return "";
      })
      .join("")
      .trim();
  }
  if (rawContent && typeof rawContent === "object") {
    if ("text" in rawContent && typeof rawContent.text === "string") {
      return rawContent.text;
    }
    if ("content" in rawContent && typeof rawContent.content === "string") {
      return rawContent.content;
    }
  }
  return "";
}

/**
 * 一旦模型返回被截断，直接触发重试或自动降载，避免吃半截 JSON。
 */
function ensureResponseNotTruncated(payload: ChatCompletionResponse): void {
  const finishReason = payload.choices?.[0]?.finish_reason;
  if (finishReason !== "length") {
    return;
  }

  throw new ServiceError(
    "AI_RESPONSE_TRUNCATED",
    "AI 返回被截断（finish_reason=length），将缩小批次后重试。",
    true
  );
}

/**
 * 将第二阶段组名复检结果映射回真实书签分组；若部分组未被引用，则保留原分组。
 */
function applyReviewedGroups(
  originalGroups: GroupPlan[],
  reviewedGroups: Array<{ groupPath: string[]; groupIds: string[]; reason?: string }>,
  bookmarkById: ReadonlyMap<string, BookmarkItem>
): GroupPlan[] {
  const grouped: GroupBucketMap = new Map();
  const groupById = new Map<string, GroupPlan>(
    originalGroups.map((group, index) => [`g${index + 1}`, group])
  );
  const assignedGroupIds = new Set<string>();

  for (const reviewedGroup of reviewedGroups) {
    const sourceGroups = reviewedGroup.groupIds
      .map((groupId) => groupById.get(groupId))
      .filter((group): group is GroupPlan => Boolean(group));
    if (sourceGroups.length === 0) {
      continue;
    }

    const sampleBookmarkId = sourceGroups.flatMap((group) => group.bookmarkIds)[0];
    const sampleBookmark = sampleBookmarkId ? bookmarkById.get(sampleBookmarkId) : undefined;
    const normalizedGroupPath = normalizeGroupPath(reviewedGroup.groupPath, sampleBookmark);
    const key = encodeGroupPath(normalizedGroupPath);
    const bucket = grouped.get(key) ?? {
      groupPath: normalizedGroupPath,
      bookmarkIds: [],
      reason: reviewedGroup.reason
    };

    for (const groupId of reviewedGroup.groupIds) {
      const sourceGroup = groupById.get(groupId);
      if (!sourceGroup || assignedGroupIds.has(groupId)) {
        continue;
      }
      bucket.bookmarkIds.push(...sourceGroup.bookmarkIds);
      bucket.reason ??= reviewedGroup.reason ?? sourceGroup.reason;
      assignedGroupIds.add(groupId);
    }

    grouped.set(key, bucket);
  }

  for (let index = 0; index < originalGroups.length; index += 1) {
    const groupId = `g${index + 1}`;
    if (assignedGroupIds.has(groupId)) {
      continue;
    }

    const group = originalGroups[index];
    const key = encodeGroupPath(group.groupPath);
    const bucket = grouped.get(key) ?? {
      groupPath: [...group.groupPath],
      bookmarkIds: [],
      reason: group.reason
    };
    bucket.bookmarkIds.push(...group.bookmarkIds);
    bucket.reason ??= group.reason;
    grouped.set(key, bucket);
  }

  return finalizeGroupPlans(grouped);
}

/**
 * 合并单批次结果，并将未分配书签按站点信息自动归类。
 */
function mergeBatchResult(
  target: GroupBucketMap,
  batch: BookmarkItem[],
  groups: GroupPlan[]
): void {
  const bookmarkById = new Map(batch.map((item) => [item.id, item] as const));
  const validIds = new Set(batch.map((item) => item.id));
  const assigned = new Set<string>();

  for (const group of groups) {
    const acceptedIds = group.bookmarkIds.filter((id) => validIds.has(id) && !assigned.has(id));
    if (acceptedIds.length === 0) {
      continue;
    }
    const sampleBookmark = bookmarkById.get(acceptedIds[0]);
    const normalizedGroupPath = normalizeGroupPath(group.groupPath, sampleBookmark);

    const key = encodeGroupPath(normalizedGroupPath);
    const bucket = target.get(key) ?? {
      groupPath: normalizedGroupPath,
      bookmarkIds: [],
      reason: group.reason
    };
    bucket.bookmarkIds.push(...acceptedIds);
    if (!bucket.reason && group.reason) {
      bucket.reason = group.reason;
    }
    target.set(key, bucket);
    acceptedIds.forEach((id) => assigned.add(id));
  }

  const unassigned = batch.map((item) => item.id).filter((id) => !assigned.has(id));
  if (unassigned.length > 0) {
    for (const bookmarkId of unassigned) {
      const sampleBookmark = bookmarkById.get(bookmarkId);
      const fallbackPath = inferGroupPathFromBookmark(sampleBookmark);
      const fallbackKey = encodeGroupPath(fallbackPath);
      const fallback = target.get(fallbackKey) ?? {
        groupPath: fallbackPath,
        bookmarkIds: []
      };
      fallback.bookmarkIds.push(bookmarkId);
      fallback.reason ??= "AI 未返回分组，已按站点信息自动归类";
      target.set(fallbackKey, fallback);
    }
  }
}

/**
 * 归一化分组路径，限制最多 3 级。
 */
function normalizeGroupPath(path: string[], sampleBookmark?: BookmarkItem): string[] {
  const normalized = path
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);

  if (normalized.length === 0) {
    return inferGroupPathFromBookmark(sampleBookmark);
  }
  if (isForbiddenGroupName(normalized[0])) {
    return inferGroupPathFromBookmark(sampleBookmark);
  }

  const sanitized = normalized.map((segment, index) =>
    index === 0
      ? segment
      : isForbiddenGroupName(segment)
        ? FALLBACK_CHILD_NAME
        : segment
  );
  return normalizeGroupPathWithTaxonomy(sanitized, sampleBookmark);
}

/**
 * 禁用“未分类/未分组”等兜底命名。
 */
function isForbiddenGroupName(name: string): boolean {
  const normalized = name.trim();
  if (!normalized) {
    return true;
  }
  return FORBIDDEN_GROUP_NAME_PATTERNS.some((pattern) => pattern.test(normalized));
}

/**
 * 整理合并后的分组计划，并收敛一级分类数量。
 */
function finalizeGroupPlans(grouped: GroupBucketMap): GroupPlan[] {
  const plans: GroupPlan[] = [...grouped.values()]
    .map((data) => ({
      groupPath: data.groupPath,
      bookmarkIds: data.bookmarkIds,
      reason: data.reason
    }))
    .filter((group) => group.bookmarkIds.length > 0);

  const compacted = compactTopLevelGroups(plans, MAX_TOP_LEVEL_GROUPS);
  return compacted.sort((a, b) =>
    a.groupPath.join(" / ").localeCompare(b.groupPath.join(" / "), "zh-CN")
  );
}

/**
 * 收敛一级分类，确保不超过上限。
 */
function compactTopLevelGroups(groups: GroupPlan[], maxTopLevel: number): GroupPlan[] {
  const topLevelCount = new Map<string, number>();
  for (const group of groups) {
    const top = group.groupPath[0];
    topLevelCount.set(top, (topLevelCount.get(top) ?? 0) + group.bookmarkIds.length);
  }

  if (topLevelCount.size <= maxTopLevel) {
    return groups;
  }

  const keepTopCount = Math.max(1, maxTopLevel - 1);
  const keepTops = new Set(
    [...topLevelCount.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "zh-CN"))
      .slice(0, keepTopCount)
      .map(([name]) => name)
  );

  const merged = new Map<string, GroupPlan>();
  for (const group of groups) {
    const top = group.groupPath[0];
    const nextPath = keepTops.has(top)
      ? group.groupPath
      : normalizeGroupPath([FALLBACK_TOP_LEVEL_NAME, top, ...group.groupPath.slice(1)]);
    const key = encodeGroupPath(nextPath);
    const existed = merged.get(key) ?? { groupPath: nextPath, bookmarkIds: [] };
    existed.bookmarkIds.push(...group.bookmarkIds);
    existed.reason = existed.reason ?? group.reason;
    merged.set(key, existed);
  }

  return [...merged.values()];
}

/**
 * 将路径编码为 map key。
 */
function encodeGroupPath(path: string[]): string {
  return path.join("\u0000");
}

/**
 * 归一化 AI 异常对象。
 */
function normalizeAiError(error: unknown): ServiceError {
  if (error instanceof ServiceError) {
    return error;
  }
  if (error instanceof Error) {
    return new ServiceError("AI_UNKNOWN_ERROR", error.message, true);
  }
  return new ServiceError("AI_UNKNOWN_ERROR", "AI 调用失败。", true);
}

/**
 * 判断错误是否可以触发自动拆分降载。
 */
function shouldAutoSplit(error: ServiceError, batchSize: number): boolean {
  return (
    (error.code === "AI_INPUT_TOO_LARGE" || error.code === "AI_RESPONSE_TRUNCATED") &&
    batchSize > 1
  );
}

/**
 * 将批次对半拆分，优先保证左侧不少于右侧。
 */
function splitBatchInHalf(batch: BookmarkItem[]): [BookmarkItem[], BookmarkItem[]] {
  const pivot = Math.ceil(batch.length / 2);
  return [batch.slice(0, pivot), batch.slice(pivot)];
}

/**
 * 记录自动拆分事件，便于定位“大样本”触发点。
 */
async function traceAutoSplit(input: {
  splitDepth: number;
  batchSize: number;
  leftSize: number;
  rightSize: number;
  reason: string;
}): Promise<void> {
  console.info(
    `[AI] auto-split depth=${input.splitDepth} size=${input.batchSize} -> ${input.leftSize}+${input.rightSize}`
  );
  try {
    await appendErrorLog({
      command: "organize.preview.generate",
      errorCode: "AI_TRACE_AUTO_SPLIT",
      message: `auto-split depth=${input.splitDepth}, size=${input.batchSize}, reason=${truncateText(input.reason, 180)}`,
      context: {
        leftSize: input.leftSize,
        rightSize: input.rightSize
      }
    });
  } catch {
    // 日志写入失败不影响主流程
  }
}

/**
 * 记录 AI 重试决策，便于排查“重复请求”是否来自重试机制。
 */
async function traceRetryDecision(input: {
  batchNo: number;
  batchTotal: number;
  attempt: number;
  retryable: boolean;
  shouldRetry: boolean;
  code: string;
  message: string;
}): Promise<void> {
  console.info(
    `[AI] batch ${input.batchNo}/${input.batchTotal} attempt ${input.attempt}: ${input.code} retryable=${input.retryable} shouldRetry=${input.shouldRetry}`
  );
  try {
    await appendErrorLog({
      command: "organize.preview.generate",
      errorCode: `AI_TRACE_${input.code}`,
      message: `[batch ${input.batchNo}/${input.batchTotal}][attempt ${input.attempt}] ${input.message}`,
      context: {
        retryable: input.retryable,
        shouldRetry: input.shouldRetry
      }
    });
  } catch {
    // 日志写入失败不影响主流程
  }
}

/**
 * 第二阶段复检失败时记录日志，并回退到第一阶段结果。
 */
async function traceReviewFallback(message: string): Promise<void> {
  console.info(`[AI] review-pass fallback: ${message}`);
  try {
    await appendErrorLog({
      command: "organize.preview.generate",
      errorCode: "AI_TRACE_REVIEW_FALLBACK",
      message: truncateText(message, 180)
    });
  } catch {
    // 日志写入失败不影响主流程
  }
}

/**
 * 将 Base URL 转换为 chat completions 完整地址。
 */
function toChatCompletionsUrl(baseUrl: string): string {
  const normalized = baseUrl.trim().replace(/\/+$/, "");
  if (normalized.endsWith("/chat/completions")) {
    return normalized;
  }
  return `${normalized}/chat/completions`;
}

/**
 * 去除模型偶发返回的 markdown 代码块包装。
 */
function stripCodeBlock(content: string): string {
  const trimmed = content.trim();
  if (!trimmed.startsWith("```")) {
    return trimmed;
  }
  return trimmed.replace(/^```[a-zA-Z]*\n?/, "").replace(/\n?```$/, "").trim();
}

/**
 * 异步等待，配合重试退避。
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * 校验 AI 配置字段完整性。
 */
function validateConfig(config: AppConfig): void {
  if (!config.apiKey.trim()) {
    throw new ServiceError("AI_CONFIG_MISSING", "API Key 不能为空。");
  }
  if (!config.baseUrl.trim()) {
    throw new ServiceError("AI_CONFIG_MISSING", "Base URL 不能为空。");
  }
  if (!config.model.trim()) {
    throw new ServiceError("AI_CONFIG_MISSING", "Model 不能为空。");
  }
}
