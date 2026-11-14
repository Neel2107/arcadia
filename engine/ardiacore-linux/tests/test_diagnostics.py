import os
from pathlib import Path
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'src'
LINUX = SOURCE / 'ardia/linux'
REPO = ROOT.parents[1]
FIXTURE = ROOT / 'tests/fixtures/page_state.h'


class DiagnosticsTests(unittest.TestCase):
    def test_the_sample_has_the_macs_two_fields_rounded_the_macs_way(self):
        with tempfile.TemporaryDirectory(prefix='ardia-diagnostics-') as directory:
            header = Path(directory) / 'base/values.h'
            header.parent.mkdir(parents=True)
            header.write_text(f'#include "{FIXTURE}"\n')
            binary = Path(directory) / 'diagnostics'
            subprocess.run([os.environ.get('CXX', 'c++'), '-std=c++20', '-Wall', '-Wextra', '-Werror', '-g',
                            '-fsanitize=address,undefined', '-fno-omit-frame-pointer', '-I', directory, '-I', str(SOURCE),
                            str(ROOT / 'tests/diagnostics_test.cc'), '-o', str(binary)],
                           check=True, text=True, timeout=180)
            result = subprocess.run([str(binary)], text=True, timeout=60, capture_output=True,
                                    env={**os.environ, 'UBSAN_OPTIONS': 'halt_on_error=1'})
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            self.assertEqual(result.stdout, 'ok\n')

    def test_the_fields_and_their_arithmetic_are_the_macs(self):
        shared = (REPO / 'packages/shell/src/app.ts').read_text()
        self.assertIn('export type DiagnosticsSample = { footprintMB?: number; freeDiskGB?: number };', shared)
        self.assertIn('diagnosticsSample(): Promise<DiagnosticsSample>;', shared)
        mac = (REPO / 'packages/shell/ios/CrashReports.swift').read_text()
        self.assertIn('sample["footprintMB"] = Int(footprint / 1_048_576)', mac)
        self.assertIn('sample["freeDiskGB"] = Double(free / 104_857_600) / 10', mac)
        core = (LINUX / 'ac_linux_diagnostics.h').read_text()
        self.assertIn('kBytesPerMB = 1048576;', core)
        self.assertIn('kBytesPerTenthGB = 104857600;', core)
        self.assertIn('reply.Set("footprintMB", ', core)
        self.assertIn('reply.Set("freeDiskGB", ', core)

    def test_it_reads_this_process_and_the_home_volume_off_the_ui_thread(self):
        glue = (LINUX / 'ac_linux_system.cc').read_text()
        read = glue[glue.index('diagnostics::Sample ReadDiagnosticsSample() {'):glue.index('bool LinuxSystemInvokes(')]
        self.assertLess(read.index('base::ScopedBlockingCall blocking(FROM_HERE, base::BlockingType::MAY_BLOCK);'),
                        read.index('base::ProcessMetrics::CreateCurrentProcessMetrics()->GetMemoryInfo()'))
        self.assertIn('diagnostics::FootprintBytes(memory->rss_anon_bytes, memory->vm_swap_bytes)', read)
        self.assertIn('base::SysInfo::AmountOfFreeDiskSpace(home)', read)
        self.assertIn('base::GetHomeDir()', read)
        call = glue[glue.index('if (method == diagnostics::kSampleCall) {'):glue.index('if (method == hardware::kThinScrollBarsCall) {')]
        self.assertIn('if (!args.empty()) return Fail(', call)
        self.assertIn('Worker()->PostTaskAndReplyWithResult(', call)
        self.assertIn('base::BindOnce(&ReadDiagnosticsSample)', call)

    def test_the_host_advertises_it_so_the_shells_empty_answer_steps_aside(self):
        host = (LINUX / 'ac_linux_host.cc').read_text()
        self.assertIn('for (const char* capability : ardia::linux_diagnostics::kDiagnosticsCapabilities) capabilities.Append(capability);', host)
        core = (LINUX / 'ac_linux_diagnostics.h').read_text()
        self.assertIn('kSampleCall[] = "ArdiaApp.diagnosticsSample"', core)
        self.assertIn('kDiagnosticsCapabilities[] = {"ArdiaApp.diagnosticsSample"}', core)
        glue = (LINUX / 'ac_linux_system.cc').read_text()
        invokes = glue[glue.index('bool LinuxSystemInvokes('):glue.index('void LinuxSystemInvoke(')]
        self.assertIn('diagnostics::kDiagnosticsCapabilities', invokes)
        self.assertIn('"ac_linux_diagnostics.h"', (LINUX / 'BUILD.gn').read_text())
        fallbacks = (REPO / 'apps/linux/src/appModuleFallbacks.ts').read_text()
        self.assertIn('diagnosticsSample: answer({}),', fallbacks)
        self.assertIn('if (hostSupports(`${name}.${method}`, host)) return undefined;', fallbacks)


if __name__ == '__main__':
    unittest.main()
