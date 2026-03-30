import {
  COMMANDS,
  fail,
  ok,
  type CommandName,
  type RequestMap,
  type ResponseMap,
  type RuntimeRequest,
  type RuntimeResponse
} from "@/shared/message-contract";
import { appendErrorLog } from "./utils/logger";
import { ServiceError } from "./utils/service-error";
import {
  applyOrganizePreview,
  deleteBookmark,
  queryBookmarkFolders,
  queryBookmarks,
  updateBookmark
} from "./services/bookmark-service";
import { getConfig, setConfig } from "./services/config-service";
import { generatePreview, regeneratePreviewByFolder } from "./services/classification-service";
import { rollbackFromBackup } from "./services/backup-service";

type Handler<C extends CommandName> = (
  payload: RequestMap[C]
) => Promise<ResponseMap[C]>;

type HandlerMap = {
  [K in CommandName]: Handler<K>;
};

const handlers: HandlerMap = {
  [COMMANDS.CONFIG_GET]: async () => ({ config: await getConfig() }),
  [COMMANDS.CONFIG_SET]: async ({ config }) => {
    await setConfig(config);
    return { success: true };
  },
  [COMMANDS.BOOKMARKS_QUERY]: async (payload) => ({
    items: await queryBookmarks(payload)
  }),
  [COMMANDS.BOOKMARKS_FOLDERS]: async () => ({
    folders: await queryBookmarkFolders()
  }),
  [COMMANDS.ORGANIZE_PREVIEW_GENERATE]: async () => ({
    preview: await generatePreview()
  }),
  [COMMANDS.ORGANIZE_PREVIEW_REGENERATE_BY_FOLDER]: async ({ folderId }) => ({
    preview: await regeneratePreviewByFolder(folderId)
  }),
  [COMMANDS.ORGANIZE_APPLY]: async ({ preview }) => applyOrganizePreview(preview),
  [COMMANDS.ORGANIZE_ROLLBACK]: async ({ backupId }) => rollbackFromBackup(backupId),
  [COMMANDS.BOOKMARK_UPDATE]: async ({ id, title, url }) => {
    await updateBookmark({ id, title, url });
    return { success: true };
  },
  [COMMANDS.BOOKMARK_DELETE]: async ({ id }) => {
    await deleteBookmark(id);
    return { success: true };
  }
};

/**
 * 路由并执行消息命令，统一返回 ApiResult。
 */
export async function dispatchMessage(
  request: RuntimeRequest
): Promise<RuntimeResponse> {
  const handler = handlers[request.command];
  if (!handler) {
    return fail("UNKNOWN_COMMAND", `未知命令: ${request.command}`);
  }

  try {
    const data = await handler(request.payload as never);
    return ok(data);
  } catch (error) {
    const normalized = normalizeError(error);
    await appendErrorLog({
      command: request.command,
      errorCode: normalized.code,
      message: normalized.message,
      stack: normalized.stack,
      context: { payload: request.payload as Record<string, unknown> }
    });
    return fail(normalized.code, normalized.message, normalized.retryable);
  }
}

/**
 * 归一化不同来源的异常，输出统一错误结构。
 */
function normalizeError(error: unknown): {
  code: string;
  message: string;
  retryable: boolean;
  stack?: string;
} {
  if (error instanceof ServiceError) {
    return {
      code: error.code,
      message: error.message,
      retryable: error.retryable,
      stack: error.stack
    };
  }
  if (error instanceof Error) {
    return {
      code: "UNEXPECTED_ERROR",
      message: error.message,
      retryable: false,
      stack: error.stack
    };
  }
  return {
    code: "UNEXPECTED_ERROR",
    message: "发生未知错误。",
    retryable: false
  };
}
