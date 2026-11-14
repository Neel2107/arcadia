import assert from "node:assert/strict";
import { test } from "node:test";
import { noteBarWordEdit, takeBarWordEditCounts } from "./barWordEdits.ts";

test("bar word deletes and moves are counted, those that stopped at a dot apart, and taking them starts over", () => {
  noteBarWordEdit("delete", true);
  noteBarWordEdit("delete", false);
  noteBarWordEdit("delete", true);
  noteBarWordEdit("move", true);
  noteBarWordEdit("move", false);
  noteBarWordEdit("move", false);
  assert.deepEqual(takeBarWordEditCounts(), { bar_word_deletes: 3, bar_word_deletes_split_at_dot: 2, bar_word_moves: 3, bar_word_moves_split_at_dot: 1 });
  assert.deepEqual(takeBarWordEditCounts(), { bar_word_deletes: 0, bar_word_deletes_split_at_dot: 0, bar_word_moves: 0, bar_word_moves_split_at_dot: 0 });
});
