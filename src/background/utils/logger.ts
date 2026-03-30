import type { ErrorLog } from "@/shared/types";

const ERROR_LOG_KEY = "app:errorLogs";
const MAX_ERROR_LOGS = 500;

/**
 * 追加错误日志并裁剪上限，避免本地存储无限增长。
 */
export async function appendErrorLog(
  log: Omit<ErrorLog, "time">
): Promise<void> {
  const current = await readErrorLogs();
  const next: ErrorLog[] = [{ ...log, time: Date.now() }, ...current].slice(0, MAX_ERROR_LOGS);
  await chrome.storage.local.set({ [ERROR_LOG_KEY]: next });
}

/**
 * 读取本地错误日志列表。
 */
export async function readErrorLogs(): Promise<ErrorLog[]> {
  const result = await chrome.storage.local.get(ERROR_LOG_KEY);
  return (result[ERROR_LOG_KEY] as ErrorLog[] | undefined) ?? [];
}
