import test from "node:test";
import assert from "node:assert/strict";
import {
  buildSuggestedGroupPath,
  detectExcludeReason,
  preprocessBookmarks
} from "../src/background/utils/bookmark-preprocess.js";
import { createBookmark } from "./evaluation-fixtures.js";

test("detectExcludeReason: 能识别 localhost、内网、本地文件和测试环境", () => {
  assert.equal(detectExcludeReason("http://localhost:3000/app"), "本地服务");
  assert.equal(detectExcludeReason("http://192.168.1.20:8080"), "内网地址");
  assert.equal(detectExcludeReason("file:///Users/nico/demo/index.html"), "本地文件");
  assert.equal(detectExcludeReason("https://test.example.com/dashboard"), "测试环境");
});

test("preprocessBookmarks: 只保留公开书签进入 AI 分类", () => {
  const result = preprocessBookmarks([
    createBookmark({ id: "1", title: "公开文档", url: "https://react.dev/" }),
    createBookmark({ id: "2", title: "本地页面", url: "http://localhost:8869/" }),
    createBookmark({ id: "3", title: "测试站点", url: "https://staging.demo.com/" })
  ]);

  assert.deepEqual(
    result.includedItems.map((item) => item.id),
    ["1"]
  );
  assert.deepEqual(
    result.excludedItems.map((item) => ({
      id: item.id,
      reason: item.reason,
      suggestedGroupPath: item.suggestedGroupPath
    })),
    [
      { id: "2", reason: "本地服务", suggestedGroupPath: ["工作", "内部系统", "本地服务"] },
      { id: "3", reason: "测试环境", suggestedGroupPath: ["工作", "项目平台", "测试环境"] }
    ]
  );
});

test("buildSuggestedGroupPath: 不同排除原因会映射到稳定建议路径", () => {
  assert.deepEqual(buildSuggestedGroupPath("内网地址"), ["工作", "内部系统", "内网地址"]);
  assert.deepEqual(buildSuggestedGroupPath("测试环境"), ["工作", "项目平台", "测试环境"]);
});
