import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";

const INSTALLER = join(dirname(fileURLToPath(import.meta.url)), "install.sh");
const scratch = mkdtempSync(join(tmpdir(), "ardia-install-test-"));
after(() => rmSync(scratch, { recursive: true, force: true }));

function put(path, text, mode = 0o644) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
  chmodSync(path, mode);
}

function extractedPackage(name) {
  const root = join(scratch, name, "ardia");
  put(join(root, "lib/ardia/chrome"), "chrome", 0o755);
  put(join(root, "lib/ardia/ardia-launch"), "#!/bin/sh\n", 0o755);
  put(join(root, "lib/ardia/ardia-ui/index.html"), "<html></html>");
  put(join(root, "bin/ardia"), "#!/bin/sh\n", 0o755);
  put(join(root, "share/applications/ardia.desktop"), "[Desktop Entry]\nName=Ardia\nExec=ardia %U\n");
  put(join(root, "share/icons/hicolor/256x256/apps/ardia.png"), "png");
  put(join(root, "share/polkit-1/actions/dev.ardia.linux.policy"), "<policyconfig/>");
  put(join(root, "share/apparmor.d/ardia"), "profile ardia /usr/lib/ardia/chrome flags=(unconfined) {\n}\n");
  copyFileSync(INSTALLER, join(root, "install.sh"));
  chmodSync(join(root, "install.sh"), 0o755);
  return root;
}

function run(script, args) {
  return spawnSync("bash", [script, ...args], { encoding: "utf8", env: { PATH: process.env.PATH, LANG: "C" } });
}

const INSTALLED = ["usr/bin/ardia", "usr/lib/ardia/chrome", "usr/share/applications/ardia.desktop", "usr/share/icons/hicolor/256x256/apps/ardia.png", "usr/share/polkit-1/actions/dev.ardia.linux.policy"];

test("--uninstall removes everything a staged install put down and keeps unrelated files", () => {
  const root = extractedPackage("roundtrip");
  const stage = join(scratch, "roundtrip-stage");
  const installed = run(join(root, "install.sh"), ["--destdir", stage]);
  assert.equal(installed.status, 0, installed.stderr);
  for (const path of INSTALLED) assert.ok(existsSync(join(stage, path)), path);
  put(join(stage, "usr/bin/other"), "keep");
  put(join(stage, "usr/share/applications/other.desktop"), "keep");
  const removed = run(join(root, "install.sh"), ["--uninstall", "--destdir", stage]);
  assert.equal(removed.status, 0, removed.stderr);
  for (const path of [...INSTALLED, "usr/lib/ardia"]) assert.ok(!existsSync(join(stage, path)), path);
  assert.equal(readFileSync(join(stage, "usr/bin/other"), "utf8"), "keep");
  assert.equal(readFileSync(join(stage, "usr/share/applications/other.desktop"), "utf8"), "keep");
  assert.match(removed.stdout, /Ardia is uninstalled/);
});

test("--uninstall with a custom prefix leaves another prefix's launcher, desktop entry and the shared policy alone", () => {
  const root = extractedPackage("prefix");
  const stage = join(scratch, "prefix-stage");
  assert.equal(run(join(root, "install.sh"), ["--destdir", stage]).status, 0);
  assert.equal(run(join(root, "install.sh"), ["--prefix", "/opt/ardia", "--destdir", stage]).status, 0);
  const removed = run(join(root, "install.sh"), ["--uninstall", "--prefix", "/opt/ardia", "--destdir", stage]);
  assert.equal(removed.status, 0, removed.stderr);
  assert.ok(!existsSync(join(stage, "opt/ardia/lib/ardia")));
  assert.ok(!existsSync(join(stage, "opt/ardia/bin/ardia")));
  for (const path of INSTALLED) assert.ok(existsSync(join(stage, path)), path);
});

test("--uninstall leaves a launcher or desktop entry that isn't Ardia's", () => {
  const root = extractedPackage("foreign");
  const stage = join(scratch, "foreign-stage");
  assert.equal(run(join(root, "install.sh"), ["--destdir", stage]).status, 0);
  put(join(stage, "usr/bin/ardia"), "#!/bin/sh\nexec something-else\n", 0o755);
  put(join(stage, "usr/share/applications/ardia.desktop"), "[Desktop Entry]\nExec=/somewhere/else %U\n");
  assert.equal(run(join(root, "install.sh"), ["--uninstall", "--destdir", stage]).status, 0);
  assert.ok(existsSync(join(stage, "usr/bin/ardia")));
  assert.ok(existsSync(join(stage, "usr/share/applications/ardia.desktop")));
  assert.ok(existsSync(join(stage, "usr/share/icons/hicolor/256x256/apps/ardia.png")));
  assert.ok(!existsSync(join(stage, "usr/lib/ardia")));
});

test("--uninstall refuses a prefix with no Ardia in it and touches nothing", () => {
  const root = extractedPackage("empty");
  const stage = join(scratch, "empty-stage");
  put(join(stage, "usr/lib/ardia/keep"), "keep");
  const removed = run(join(root, "install.sh"), ["--uninstall", "--destdir", stage]);
  assert.equal(removed.status, 1);
  assert.match(removed.stderr, /no Ardia installed under \/usr/);
  assert.ok(existsSync(join(stage, "usr/lib/ardia/keep")));
});

test("--uninstall without --destdir needs root", { skip: process.getuid?.() === 0 }, () => {
  const removed = run(INSTALLER, ["--uninstall", "--prefix", join(scratch, "nowhere")]);
  assert.equal(removed.status, 1);
  assert.match(removed.stderr, /needs root/);
});

test("a staged install carries no uninstaller copy, so distribution packages don't ship one", () => {
  const root = extractedPackage("nocopy");
  const stage = join(scratch, "nocopy-stage");
  assert.equal(run(join(root, "install.sh"), ["--destdir", stage]).status, 0);
  assert.ok(!existsSync(join(stage, "usr/lib/ardia/install.sh")));
});
