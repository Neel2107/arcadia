import assert from "node:assert/strict";
import { test } from "node:test";
const { useBrowser } = await import("../browser/store.ts");
const { importBookmarks } = await import("./apply.ts");
const { bookmarkRoots } = await import("../bookmarks/bookmarks.ts");
const { takeImportRuns } = await import("../telemetry/importRuns.ts");

const S = () => useBrowser.getState();
const P = "default";

function tree(id) {
  const node = S().bookmarks.nodes[id];
  if (node.kind === "url") return [node.title, node.url];
  return [node.title, node.children.map(tree)];
}

test("an imported bookmark with an empty name keeps it empty, and named ones, folders and order are unchanged", () => {
  S().hydrate({});
  S().createWindow({ url: "https://home.example/" });
  const root = {
    type: "folder",
    title: "",
    children: [
      {
        type: "folder",
        title: "Bookmarks bar",
        role: "toolbar",
        children: [
          { type: "url", title: "", url: "https://icon-only.example/" },
          { type: "url", title: "Named", url: "https://named.example/" },
          { type: "folder", title: "Work", children: [{ type: "url", title: "", url: "https://work.example/" }, { type: "url", title: "Docs", url: "https://docs.example/" }] },
        ],
      },
      { type: "folder", title: "Other bookmarks", role: "other", children: [{ type: "url", title: "", url: "https://other.example/" }] },
    ],
  };
  takeImportRuns();
  assert.equal(importBookmarks(P, root, "Helium"), 5);
  assert.equal(takeImportRuns().import_untitled_bookmarks, 3);
  assert.equal(takeImportRuns().import_untitled_bookmarks, 0);
  const roots = bookmarkRoots(S(), P);
  assert.deepEqual(tree(roots.bar)[1], [
    ["", "https://icon-only.example/"],
    ["Named", "https://named.example/"],
    ["Work", [["", "https://work.example/"], ["Docs", "https://docs.example/"]]],
  ]);
  assert.deepEqual(tree(roots.other)[1], [["", "https://other.example/"]]);
});

test("a reader that sends no name at all still gets the URL as the name", () => {
  S().hydrate({});
  S().createWindow({ url: "https://home.example/" });
  const root = { type: "folder", title: "", children: [{ type: "folder", title: "Bar", role: "toolbar", children: [{ type: "url", url: "https://untitled.example/" }] }] };
  takeImportRuns();
  assert.equal(importBookmarks("second", root, "Safari"), 1);
  assert.equal(takeImportRuns().import_untitled_bookmarks, 0);
  assert.deepEqual(tree(bookmarkRoots(S(), "second").bar)[1], [["https://untitled.example/", "https://untitled.example/"]]);
});
