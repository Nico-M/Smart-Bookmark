import test from "node:test";
import assert from "node:assert/strict";
import { normalizeUrlForDedup } from "../src/background/utils/url-normalizer.js";

test("normalizeUrlForDedup: 去除跟踪参数/hash，统一协议并规范路径", () => {
  const normalized = normalizeUrlForDedup(
    "http://WWW.Example.com/path/?utm_source=abc&fbclid=xyz#section"
  );

  assert.equal(normalized, "https://www.example.com/path");
});

test("normalizeUrlForDedup: 保留非跟踪参数并按 key 排序", () => {
  const normalized = normalizeUrlForDedup(
    "https://example.com/p?b=2&a=1&utm_medium=social&gclid=123"
  );

  assert.equal(normalized, "https://example.com/p?a=1&b=2");
});

test("normalizeUrlForDedup: 非法 URL 兜底为小写文本", () => {
  const normalized = normalizeUrlForDedup("  Not A Url  ");
  assert.equal(normalized, "not a url");
});
