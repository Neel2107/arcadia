import assert from "node:assert/strict";
import { test } from "node:test";
const { noteSiteSearchTabEnter, takeSiteSearchCounts } = await import("./siteSearchCounts.ts");
const { takeFocusFeatureCounts } = await import("./focusFeatureCounts.ts");

test("Tab into site search counts every entry, and separately the ones with no completion showing", () => {
  takeSiteSearchCounts();
  noteSiteSearchTabEnter(true);
  noteSiteSearchTabEnter(false);
  noteSiteSearchTabEnter(false);
  assert.deepEqual(takeSiteSearchCounts(), { site_search_tab_enters: 3, site_search_tab_enters_without_completion: 2 });
  assert.deepEqual(takeSiteSearchCounts(), { site_search_tab_enters: 0, site_search_tab_enters_without_completion: 0 });
});

test("the counts ride along with the other feature counts", () => {
  noteSiteSearchTabEnter(false);
  const taken = takeFocusFeatureCounts();
  assert.equal(taken.site_search_tab_enters, 1);
  assert.equal(taken.site_search_tab_enters_without_completion, 1);
});
