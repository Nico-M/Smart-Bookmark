import test from "node:test";
import assert from "node:assert/strict";
import {
  inferGroupPathFromBookmark,
  normalizeGroupPathWithTaxonomy
} from "../src/shared/grouping-rules.js";
import {
  detectExcludeReason,
  preprocessBookmarks
} from "../src/background/utils/bookmark-preprocess.js";
import {
  INFERENCE_BASELINE_CASES,
  NORMALIZATION_BASELINE_CASES,
  PREPROCESS_BASELINE_CASES
} from "./evaluation-fixtures.js";

for (const baselineCase of NORMALIZATION_BASELINE_CASES) {
  test(`evaluation baseline / normalize: ${baselineCase.name}`, () => {
    const groupPath = normalizeGroupPathWithTaxonomy(
      baselineCase.inputGroupPath,
      baselineCase.bookmark
    );

    assert.deepEqual(groupPath, baselineCase.expectedGroupPath);
  });
}

for (const baselineCase of INFERENCE_BASELINE_CASES) {
  test(`evaluation baseline / infer: ${baselineCase.name}`, () => {
    const groupPath = inferGroupPathFromBookmark(baselineCase.bookmark);

    assert.deepEqual(groupPath, baselineCase.expectedGroupPath);
  });
}

test("evaluation baseline / preprocess: 样本集整体的纳入与排除结果稳定", () => {
  const result = preprocessBookmarks(PREPROCESS_BASELINE_CASES.map((baselineCase) => baselineCase.bookmark));

  assert.deepEqual(
    result.includedItems.map((item) => item.id),
    PREPROCESS_BASELINE_CASES.filter((baselineCase) => !baselineCase.expectedReason).map(
      (baselineCase) => baselineCase.bookmark.id
    )
  );
  assert.deepEqual(
    result.excludedItems.map((item) => item.id),
    PREPROCESS_BASELINE_CASES.filter((baselineCase) => baselineCase.expectedReason).map(
      (baselineCase) => baselineCase.bookmark.id
    )
  );
});

for (const baselineCase of PREPROCESS_BASELINE_CASES) {
  test(`evaluation baseline / preprocess: ${baselineCase.name}`, () => {
    const reason = detectExcludeReason(baselineCase.bookmark.url);

    assert.equal(reason, baselineCase.expectedReason);

    if (!baselineCase.expectedReason) {
      return;
    }

    const preprocessResult = preprocessBookmarks([baselineCase.bookmark]);
    assert.equal(preprocessResult.excludedItems.length, 1);
    assert.deepEqual(
      preprocessResult.excludedItems[0]?.suggestedGroupPath,
      baselineCase.expectedSuggestedGroupPath
    );
  });
}
