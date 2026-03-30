export type AppConfig = {
  apiKey: string;
  baseUrl: string;
  model: string;
};

export type BookmarkItem = {
  id: string;
  title: string;
  url: string;
  parentId: string;
  path: string[];
};

export type BookmarkFolder = {
  id: string;
  title: string;
  path: string[];
};

export type GroupPlan = {
  groupPath: string[];
  bookmarkIds: string[];
  reason?: string;
};

export type ExcludeReason = "本地文件" | "本地服务" | "内网地址" | "测试环境";

export type ExcludedBookmark = {
  id: string;
  title: string;
  url: string;
  reason: ExcludeReason;
  suggestedGroupPath: string[];
};

export type OrganizePreview = {
  generatedAt: number;
  totalCount: number;
  uniqueCount: number;
  duplicateCount: number;
  excludedCount: number;
  estimatedMoveCount: number;
  groups: GroupPlan[];
  duplicateIds: string[];
  excludedItems: ExcludedBookmark[];
  source: "ai";
};

export type OrganizeApplyResult = {
  backupId: string | null;
  movedCount: number;
  deletedDuplicateCount: number;
  applied: boolean;
  note?: string;
};

export type RollbackResult = {
  rolledBack: boolean;
  backupId: string | null;
  note?: string;
};

export type ErrorLog = {
  time: number;
  command: string;
  errorCode: string;
  message: string;
  stack?: string;
  context?: Record<string, unknown>;
};
