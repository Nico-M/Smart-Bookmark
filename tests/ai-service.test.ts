import test from "node:test";
import assert from "node:assert/strict";
import {
  formatPathForPrompt,
  normalizeUrlForPrompt
} from "../src/shared/prompt-compression.js";

test("normalizeUrlForPrompt: 仓库地址只保留 host 和 owner/repo", () => {
  const normalized = normalizeUrlForPrompt(
    "https://github.com/jackfrued/Python-100-Days/tree/master/docs?tab=readme#intro"
  );

  assert.equal(normalized, "github.com/jackfrued/python-100-days");
});

test("normalizeUrlForPrompt: 普通站点路径会过滤长 slug 和无意义片段", () => {
  const normalized = normalizeUrlForPrompt(
    "https://react.dev/learn/2025/03/30/some-very-long-article-slug-about-react-compiler-and-hooks?foo=bar"
  );

  assert.equal(normalized, "react.dev/learn/some-very-long-articl...");
});

test("formatPathForPrompt: 只保留最后两级路径并限制长度", () => {
  const normalized = formatPathForPrompt([
    "技术",
    "前端开发",
    "超长的前端专题目录名称真的需要被压缩",
    "React 生态"
  ]);

  assert.equal(normalized, "超长的前端专题目录名称真的... / React 生态");
});
