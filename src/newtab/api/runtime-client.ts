import {
  type CommandName,
  type RequestMap,
  type ResponseMap,
  type RuntimeRequest,
  type RuntimeResponse
} from "@/shared/message-contract";

/**
 * 发送扩展消息并返回类型安全结果。
 */
export async function sendRuntimeMessage<C extends CommandName>(
  command: C,
  payload: RequestMap[C]
): Promise<ResponseMap[C]> {
  const request: RuntimeRequest<C> = { command, payload };
  return new Promise<ResponseMap[C]>((resolve, reject) => {
    chrome.runtime.sendMessage(request, (response: RuntimeResponse<C>) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      if (!response?.ok || !response.data) {
        reject(new Error(response?.error?.message ?? "请求失败。"));
        return;
      }
      resolve(response.data);
    });
  });
}
