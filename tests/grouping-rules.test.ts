import test from "node:test";
import assert from "node:assert/strict";
import {
  inferGroupPathFromBookmark,
  normalizeGroupPathWithTaxonomy
} from "../src/shared/grouping-rules.js";
import type { BookmarkItem } from "../src/shared/types.js";

function createBookmark(overrides: Partial<BookmarkItem>): BookmarkItem {
  return {
    id: "1",
    title: "",
    url: "https://example.com",
    parentId: "0",
    path: [],
    ...overrides
  };
}

test("normalizeGroupPathWithTaxonomy: 技术旧别名会归并到稳定分类", () => {
  const bookmark = createBookmark({
    title: "AlloyTeam 团队博客",
    url: "https://www.alloyteam.com/"
  });

  const groupPath = normalizeGroupPathWithTaxonomy(["技术社区"], bookmark);

  assert.deepEqual(groupPath, ["技术", "社区博客"]);
});

test("normalizeGroupPathWithTaxonomy: 开发工具会收口到技术下的开发工具", () => {
  const bookmark = createBookmark({
    title: "CodePen",
    url: "https://codepen.io/"
  });

  const groupPath = normalizeGroupPathWithTaxonomy(["开发工具", "在线调试与代理"], bookmark);

  assert.deepEqual(groupPath, ["技术", "开发工具"]);
});

test("normalizeGroupPathWithTaxonomy: AI 旧分组会收口到 AI 主类", () => {
  const bookmark = createBookmark({
    title: "ollama",
    url: "https://github.com/ollama/ollama"
  });

  const groupPath = normalizeGroupPathWithTaxonomy(["AI与Python"], bookmark);

  assert.deepEqual(groupPath, ["AI", "编程与平台"]);
});

test("normalizeGroupPathWithTaxonomy: 其他主题下的个人工具会回流到工具", () => {
  const bookmark = createBookmark({
    title: "Excalidraw",
    url: "https://excalidraw.com/"
  });

  const groupPath = normalizeGroupPathWithTaxonomy(["其他主题", "个人工具", "效率工具"], bookmark);

  assert.deepEqual(groupPath, ["工具", "效率工具"]);
});

test("normalizeGroupPathWithTaxonomy: 其他主题下的影视娱乐会回流到影音", () => {
  const bookmark = createBookmark({
    title: "低端影视",
    url: "https://ddys.tv/"
  });

  const groupPath = normalizeGroupPathWithTaxonomy(["其他主题", "影视娱乐", "在线影视"], bookmark);

  assert.deepEqual(groupPath, ["影音", "在线影视"]);
});

test("normalizeGroupPathWithTaxonomy: 公司业务会归并到工作", () => {
  const bookmark = createBookmark({
    title: "System Dashboard - Wtoip JIRA",
    url: "http://192.168.30.27:8080/secure/Dashboard.jspa"
  });

  const groupPath = normalizeGroupPathWithTaxonomy(["其他主题", "公司业务", "内部系统"], bookmark);

  assert.deepEqual(groupPath, ["工作", "内部系统"]);
});

test("normalizeGroupPathWithTaxonomy: AI 误归类的普通编程教程会回流到技术", () => {
  const bookmark = createBookmark({
    title: "Python - 100天从新手到大师",
    url: "https://github.com/jackfrued/Python-100-Days"
  });

  const groupPath = normalizeGroupPathWithTaxonomy(["AI", "编程与平台"], bookmark);

  assert.deepEqual(groupPath, ["技术", "基础与语言"]);
});

test("normalizeGroupPathWithTaxonomy: 工具目录的错误层级会被拉直到稳定结构", () => {
  const bookmark = createBookmark({
    title: "精品MAC应用分享",
    url: "http://xclient.info/"
  });

  const groupPath = normalizeGroupPathWithTaxonomy(["工具", "在线工具", "软件下载"], bookmark);

  assert.deepEqual(groupPath, ["工具", "软件资源"]);
});

test("inferGroupPathFromBookmark: 兜底分类与主分类口径一致", () => {
  const bookmark = createBookmark({
    title: "异次元软件世界 - 软件改变生活",
    url: "https://www.iplaysoft.com/"
  });

  const groupPath = inferGroupPathFromBookmark(bookmark);

  assert.deepEqual(groupPath, ["工具", "软件资源"]);
});
