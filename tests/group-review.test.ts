import test from "node:test";
import assert from "node:assert/strict";
import { buildGroupReviewCandidates, splitIntoFixedBatches } from "../src/shared/group-review.js";
import type { BookmarkItem, GroupPlan } from "../src/shared/types.js";

test("splitIntoFixedBatches: 会按固定条数切分批次", () => {
  const items = Array.from({ length: 595 }, (_, index) => index + 1);
  const batches = splitIntoFixedBatches(items, 300);

  assert.equal(batches.length, 2);
  assert.equal(batches[0]?.length, 300);
  assert.equal(batches[1]?.length, 295);
});

test("buildGroupReviewCandidates: 只保留组路径、数量和少量标题样本", () => {
  const bookmarkById = new Map<string, BookmarkItem>([
    [
      "1",
      { id: "1", title: "React 官方文档", url: "https://react.dev", parentId: "0", path: ["技术"] }
    ],
    [
      "2",
      { id: "2", title: "React 官方文档", url: "https://react.dev/learn", parentId: "0", path: ["技术"] }
    ],
    [
      "3",
      { id: "3", title: "React Hooks 指南", url: "https://legacy.reactjs.org", parentId: "0", path: ["技术"] }
    ],
    [
      "4",
      { id: "4", title: "React Compiler", url: "https://react.dev/reference", parentId: "0", path: ["技术"] }
    ]
  ]);
  const groups: GroupPlan[] = [
    {
      groupPath: ["技术", "前端开发", "React"],
      bookmarkIds: ["1", "2", "3", "4"]
    }
  ];

  const candidates = buildGroupReviewCandidates(groups, bookmarkById, 3);

  assert.equal(candidates.length, 1);
  assert.equal(candidates[0]?.id, "g1");
  assert.equal(candidates[0]?.count, 4);
  assert.deepEqual(candidates[0]?.groupPath, ["技术", "前端开发", "React"]);
  assert.deepEqual(candidates[0]?.sampleTitles, ["React 官方文档", "React Hooks 指南", "React Compiler"]);
});
