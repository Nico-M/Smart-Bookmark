import type { RuntimeRequest } from "@/shared/message-contract";
import { dispatchMessage } from "./message-router";

/**
 * 处理来自 UI 的消息请求。
 */
chrome.runtime.onMessage.addListener((request: RuntimeRequest, _sender, sendResponse) => {
  void dispatchMessage(request).then(sendResponse);
  return true;
});

/**
 * 点击扩展图标时打开管理页。
 */
chrome.action.onClicked.addListener(() => {
  void chrome.tabs.create({
    url: chrome.runtime.getURL("newtab.html")
  });
});
