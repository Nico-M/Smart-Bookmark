import { aiOutputSchema } from "@/shared/schemas";
import {
  FALLBACK_CHILD_NAME,
  FALLBACK_TOP_LEVEL_NAME,
  MAX_TOP_LEVEL_GROUPS,
  TOP_LEVEL_GROUPS,
  inferGroupPathFromBookmark,
  normalizeGroupPathWithTaxonomy
} from "@/shared/grouping-rules";
import type { AppConfig, BookmarkItem, GroupPlan } from "@/shared/types";
import { ServiceError } from "../utils/service-error";
import { appendErrorLog } from "../utils/logger";

const AI_RETRY_COUNT = 2;
const MAX_AUTO_SPLIT_DEPTH = 12;
const AI_BATCH_MAX_ITEMS = 120;
const AI_BATCH_MAX_PAYLOAD_BYTES = 48 * 1024;
const AI_DEBUG_PRINT_ONLY = false;
const AI_DISABLE_CHUNKING = true;
const FORBIDDEN_GROUP_NAME_PATTERNS = [
  /未分类/,
  /未分组/,
  /待分类/,
  /^uncategorized$/i,
  /^unclassified$/i,
  /^ungrouped$/i,
  /^unknown$/i,
  /^n\/a$/i,
  /^none$/i
];
const NON_RETRYABLE_AI_ERROR_CODES = new Set<string>([
  "AI_AUTH_INVALID",
  "AI_EMPTY_RESPONSE",
  "AI_JSON_PARSE_ERROR",
  "AI_SCHEMA_INVALID",
  "AI_CONFIG_MISSING",
  "AI_INPUT_TOO_LARGE"
]);
const TOP_LEVEL_GROUP_OPTIONS_TEXT = TOP_LEVEL_GROUPS.join("、");

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
  topLevelOptions: typeof TOP_LEVEL_GROUPS;
  batchNo: number;
  batchTotal: number;
  pathDict: string[];
  bookmarks: PromptBookmark[];
};

type ChatCompletionResponse = {
  choices?: Array<{
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

  const grouped: GroupBucketMap = new Map();
  const batches = AI_DISABLE_CHUNKING ? [bookmarks] : splitBatchesForAi(bookmarks);
  const total = batches.length;
  for (let index = 0; index < total; index += 1) {
    const batchNo = index + 1;
    await classifyAndMergeWithAutoSplit({
      batch: batches[index],
      config,
      grouped,
      batchNo,
      batchTotal: total,
      splitDepth: 0
    });
  }

  return finalizeGroupPlans(grouped);
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
 * 常态分批：同时限制条数与估算 payload 体积，避免单次样本过大。
 */
function splitBatchesForAi(bookmarks: BookmarkItem[]): BookmarkItem[][] {
  const batches: BookmarkItem[][] = [];
  let current: BookmarkItem[] = [];

  for (const item of bookmarks) {
    // 按整批压缩后的真实载荷预估大小，避免路径字典等共享结构被低估。
    const trialBatch = [...current, item];
    const trialPayload = buildPromptPayload(trialBatch, 1, 1);
    const trialBytes = estimatePromptPayloadBytes(trialPayload);
    const exceedCount = current.length >= AI_BATCH_MAX_ITEMS;
    const exceedBytes = current.length > 0 && trialBytes > AI_BATCH_MAX_PAYLOAD_BYTES;

    if (exceedCount || exceedBytes) {
      batches.push(current);
      current = [];
    }

    current.push(item);
  }

  if (current.length > 0) {
    batches.push(current);
  }

  return batches.length > 0 ? batches : [bookmarks];
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
      return await classifyBatchOnce(batch, config, batchNo, batchTotal);
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
  config: AppConfig,
  batchNo: number,
  batchTotal: number
) {
  const url = toChatCompletionsUrl(config.baseUrl);
  const body = buildChatCompletionBody(batch, config.model, batchNo, batchTotal);

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
 * 构造发往 AI 的完整请求体，便于调试打印与正式请求复用同一份结构。
 */
function buildChatCompletionBody(
  batch: BookmarkItem[],
  model: string,
  batchNo: number,
  batchTotal: number
) {
  const promptPayload = buildPromptPayload(batch, batchNo, batchTotal);

  return {
    model,
    temperature: 0.2,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "你是书签整理助手。请把输入书签按主题分组，并给出简洁中文分组名。必须基于站点信息完成分类，禁止输出未分类。输出必须是 JSON，不允许额外文本。"
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
  batch: BookmarkItem[],
  batchNo: number,
  batchTotal: number
): PromptPayload {
  const pathDict: string[] = [];
  const pathIndexMap = new Map<string, number>();

  return {
    task: "group_bookmarks",
    instruction: [
      "将每条书签分配到一个分组路径。",
      "groupPath 为 1~3 级的字符串数组，例如 [\"技术\", \"前端\", \"React\"]。",
      `一级分类必须且只能从以下集合中选择：${TOP_LEVEL_GROUP_OPTIONS_TEXT}。`,
      "每一级名称不超过12个中文字符。",
      "禁止使用“未分类/未分组/uncategorized/ungrouped”等兜底名称。",
      "“其他主题”只能在完全无法判断主题时使用；只要能根据标题、URL 或路径判断，就不要使用“其他主题”。",
      "一级分类必须按主题归类，不要按站点形态、内容载体或工具形态命名。",
      "bookmarks[*].pathIndex 对应 pathDict 中同下标的路径文本，请结合 title、url、pathDict[pathIndex] 一起判断。",
      "URL 已去掉 query 和 hash，只保留 host 与 pathname；请不要依赖追踪参数做分类。",
      "技术相关内容统一放入“技术”，禁止输出“技术开发/技术社区/技术资源/前端开发/前端框架/核心技术/开发工具/资源导航”等作为一级分类。",
      "AI 相关内容统一放入“AI”，禁止输出“AI与Python/AI 与 数字化/AI工具”等作为一级分类。",
      "工具相关内容统一放入“工具”，禁止输出“个人工具/网络工具/效率工具”等作为一级分类。",
      "影音相关内容统一放入“影音”，禁止输出“影视娱乐”作为一级分类。",
      "公司内部系统、业务平台统一放入“工作”，禁止输出“公司业务”作为一级分类。",
      "工具类资源统一放入“工具”；设计素材统一放入“设计”；课程文档统一放入“学习”；资讯媒体统一放入“资讯”。",
      "二级分类再做细分，例如 [\"技术\", \"前端开发\"]、[\"技术\", \"社区博客\"]、[\"AI\", \"编程与平台\"]、[\"AI\", \"创作与提示词\"]。",
      "必须根据 title、url、pathDict[pathIndex] 进行判定，不允许空分组。",
      "一级分类数量尽量收敛，最多 10 个。",
      "语义相近的分组必须使用同一个名称，不能在不同批次里换同义词。",
      "必须使用输入中的 bookmarkIds，不能杜撰 ID。",
      "不要输出 reason 或任何解释文本，只返回分组结果。",
      "输出结构: { groups: [{ groupPath, bookmarkIds }] }。"
    ],
    topLevelOptions: TOP_LEVEL_GROUPS,
    batchNo,
    batchTotal,
    pathDict,
    bookmarks: batch.map((item) => toPromptBookmark(item, pathDict, pathIndexMap))
  };
}

/**
 * 调试模式下打印整批完整请求体，便于核对重复标签与真实 payload。
 */
async function traceDebugRequest(bookmarks: BookmarkItem[], config: AppConfig): Promise<void> {
  const body = buildChatCompletionBody(bookmarks, config.model, 1, 1);
  const payloadBytes = encodeUtf8ByteLength(JSON.stringify(body));

  console.info(`[AI][debug] print-only mode enabled, size=${payloadBytes} bytes, count=${bookmarks.length}`);
  console.log("[AI][debug] request body JSON:\n%s", JSON.stringify(body, null, 2));

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
    title: truncateText(item.title || "(无标题)", 96),
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
 * 估算压缩后提示词载荷字节数，用于分批前预估请求体积。
 */
function estimatePromptPayloadBytes(payload: PromptPayload): number {
  return encodeUtf8ByteLength(JSON.stringify(payload));
}

/**
 * 计算 UTF-8 字节长度。
 */
function encodeUtf8ByteLength(input: string): number {
  return new TextEncoder().encode(input).length;
}

/**
 * 规范化 URL 用于提示词：去协议、去 query/hash、限长。
 */
function normalizeUrlForPrompt(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  try {
    const url = new URL(trimmed);
    const normalized = `${url.host}${url.pathname}`;
    return truncateText(normalized, 220);
  } catch {
    const normalized = trimmed.split(/[?#]/, 1)[0] || trimmed;
    return truncateText(normalized, 220);
  }
}

/**
 * 路径仅保留最后 3 级并限制总长度。
 */
function formatPathForPrompt(path: string[]): string {
  const compact = path
    .slice(-3)
    .map((segment) => truncateText(segment.trim(), 20))
    .filter((segment) => segment.length > 0)
    .join(" / ");
  return truncateText(compact, 120);
}

/**
 * 文本限长，避免单条样本过长拖垮上下文。
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
  if (AI_DISABLE_CHUNKING) {
    return false;
  }
  return error.code === "AI_INPUT_TOO_LARGE" && batchSize > 1;
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
