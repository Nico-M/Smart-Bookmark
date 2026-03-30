import type {
  AppConfig,
  BookmarkFolder,
  BookmarkItem,
  OrganizeApplyResult,
  OrganizePreview,
  RollbackResult
} from "./types";

export const COMMANDS = {
  CONFIG_GET: "config.get",
  CONFIG_SET: "config.set",
  BOOKMARKS_QUERY: "bookmarks.query",
  BOOKMARKS_FOLDERS: "bookmarks.folders",
  ORGANIZE_PREVIEW_GENERATE: "organize.preview.generate",
  ORGANIZE_PREVIEW_REGENERATE_BY_FOLDER: "organize.preview.regenerateByFolder",
  ORGANIZE_APPLY: "organize.apply",
  ORGANIZE_ROLLBACK: "organize.rollback",
  BOOKMARK_UPDATE: "bookmark.update",
  BOOKMARK_DELETE: "bookmark.delete"
} as const;

export type CommandName = (typeof COMMANDS)[keyof typeof COMMANDS];

export type RequestMap = {
  [COMMANDS.CONFIG_GET]: Record<string, never>;
  [COMMANDS.CONFIG_SET]: { config: AppConfig };
  [COMMANDS.BOOKMARKS_QUERY]: { keyword?: string; folderId?: string };
  [COMMANDS.BOOKMARKS_FOLDERS]: Record<string, never>;
  [COMMANDS.ORGANIZE_PREVIEW_GENERATE]: Record<string, never>;
  [COMMANDS.ORGANIZE_PREVIEW_REGENERATE_BY_FOLDER]: { folderId: string };
  [COMMANDS.ORGANIZE_APPLY]: { preview: OrganizePreview };
  [COMMANDS.ORGANIZE_ROLLBACK]: { backupId?: string };
  [COMMANDS.BOOKMARK_UPDATE]: { id: string; title?: string; url?: string };
  [COMMANDS.BOOKMARK_DELETE]: { id: string };
};

export type ResponseMap = {
  [COMMANDS.CONFIG_GET]: { config: AppConfig | null };
  [COMMANDS.CONFIG_SET]: { success: true };
  [COMMANDS.BOOKMARKS_QUERY]: { items: BookmarkItem[] };
  [COMMANDS.BOOKMARKS_FOLDERS]: { folders: BookmarkFolder[] };
  [COMMANDS.ORGANIZE_PREVIEW_GENERATE]: { preview: OrganizePreview };
  [COMMANDS.ORGANIZE_PREVIEW_REGENERATE_BY_FOLDER]: { preview: OrganizePreview };
  [COMMANDS.ORGANIZE_APPLY]: OrganizeApplyResult;
  [COMMANDS.ORGANIZE_ROLLBACK]: RollbackResult;
  [COMMANDS.BOOKMARK_UPDATE]: { success: true };
  [COMMANDS.BOOKMARK_DELETE]: { success: true };
};

export type ApiError = {
  code: string;
  message: string;
  retryable: boolean;
};

export type ApiResult<T> = {
  ok: boolean;
  data?: T;
  error?: ApiError;
};

export type RuntimeRequest<C extends CommandName = CommandName> = {
  command: C;
  payload: RequestMap[C];
};

export type RuntimeResponse<C extends CommandName = CommandName> = ApiResult<
  ResponseMap[C]
>;

/**
 * 构造成功响应，统一消息返回结构。
 */
export function ok<T>(data: T): ApiResult<T> {
  return { ok: true, data };
}

/**
 * 构造失败响应，统一错误结构。
 */
export function fail(code: string, message: string, retryable = false): ApiResult<never> {
  return {
    ok: false,
    error: { code, message, retryable }
  };
}
