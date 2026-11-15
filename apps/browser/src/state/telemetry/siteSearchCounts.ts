const NO_COUNTS = { site_search_tab_enters: 0, site_search_tab_enters_without_completion: 0 };
let counts = { ...NO_COUNTS };

export function noteSiteSearchTabEnter(withCompletion: boolean) {
  counts.site_search_tab_enters++;
  if (!withCompletion) counts.site_search_tab_enters_without_completion++;
}

export function takeSiteSearchCounts() {
  const taken = counts;
  counts = { ...NO_COUNTS };
  return taken;
}
