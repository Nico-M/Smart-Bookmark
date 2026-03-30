import test from "node:test";
import assert from "node:assert/strict";
import { aiOutputSchema } from "../src/shared/schemas.js";

test("aiOutputSchema: 合法结构可以通过校验", () => {
  const parsed = aiOutputSchema.parse({
    groups: [
      {
        groupPath: ["技术", "前端"],
        bookmarkIds: ["1", "2"],
        reason: "技术文章"
      }
    ]
  });

  assert.equal(parsed.groups.length, 1);
  assert.deepEqual(parsed.groups[0].groupPath, ["技术", "前端"]);
});

test("aiOutputSchema: 兼容旧版 groupName", () => {
  const parsed = aiOutputSchema.parse({
    groups: [
      {
        groupName: "前端",
        bookmarkIds: ["3"]
      }
    ]
  });

  assert.deepEqual(parsed.groups[0].groupPath, ["前端"]);
});

test("aiOutputSchema: 缺失字段会抛出异常", () => {
  assert.throws(() => {
    aiOutputSchema.parse({
      groups: [{ bookmarkIds: ["1"] }]
    });
  });
});
