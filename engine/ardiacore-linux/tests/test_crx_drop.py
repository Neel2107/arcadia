import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'src'
LINUX = SOURCE / 'ardia/linux'
REPO = ROOT.parents[1]
PATCHES = ROOT.parent / 'patches'
PATCH = PATCHES / 'chromium-linux-page-drop.patch'
DELEGATE = 'chrome/browser/ui/views/tab_contents/chrome_web_contents_view_delegate_views.cc'
CHROMIUM_157 = '''  return !!context_menu_;
}

void ChromeWebContentsViewDelegateViews::OnPerformingDrop(
    const content::DropData& drop_data,
    DropCompletionCallback callback) {
  if (!callback.is_null()) std::move(callback).Run(std::move(drop_data));
}

std::unique_ptr<content::WebContentsViewDelegate> CreateWebContentsViewDelegate(
'''


class CrxDropTests(unittest.TestCase):
    def test_which_drops_are_taken_and_which_failures_are_reported(self):
        with tempfile.TemporaryDirectory(prefix='ardia-crx-drop-') as directory:
            binary = Path(directory) / 'crx-drop'
            subprocess.run([os.environ.get('CXX', 'c++'), '-std=c++20', '-Wall', '-Wextra', '-Werror', '-g',
                            '-fsanitize=address,undefined', '-fno-omit-frame-pointer', '-I', str(SOURCE),
                            str(ROOT / 'tests/crx_drop_core_test.cc'), '-o', str(binary)],
                           check=True, text=True, timeout=180)
            result = subprocess.run([str(binary)], text=True, timeout=60, capture_output=True,
                                    env={**os.environ, 'UBSAN_OPTIONS': 'halt_on_error=1'})
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            self.assertEqual(result.stdout, 'ok\n')

    def test_the_install_is_the_macs_dropped_file_install(self):
        mac = (REPO / 'engine/ardiacore/src/ardia/core/ac_extension_drop.mm').read_text()
        glue = (LINUX / 'ac_linux_crx_drop.cc').read_text()
        install = glue[glue.index('bool InstallDroppedExtensions('):glue.index('void StartLinuxCrxDrops(')]
        for line in ('installer->set_error_on_unsupported_requirements(true);',
                     'installer->set_install_immediately(true);',
                     'extensions::InstallPromptData::UNSET_PROMPT_TYPE',
                     'extensions::CrxInstaller::OffStoreInstallAllowedFromSettingsPage',
                     'installer->AddInstallerCallback('):
            self.assertIn(line, mac)
            self.assertIn(line, install)
        self.assertIn('std::make_unique<ExtensionInstallPrompt>(\n                     contents,', install)
        self.assertLess(install.index('drop::TakesDrop('), install.index('extensions::CrxInstaller::Create('))
        self.assertIn('profile->IsOffTheRecord()', install)
        self.assertIn('->BlocklistedByDefault()', install)
        self.assertLess(install.index('return false;\n  }\n  for (const std::string& path : paths) {'), install.index('return true;'))

    def test_a_cancelled_install_is_silent_and_a_failed_one_reports_the_macs_event(self):
        glue = (LINUX / 'ac_linux_crx_drop.cc').read_text()
        installed = glue[glue.index('void Installed('):glue.index('bool InstallDroppedExtensions(')]
        self.assertIn('extensions::CrxInstallErrorDetail::USER_CANCELED', installed)
        self.assertIn('extensions::CrxInstallErrorDetail::USER_ABORTED', installed)
        self.assertLess(installed.index('drop::ReportsFailure(error.has_value(), cancelled)'), installed.index('Delegate().failed.Run('))
        self.assertIn('drop::Message(base::UTF16ToUTF8(error->message()))', installed)
        api = (REPO / 'packages/ardiacore/src/engine/api.ts').read_text()
        self.assertIn('"extensions.installFailed": { message: string; tabId: string | null };', api)
        self.assertIn('emit:@"extensions.installFailed" data:@{@"message" : message ?: @"", @"tabId" : ardia_host::AppTabIdValue(tab)}',
                      (REPO / 'packages/ardiacore/ios/ArdiaHostEngineDelegate.mm').read_text())
        host = (LINUX / 'ac_linux_host.cc').read_text()
        failed = host[host.index('crx_drops.failed = base::BindRepeating('):host.index('ardiacore::StartLinuxCrxDrops(std::move(crx_drops));')]
        self.assertIn('failure.Set("message", std::move(message));', failed)
        self.assertIn('failure.Set("tabId", base::Value());', failed)
        self.assertIn('failure.Set("tabId", std::move(key));', failed)
        self.assertIn('chosen->ExtensionEvent(ardia::linux_crx_drop::kFailedEvent, std::move(failure));', failed)
        self.assertIn('if (host->is_utility() || !host->ShellLive()) continue;', failed)
        self.assertIn('kFailedEvent[] = "extensions.installFailed"', (LINUX / 'ac_linux_crx_drop_core.h').read_text())
        self.assertIn('onExtensionInstallFailed(({ message, tabId }) => {',
                      (REPO / 'apps/browser/src/state/extensions/crxDrop.ts').read_text())

    def test_only_a_tab_a_browser_window_shows_takes_the_drop(self):
        host = (LINUX / 'ac_linux_host.cc').read_text()
        shown = host[host.index('crx_drops.shown_by_a_window = base::BindRepeating('):host.index('crx_drops.failed = base::BindRepeating(')]
        self.assertIn('!entry.second->is_utility() && !entry.second->ExtensionTabKey(contents).empty()', shown)
        glue = (LINUX / 'ac_linux_crx_drop.cc').read_text()
        self.assertIn('extern bool (*g_ardia_linux_page_drop)(content::WebContents*, const content::DropData&);', glue)
        self.assertIn('g_ardia_linux_page_drop = &InstallDroppedExtensions;', glue)

    def test_browser_windows_advertise_the_event_and_the_sources_are_built(self):
        host = (LINUX / 'ac_linux_host.cc').read_text()
        self.assertIn('for (const char* capability : ardia::linux_crx_drop::kCrxDropCapabilities) capabilities.Append(capability);', host)
        self.assertIn('kCrxDropCapabilities[] = {"extensions.installFailed"}', (LINUX / 'ac_linux_crx_drop_core.h').read_text())
        build = (LINUX / 'BUILD.gn').read_text()
        for source in ('"ac_linux_crx_drop.cc"', '"ac_linux_crx_drop.h"', '"ac_linux_crx_drop_core.h"'):
            self.assertIn(source, build)

    def test_the_hook_patch_is_linux_only_and_last_among_the_page_hooks(self):
        steps = [line.split() for line in (PATCHES / 'series').read_text().splitlines() if line.startswith('chromium ')]
        names = [step[1] for step in steps]
        at = names.index('chromium-linux-page-drop.patch')
        self.assertEqual(steps[at], ['chromium', 'chromium-linux-page-drop.patch', 'linux'])
        self.assertGreater(at, names.index('chromium-linux-tab-share.patch'))
        self.assertEqual(names.count('chromium-linux-page-drop.patch'), 1)

    def test_the_hook_patch_applies_to_chromium_157_and_a_taken_drop_never_reaches_the_page(self):
        if shutil.which('git') is None:
            self.skipTest('git is unavailable')
        with tempfile.TemporaryDirectory(prefix='ardia-page-drop-') as directory:
            target = Path(directory) / DELEGATE
            target.parent.mkdir(parents=True)
            target.write_text('\n' * 180 + CHROMIUM_157)
            result = subprocess.run(['git', 'apply', '--whitespace=nowarn', str(PATCH)], cwd=directory,
                                    capture_output=True, text=True, timeout=30)
            self.assertEqual(result.returncode, 0, result.stderr)
            patched = target.read_text()
        self.assertIn('bool (*g_ardia_linux_page_drop)(content::WebContents*,\n'
                      '                                const content::DropData&) = nullptr;\n', patched)
        body = patched[patched.index('void ChromeWebContentsViewDelegateViews::OnPerformingDrop('):]
        taken = body[body.index('g_ardia_linux_page_drop(web_contents_, drop_data)'):body.index('Run(std::move(drop_data));')]
        self.assertIn('std::move(callback).Run(std::nullopt);', taken)
        self.assertIn('return;', taken)


if __name__ == '__main__':
    unittest.main()
