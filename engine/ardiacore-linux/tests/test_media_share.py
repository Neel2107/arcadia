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
PATCH = PATCHES / 'chromium-linux-tab-share.patch'
SHARING = 'chrome/browser/ui/views/tab_sharing/tab_sharing_ui_views.cc'
CHROMIUM_157 = '''  StopSharing("TabSharingUIViews destroyed");
}

gfx::NativeViewId TabSharingUIViews::OnStarted(
    base::OnceClosure stop_callback,
    content::MediaStreamUI::SourceCallback source_callback,
    const std::vector<content::DesktopMediaID>& media_ids) {
  DCHECK_CURRENTLY_ON(content::BrowserThread::UI);
  source_callback_ = std::move(source_callback);
  stop_callback_ = std::move(stop_callback);
  CreateInfobarsForAllTabs();
  UpdateTabCaptureData(shared_tab_, TabCaptureUpdate::kCaptureAdded);
  CreateTabCaptureIndicator();
  return 0;
}

void TabSharingUIViews::OnRegionCaptureRectChanged(
'''


class MediaShareTests(unittest.TestCase):
    def test_the_rules_for_stopping_switching_and_reporting_a_share(self):
        with tempfile.TemporaryDirectory(prefix='ardia-media-share-') as directory:
            binary = Path(directory) / 'media-share'
            subprocess.run([os.environ.get('CXX', 'c++'), '-std=c++20', '-Wall', '-Wextra', '-Werror', '-g',
                            '-fsanitize=address,undefined', '-fno-omit-frame-pointer', '-I', str(SOURCE),
                            str(ROOT / 'tests/media_share_test.cc'), '-o', str(binary)],
                           check=True, text=True, timeout=180)
            result = subprocess.run([str(binary)], text=True, timeout=60, capture_output=True,
                                    env={**os.environ, 'UBSAN_OPTIONS': 'halt_on_error=1'})
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            self.assertEqual(result.stdout, 'ok\n')

    def test_the_calls_are_the_shared_ones_with_the_macs_arguments(self):
        api = (REPO / 'packages/ardiacore/src/engine/api.ts').read_text()
        self.assertIn('"media.changeCaptureSource": [{ capturer: string; target: string }, boolean];', api)
        self.assertIn('"media.stopCapture": [{ tabId: string }, boolean];', api)
        platform = (REPO / 'apps/browser/src/platform/media.ts').read_text()
        self.assertIn('call("media.changeCaptureSource", { capturer, target })', platform)
        self.assertIn('call("media.stopCapture", { tabId: capturer })', platform)
        core = (LINUX / 'ac_linux_media_share.h').read_text()
        self.assertIn('kStopCaptureCall[] = "media.stopCapture"', core)
        self.assertIn('kChangeCaptureSourceCall[] = "media.changeCaptureSource"', core)
        self.assertIn('kMediaShareCapabilities[] = {"media.stopCapture", "media.changeCaptureSource", "media.tabShare"}', core)

    def test_stopping_is_the_macs_stop_of_display_capture_and_answers_whether_it_was_sharing(self):
        mac = (REPO / 'engine/ardiacore/src/ardia/core/ardiacore_tab_media.mm').read_text()
        self.assertIn('MediaStreamCaptureIndicator::MediaType::kDisplayMedia);', mac)
        glue = (LINUX / 'ac_linux_capture.cc').read_text()
        stop = glue[glue.index('bool StopLinuxCapture('):glue.index('bool ShareLinuxTabInstead(')]
        for state in ('IsCapturingTab(capturer)', 'IsCapturingWindow(capturer)', 'IsCapturingDisplay(capturer)'):
            self.assertIn(f'indicator->{state}', stop)
        self.assertLess(stop.index('share::WasCapturing('), stop.index('indicator->StopMediaCapturing('))
        self.assertIn('indicator->StopMediaCapturing(capturer, MediaStreamCaptureIndicator::MediaType::kDisplayMedia);', stop)
        self.assertNotIn('kUserMedia', glue)

    def test_switching_presses_the_one_share_bar_of_that_capturer_on_the_target_tab(self):
        glue = (LINUX / 'ac_linux_capture.cc').read_text()
        switch = glue[glue.index('bool ShareLinuxTabInstead('):glue.index('void WatchLinuxTabShares(')]
        self.assertIn('infobars::ContentInfoBarManager::FromWebContents(target)', switch)
        self.assertIn('infobars::InfoBarDelegate::TAB_SHARING_INFOBAR_DELEGATE', switch)
        self.assertIn('content::RenderFrameHost::FromID(sharing->capturer_id())', switch)
        self.assertIn('sharing->GetButtons() & TabSharingInfoBarDelegate::kShareThisTabInstead', switch)
        self.assertIn('sharing->IsButtonEnabled(TabSharingInfoBarDelegate::kShareThisTabInstead)', switch)
        self.assertLess(switch.index('share::BarToShareInstead(bars)'), switch.index('->ShareThisTabInstead();'))
        self.assertLess(switch.index('if (!chosen) return false;'), switch.index('->ShareThisTabInstead();'))
        self.assertIn('content::GlobalRenderFrameHostId capturer_id() const { return capturer_id_; }',
                      (PATCHES / 'chromium-tab-sharing-capturer.patch').read_text())

    def test_the_host_routes_both_for_a_capturer_of_the_calling_window(self):
        host = (LINUX / 'ac_linux_host.cc').read_text()
        route = host[host.index('if (ardia::linux_media_share::Handles(name)) {'):host.index('if (ardiacore::LinuxDeviceChooserHandles(name)) {')]
        self.assertIn('if (host_->is_utility()) return Fail(id, "ERR_UNKNOWN_CALL",', route)
        self.assertIn('input.FindString(change ? "capturer" : "tabId")', route)
        self.assertIn('input.size() != (change ? 2u : 1u)', route)
        self.assertIn('TabBinding* capturer = host_->BindingForKey(*capturer_id);', route)
        self.assertIn('if (!capturer) return Resolve(id, base::Value(false));', route)
        self.assertIn('ardiacore::StopLinuxCapture(capturer->contents())', route)
        self.assertIn('ardiacore::ShareLinuxTabInstead(target, capturer->contents())', route)
        self.assertLess(route.index('share::ValidTabId(*capturer_id)'), route.index('host_->BindingForKey(*capturer_id)'))

    def test_a_started_tab_share_reaches_the_capturers_window_as_one_event(self):
        host = (LINUX / 'ac_linux_host.cc').read_text()
        watch = host[host.index('ardiacore::WatchLinuxTabShares('):host.index('ac_engine_set_event_sink(EngineEvent, nullptr);')]
        self.assertIn('host->ExtensionTabKey(capturer)', watch)
        self.assertIn('host->ExtensionTabKey(shared)', watch)
        self.assertIn('ardia::linux_media_share::ReportedTabShare(', watch)
        self.assertIn('capturer->GetPrimaryMainFrame()->GetLastCommittedOrigin().Serialize()', watch)
        self.assertIn('host->MediaEvent(ardia::linux_media_share::kTabShareEvent, base::DictValue()', watch)
        self.assertIn('.Set("capturer", share->capturer).Set("captured", share->captured).Set("origin", share->origin)', watch)
        event = host[host.index('bool ShellHostView::MediaEvent('):host.index('bool ShellHostView::PromptPageEvent(')]
        self.assertIn('if (!browser_ || !handler_ || is_utility()) return false;', event)
        self.assertIn('Event("ArdiaMedia", "media", base::Value(base::DictValue().Set("name", name).Set("data", std::move(data))));', event)
        glue = (LINUX / 'ac_linux_capture.cc').read_text()
        self.assertIn('extern void (*g_ardia_linux_tab_share_started)(content::GlobalRenderFrameHostId capturer,', glue)
        self.assertIn('g_ardia_linux_tab_share_started = &TabShareStarted;', glue)

    def test_browser_windows_advertise_them_and_the_sources_are_built(self):
        host = (LINUX / 'ac_linux_host.cc').read_text()
        self.assertIn('for (const char* capability : ardia::linux_media_share::kMediaShareCapabilities) capabilities.Append(capability);', host)
        build = (LINUX / 'BUILD.gn').read_text()
        for source in ('"ac_linux_capture.cc"', '"ac_linux_capture.h"', '"ac_linux_media_share.h"',
                       '"//chrome/browser/ui/tab_sharing"', '"//components/infobars/content"', '"//components/infobars/core"'):
            self.assertIn(source, build)

    def test_the_hook_patch_is_linux_only_and_after_the_minimum_size_patch(self):
        steps = [line.split() for line in (PATCHES / 'series').read_text().splitlines() if line.startswith('chromium ')]
        names = [step[1] for step in steps]
        at = names.index('chromium-linux-tab-share.patch')
        self.assertEqual(steps[at], ['chromium', 'chromium-linux-tab-share.patch', 'linux'])
        self.assertGreater(at, names.index('chromium-linux-window-minimum-size.patch'))
        self.assertGreater(at, names.index('chromium-tab-sharing-capturer.patch'))
        self.assertEqual(names.count('chromium-linux-tab-share.patch'), 1)

    def test_the_hook_patch_applies_to_chromium_157_and_reports_captures_only_after_the_bars_exist(self):
        if shutil.which('git') is None:
            self.skipTest('git is unavailable')
        with tempfile.TemporaryDirectory(prefix='ardia-tab-share-') as directory:
            target = Path(directory) / SHARING
            target.parent.mkdir(parents=True)
            target.write_text('\n' * 254 + CHROMIUM_157)
            result = subprocess.run(['git', 'apply', '--whitespace=nowarn', str(PATCH)], cwd=directory,
                                    capture_output=True, text=True, timeout=30)
            self.assertEqual(result.returncode, 0, result.stderr)
            patched = target.read_text()
        self.assertIn('void (*g_ardia_linux_tab_share_started)(\n    content::GlobalRenderFrameHostId capturer,\n'
                      '    content::WebContents* shared_tab) = nullptr;\n', patched)
        body = patched[patched.index('gfx::NativeViewId TabSharingUIViews::OnStarted('):]
        self.assertLess(body.index('CreateInfobarsForAllTabs();'), body.index('g_ardia_linux_tab_share_started(capturer_, shared_tab_);'))
        self.assertIn('capture_type_ == TabSharingInfoBarDelegate::TabShareType::CAPTURE', body)
        self.assertLess(body.index('g_ardia_linux_tab_share_started(capturer_, shared_tab_);'), body.index('return 0;'))


if __name__ == '__main__':
    unittest.main()
