import test from "node:test";
import assert from "node:assert/strict";
import type { BookmarkItem } from "../src/shared/types.js";
import { deduplicateBookmarks } from "../src/background/utils/dedup.js";

test("deduplicateBookmarks: 选择主记录并输出重复 ID", () => {
  const input: BookmarkItem[] = [
    {
      id: "id_no_title",
      title: "",
      url: "http://example.com/a/?utm_source=abc",
      parentId: "1",
      path: ["根", "技术"]
    },
    {
      id: "id_long_path",
      title: "Example A",
      url: "https://example.com/a",
      parentId: "2",
      path: ["根", "学习", "前端"]
    },
    {
      id: "id_short_path",
      title: "Example A2",
      url: "https://example.com/a#hash",
      parentId: "3",
      path: ["根"]
    },
    {
      id: "id_unique",
      title: "Unique",
      url: "https://another.com/page",
      parentId: "4",
      path: ["根", "其他"]
    }
  ];

  const result = deduplicateBookmarks(input);
  const uniqueIds = result.uniqueItems.map((item) => item.id).sort();
  const duplicateIds = [...result.duplicateIds].sort();

  assert.deepEqual(uniqueIds, ["id_short_path", "id_unique"]);
  assert.deepEqual(duplicateIds, ["id_long_path", "id_no_title"]);
});
