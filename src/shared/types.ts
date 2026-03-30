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

export type OrganizePreview = {
  generatedAt: number;
  totalCount: number;
  uniqueCount: number;
  duplicateCount: number;
  estimatedMoveCount: number;
  groups: GroupPlan[];
  duplicateIds: string[];
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
