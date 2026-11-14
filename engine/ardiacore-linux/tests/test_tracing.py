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


class TracingTests(unittest.TestCase):
    def test_sessions_the_start_watch_and_the_trace_file_follow_the_macs_recorder(self):
        compiler = shutil.which(os.environ.get('CXX', 'c++'))
        if compiler is None:
            self.skipTest('C++ compiler is unavailable')
        with tempfile.TemporaryDirectory(prefix='ardia-tracing-') as directory:
            root = Path(directory)
            shim = root / 'include/third_party/zlib'
            shim.mkdir(parents=True)
            (shim / 'zlib.h').write_text('#include <zlib.h>\n')
            binary = root / 'tracing'
            compiled = subprocess.run([compiler, '-std=c++20', '-Wall', '-Wextra', '-Werror', '-g',
                                       '-fsanitize=address,undefined', '-fno-omit-frame-pointer',
                                       '-I', str(root / 'include'), '-I', str(SOURCE),
                                       str(ROOT / 'tests/tracing_core_test.cc'), str(LINUX / 'ac_linux_report_core.cc'),
                                       '-lz', '-o', str(binary)], capture_output=True, text=True, timeout=300)
            if compiled.returncode != 0:
                if 'zlib.h' in compiled.stderr or 'cannot find -lz' in compiled.stderr:
                    self.skipTest('zlib development files are unavailable')
                self.fail(compiled.stderr)
            result = subprocess.run([str(binary)], text=True, timeout=60, capture_output=True,
                                    env={**os.environ, 'UBSAN_OPTIONS': 'halt_on_error=1'})
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            self.assertEqual(result.stdout, 'ok\n')

    def test_the_calls_are_the_shared_ones_and_the_numbers_are_the_macs(self):
        api = (REPO / 'packages/ardiacore/src/engine/api.ts').read_text()
        self.assertIn('"engine.beginTracing": [{}, boolean];', api)
        self.assertIn('"engine.endTracing": [{ keep: boolean }, string | null];', api)
        self.assertIn('"engine.isTracing": [{}, boolean];', api)
        mac = (REPO / 'engine/ardiacore/src/ardia/core/ardiacore_engine_tracing.mm').read_text()
        self.assertIn('constexpr int kTracingStartChecks = 100;', mac)
        self.assertIn('base::Milliseconds(100));', mac)
        self.assertIn('base::trace_event::TraceConfig(),', mac)
        core = (LINUX / 'ac_linux_tracing_core.h').read_text()
        self.assertIn('kStartChecks = 100;', core)
        self.assertIn('kStartCheckMs = 100;', core)
        self.assertIn('kTracingCapabilities[] = {"engine.beginTracing", "engine.endTracing", "engine.isTracing"}', core)
        self.assertIn('has("engine.beginTracing", "engine.endTracing", "engine.isTracing")',
                      (REPO / 'apps/linux/src/hostCapabilities.ts').read_text())

    def test_begin_answers_once_and_a_start_that_never_comes_is_stopped(self):
        glue = (LINUX / 'ac_linux_tracing.cc').read_text()
        begin = glue[glue.index('void Begin(Done done) {'):glue.index('class DiscardedTrace')]
        self.assertLess(begin.index('Sessions().Begin()'), begin.index('->StartTracing('))
        self.assertIn('if (!session) return std::move(done).Run(true, base::Value(false));', begin)
        self.assertIn('base::trace_event::TraceConfig(),', begin)
        self.assertIn('if (!starting) return AnswerStart(start, false);', begin)
        self.assertIn('WatchStart(start, tracing::kStartChecks);', begin)
        answer = glue[glue.index('void AnswerStart('):glue.index('void WatchStart(')]
        self.assertLess(answer.index('if (start->answered) return;'), answer.index('start->answered = true;'))
        self.assertLess(answer.index('start->answered = true;'), answer.index('std::move(start->done).Run('))
        self.assertIn('if (!started) Sessions().StartFailed(start->session);', answer)
        watch = glue[glue.index('void WatchStart('):glue.index('void Begin(Done done) {')]
        stop = watch[watch.index('case tracing::StartWatch::kFailedAndStop:'):watch.index('case tracing::StartWatch::kWait:')]
        self.assertLess(stop.index('AnswerStart(start, false);'), stop.index('controller->StopTracing(nullptr);'))

    def test_a_kept_trace_lands_in_the_report_drafts_where_gzip_may_read_it(self):
        glue = (LINUX / 'ac_linux_tracing.cc').read_text()
        prepare = glue[glue.index('std::optional<base::FilePath> PrepareTraceFile('):glue.index('void StopInto(')]
        self.assertIn('documents.AppendASCII(report::kDraftsFolder)', prepare)
        self.assertIn('report::InsideDrafts(drafts.value(), path)', prepare)
        self.assertEqual(prepare.count('base::SetPosixFilePermissions('), 2)
        self.assertEqual(prepare.count(', 0700);'), 2)
        for link in ('base::IsLink(drafts)', 'base::IsLink(folder)', 'base::IsLink(file)'):
            self.assertIn(link, prepare)
        report = (LINUX / 'ac_linux_report.cc').read_text()
        self.assertIn('documents.AppendASCII(report::kDraftsFolder)', report)
        end = glue[glue.index('void End(bool keep'):glue.index('void Refuse(')]
        self.assertLess(end.index('if (!Sessions().End()) return std::move(done).Run(true, base::Value());'),
                        end.index('PendingStart().lock()'))
        self.assertIn('base::BindOnce(&PrepareTraceFile, documents), base::BindOnce(&StopInto, std::move(done))', end)
        self.assertIn('base::MayBlock()', end)
        stop = glue[glue.index('void StopInto('):glue.index('void End(bool keep')]
        self.assertIn('content::TracingController::CreateFileEndpoint(', stop)
        self.assertIn('std::move(done).Run(true, base::Value(file.value()));', stop)
        self.assertIn('if (!stopping) std::move(split.second).Run(true, base::Value());', stop)
        shared = (REPO / 'apps/browser/src/state/report/recording.ts').read_text()
        self.assertIn('const raw = await endTracing(true).catch(() => null);', shared)
        self.assertIn('const bytes = await gzipFile(raw, path, true).catch(() => -1);', shared)

    def test_a_discarded_trace_writes_no_file_and_answers_null_when_it_has_stopped(self):
        glue = (LINUX / 'ac_linux_tracing.cc').read_text()
        end = glue[glue.index('void End(bool keep'):glue.index('void Refuse(')]
        discard = end[end.index('auto split = base::SplitOnceCallback(std::move(done));'):]
        self.assertIn('base::MakeRefCounted<DiscardedTrace>(', discard)
        self.assertNotIn('CreateFileEndpoint', discard)
        endpoint = glue[glue.index('class DiscardedTrace'):glue.index('std::optional<base::FilePath> PrepareTraceFile(')]
        self.assertIn('void ReceiveTraceChunk(std::unique_ptr<std::string> chunk) override {}', endpoint)
        self.assertIn('content::GetUIThreadTaskRunner({})->PostTask(FROM_HERE, std::move(finished_));', endpoint)

    def test_the_host_routes_the_three_calls_from_browser_windows_and_advertises_them(self):
        host = (LINUX / 'ac_linux_host.cc').read_text()
        route = host[host.index('if (ardiacore::LinuxTracingHandles(name)) {'):host.index('if (ardiacore::LinuxDeviceChooserHandles(name)) {')]
        self.assertIn('if (host_->is_utility()) return Fail(id, "ERR_UNKNOWN_CALL",', route)
        self.assertIn('host_->profile() ? DocumentDirectory(host_->profile()) : base::FilePath()', route)
        self.assertIn('if (ok) return handler->Resolve(id, std::move(result));', route)
        self.assertIn('for (const char* capability : ardia::linux_tracing::kTracingCapabilities) capabilities.Append(capability);', host)
        call = (LINUX / 'ac_linux_tracing.cc').read_text()
        call = call[call.index('void LinuxTracingCall('):]
        self.assertIn('const std::optional<bool> keep = input.FindBool("keep");', call)
        self.assertIn('if (!keep || input.size() != 1) return Refuse(', call)
        self.assertIn('if (!input.empty()) return Refuse(', call)
        build = (LINUX / 'BUILD.gn').read_text()
        for source in ('"ac_linux_tracing.cc"', '"ac_linux_tracing.h"', '"ac_linux_tracing_core.h"'):
            self.assertIn(source, build)


if __name__ == '__main__':
    unittest.main()
