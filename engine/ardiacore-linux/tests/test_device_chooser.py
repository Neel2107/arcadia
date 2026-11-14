import os
from pathlib import Path
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'src'
LINUX = SOURCE / 'ardia/linux'
REPO = ROOT.parents[1]
PATCHES = ROOT.parent / 'patches'
FIXTURE = ROOT / 'tests/fixtures/page_state.h'


class DeviceChooserTests(unittest.TestCase):
    def test_requests_selection_and_the_event_follow_the_macs_chooser(self):
        with tempfile.TemporaryDirectory(prefix='ardia-device-chooser-') as directory:
            header = Path(directory) / 'base/values.h'
            header.parent.mkdir(parents=True)
            header.write_text(f'#include "{FIXTURE}"\n')
            binary = Path(directory) / 'device-chooser'
            subprocess.run([os.environ.get('CXX', 'c++'), '-std=c++20', '-Wall', '-Wextra', '-Werror', '-g',
                            '-fsanitize=address,undefined', '-fno-omit-frame-pointer', '-I', directory, '-I', str(SOURCE),
                            str(ROOT / 'tests/device_chooser_core_test.cc'), '-o', str(binary)],
                           check=True, text=True, timeout=180)
            result = subprocess.run([str(binary)], text=True, timeout=60, capture_output=True,
                                    env={**os.environ, 'UBSAN_OPTIONS': 'halt_on_error=1'})
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            self.assertEqual(result.stdout, 'ok\n')

    def test_the_event_and_calls_are_the_shared_ones(self):
        api = (REPO / 'packages/ardiacore/src/engine/api.ts').read_text()
        for line in ('"media.selectDevice": [{ id: number; index: number }, null];',
                     '"media.cancelDeviceChooser": [{ id: number }, null];',
                     '"media.refreshDeviceChooser": [{ id: number }, null];',
                     '"media.openBluetoothSettings": [{ id: number }, null];',
                     '"media.deviceChooser": DeviceChooser;'):
            self.assertIn(line, api)
        shared = (REPO / 'packages/ardiacore/src/media.ts').read_text()
        fields = shared[shared.index('export type DeviceChooser = {'):shared.index('};')]
        core = (LINUX / 'ac_linux_device_chooser_core.h').read_text()
        for field in ('id', 'tabId', 'open', 'title', 'okLabel', 'cancelLabel', 'noOptionsText', 'scanningText',
                      'refreshing', 'canRefresh', 'adapterOff', 'unauthorized', 'bothButtonsEnabled', 'showSignal',
                      'options'):
            self.assertIn(f'  {field}: ', fields)
            self.assertIn(f'event.Set("{field}", ', core)
        self.assertIn('options: { name: string; connected: boolean; paired: boolean; signal: number }[];', fields)
        for field in ('name', 'connected', 'paired', 'signal'):
            self.assertIn(f'.Set("{field}", ', core)
        mac = (REPO / 'engine/ardiacore/src/ardia/core/ac_device_chooser.mm').read_text()
        for field in ('title', 'okLabel', 'cancelLabel', 'noOptionsText', 'scanningText', 'refreshing', 'canRefresh',
                      'adapterOff', 'unauthorized', 'bothButtonsEnabled', 'showSignal'):
            self.assertIn(f'state[@"{field}"] =', mac)

    def test_the_chooser_is_adopted_through_the_shared_hook_only_for_a_tab_a_window_shows(self):
        self.assertIn('bool (*g_ardia_device_chooser)(', (PATCHES / 'chromium-device-chooser-hook.patch').read_text())
        steps = [line.split() for line in (PATCHES / 'series').read_text().splitlines() if line.startswith('chromium ')]
        self.assertIn(['chromium', 'chromium-device-chooser-hook.patch'], steps)
        glue = (LINUX / 'ac_linux_device_chooser.cc').read_text()
        self.assertIn('g_ardia_device_chooser = &HandleDeviceChooser;', glue)
        adopt = glue[glue.index('bool HandleDeviceChooser('):glue.index('void StartLinuxDeviceChoosers(')]
        refusal = adopt[:adopt.index('auto adopted = std::make_unique<DeviceChooser>(')]
        self.assertIn('Live().size() >= chooser::kMaxOpen', refusal)
        self.assertIn('TabFor(contents).window <= 0', refusal)
        self.assertIn('return false;', refusal)
        self.assertLess(adopt.index('self->Announce();'), adopt.index('*close_closure = base::BindOnce('))
        self.assertIn('self->CloseFromChrome();', adopt)

    def test_a_chooser_nobody_can_show_is_cancelled_and_never_left_open(self):
        glue = (LINUX / 'ac_linux_device_chooser.cc').read_text()
        changed = glue[glue.index('  void Changed() {'):glue.index('  std::unique_ptr<permissions::ChooserController> Finish() {')]
        self.assertIn('if (window_ > 0 && window_ != tab.window) {', changed)
        self.assertIn('if (!delivered && open()) CancelSoon();', changed)
        gone = glue[glue.index('void LinuxDeviceChoosersWindowGone('):]
        self.assertIn('if (live->window() == window) live->CancelSoon();', gone)
        host = (LINUX / 'ac_linux_host.cc').read_text()
        retire = host[host.index('  void RetireRenderer() {'):host.index('    LinuxLiveCallerGone(LiveCaller());')]
        self.assertIn('ardiacore::LinuxDeviceChoosersWindowGone(id_);', retire)
        closing = host[host.index('ShellHostView::~ShellHostView() {'):]
        closing = closing[:closing.index('  DropPlayer();')]
        self.assertIn('ardiacore::LinuxDeviceChoosersWindowGone(id_);', closing)

    def test_only_the_window_that_shows_the_chooser_answers_it(self):
        glue = (LINUX / 'ac_linux_device_chooser.cc').read_text()
        call = glue[glue.index('std::string LinuxDeviceChooserCall('):glue.index('void LinuxDeviceChoosersWindowGone(')]
        self.assertLess(call.index('chooser::ParseRequest(name, input)'), call.index('Find(request->id)'))
        self.assertLess(call.index('chooser::MayAnswer(window, found->window())'), call.index('found->Select(request->index);'))
        self.assertLess(call.index('chooser::MayAnswer(window, found->window())'), call.index('found->Cancel();'))
        host = (LINUX / 'ac_linux_host.cc').read_text()
        route = host[host.index('if (ardiacore::LinuxDeviceChooserHandles(name)) {'):host.index('if (name == ardiacore::kLinuxPeekOtherSiteTabsRoute) {')]
        self.assertIn('if (host_->is_utility()) return Fail(id, "ERR_UNKNOWN_CALL",', route)
        self.assertIn('ardiacore::LinuxDeviceChooserCall(host_->id(), name, input)', route)
        self.assertIn('return Resolve(id, base::Value());', route)

    def test_bluetooth_settings_never_reaches_chromiums_mac_only_preferences(self):
        glue = (LINUX / 'ac_linux_device_chooser.cc').read_text()
        self.assertNotIn('OpenPermissionPreferences', glue)
        self.assertIn('    case chooser::Action::kSettings:\n      break;', glue)

    def test_the_event_goes_out_on_the_media_channel_and_browser_windows_advertise_it(self):
        host = (LINUX / 'ac_linux_host.cc').read_text()
        self.assertIn('found->second->MediaEvent(ardia::linux_device_chooser::kEvent, std::move(chooser));', host)
        self.assertIn('for (const char* capability : ardia::linux_device_chooser::kDeviceChooserCapabilities) capabilities.Append(capability);', host)
        core = (LINUX / 'ac_linux_device_chooser_core.h').read_text()
        self.assertIn('kEvent[] = "media.deviceChooser"', core)
        build = (LINUX / 'BUILD.gn').read_text()
        for source in ('"ac_linux_device_chooser.cc"', '"ac_linux_device_chooser.h"', '"ac_linux_device_chooser_core.h"'):
            self.assertIn(source, build)


if __name__ == '__main__':
    unittest.main()
