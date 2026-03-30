import test from "node:test";
import assert from "node:assert/strict";
import { aiGroupReviewOutputSchema, aiOutputSchema } from "../src/shared/schemas.js";

test("aiOutputSchema: 合法结构可以通过校验", () => {
  const parsed = aiOutputSchema.parse({
    groups: [
      {
        groupPath: ["技术", "前端"],
        bookmarkIds: ["1", "2"],
        reason: "技术文章"
      }
    ],
    facets: [
      {
        id: "1",
        primary_topic: "前端开发",
        resource_type: "文档",
        source_type: "官方",
        usage_intent: "查阅",
        scope: "公开",
        confidence: 0.92
      }
    ]
  });

  assert.equal(parsed.groups.length, 1);
  assert.deepEqual(parsed.groups[0].groupPath, ["技术", "前端"]);
  assert.equal(parsed.facets?.[0].primary_topic, "前端开发");
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

test("aiGroupReviewOutputSchema: 合法的组名复检结构可以通过校验", () => {
  const parsed = aiGroupReviewOutputSchema.parse({
    groups: [
      {
        groupPath: ["技术", "社区博客"],
        groupIds: ["g1", "g3"],
        reason: "命名重复，已合并"
      }
    ]
  });

  assert.deepEqual(parsed.groups[0].groupIds, ["g1", "g3"]);
  assert.deepEqual(parsed.groups[0].groupPath, ["技术", "社区博客"]);
});
