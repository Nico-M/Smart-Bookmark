import type { AppConfig } from "@/shared/types";

const CONFIG_KEY = "app:config";

/**
 * 读取用户配置。
 */
export async function getConfig(): Promise<AppConfig | null> {
  const result = await chrome.storage.local.get(CONFIG_KEY);
  return (result[CONFIG_KEY] as AppConfig | undefined) ?? null;
}

/**
 * 保存用户配置。
 */
export async function setConfig(config: AppConfig): Promise<void> {
  await chrome.storage.local.set({ [CONFIG_KEY]: config });
}

/**
 * 校验 AI 配置是否完整。
 */
export function hasAiConfig(config: AppConfig | null): config is AppConfig {
  if (!config) {
    return false;
  }

  return Boolean(config.apiKey.trim() && config.baseUrl.trim() && config.model.trim());
}
