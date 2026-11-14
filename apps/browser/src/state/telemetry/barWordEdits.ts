import { onAppEvent } from "../../platform/app";

const counts = { bar_word_deletes: 0, bar_word_deletes_split_at_dot: 0, bar_word_moves: 0, bar_word_moves_split_at_dot: 0 };

export function noteBarWordEdit(kind: "delete" | "move", splitAtDot: boolean) {
  if (kind === "delete") {
    counts.bar_word_deletes++;
    if (splitAtDot) counts.bar_word_deletes_split_at_dot++;
  } else {
    counts.bar_word_moves++;
    if (splitAtDot) counts.bar_word_moves_split_at_dot++;
  }
}

export function takeBarWordEditCounts() {
  const taken = { ...counts };
  for (const key of Object.keys(counts) as (keyof typeof counts)[]) counts[key] = 0;
  return taken;
}

export const watchBarWordEdits = () => onAppEvent((e) => e.type === "barWordEdit" && noteBarWordEdit(e.kind, e.splitAtDot));
