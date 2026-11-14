#include "ardia/linux/ac_linux_tracing.h"

#include <memory>
#include <optional>
#include <string>
#include <string_view>
#include <utility>

#include "ardia/linux/ac_linux_report_core.h"
#include "ardia/linux/ac_linux_tracing_core.h"
#include "base/files/file_path.h"
#include "base/files/file_util.h"
#include "base/functional/bind.h"
#include "base/functional/callback_helpers.h"
#include "base/location.h"
#include "base/memory/scoped_refptr.h"
#include "base/no_destructor.h"
#include "base/task/single_thread_task_runner.h"
#include "base/task/thread_pool.h"
#include "base/time/time.h"
#include "base/trace_event/trace_config.h"
#include "content/public/browser/browser_thread.h"
#include "content/public/browser/tracing_controller.h"

namespace ardiacore {
namespace {

namespace tracing = ardia::linux_tracing;
namespace report = ardia::linux_report;

using Done = base::OnceCallback<void(bool, base::Value)>;

struct TracingStart {
  Done done;
  bool answered = false;
  int session = 0;
};

tracing::Sessions& Sessions() {
  static base::NoDestructor<tracing::Sessions> sessions;
  return *sessions;
}

std::weak_ptr<TracingStart>& PendingStart() {
  static base::NoDestructor<std::weak_ptr<TracingStart>> pending;
  return *pending;
}

void AnswerStart(const std::shared_ptr<TracingStart>& start, bool started) {
  if (start->answered) return;
  start->answered = true;
  if (!started) Sessions().StartFailed(start->session);
  std::move(start->done).Run(true, base::Value(started));
}

void WatchStart(std::shared_ptr<TracingStart> start, int checks_left) {
  content::TracingController* controller = content::TracingController::GetInstance();
  switch (tracing::NextStartWatch(start->answered, Sessions().Current(start->session), controller->IsTracing(),
                                  checks_left)) {
    case tracing::StartWatch::kDone:
      return;
    case tracing::StartWatch::kFailed:
      return AnswerStart(start, false);
    case tracing::StartWatch::kFailedAndStop:
      AnswerStart(start, false);
      controller->StopTracing(nullptr);
      return;
    case tracing::StartWatch::kWait:
      base::SingleThreadTaskRunner::GetCurrentDefault()->PostDelayedTask(
          FROM_HERE, base::BindOnce(&WatchStart, std::move(start), checks_left - 1),
          base::Milliseconds(tracing::kStartCheckMs));
      return;
  }
}

void Begin(Done done) {
  const std::optional<int> session = Sessions().Begin();
  if (!session) return std::move(done).Run(true, base::Value(false));
  auto start = std::make_shared<TracingStart>();
  start->done = std::move(done);
  start->session = *session;
  PendingStart() = start;
  const bool starting = content::TracingController::GetInstance()->StartTracing(
      base::trace_event::TraceConfig(),
      base::BindOnce([](std::shared_ptr<TracingStart> start) {
        if (tracing::StopsAfterLateStart(start->answered, Sessions().Current(start->session), Sessions().tracing())) {
          content::TracingController::GetInstance()->StopTracing(nullptr);
          return;
        }
        AnswerStart(start, true);
      }, start));
  if (!starting) return AnswerStart(start, false);
  WatchStart(start, tracing::kStartChecks);
}

class DiscardedTrace : public content::TracingController::TraceDataEndpoint {
 public:
  explicit DiscardedTrace(base::OnceClosure finished) : finished_(std::move(finished)) {}

  void ReceiveTraceChunk(std::unique_ptr<std::string> chunk) override {}
  void ReceivedTraceFinalContents() override {
    content::GetUIThreadTaskRunner({})->PostTask(FROM_HERE, std::move(finished_));
  }

 private:
  ~DiscardedTrace() override = default;

  base::OnceClosure finished_;
};

std::optional<base::FilePath> PrepareTraceFile(const base::FilePath& documents) {
  if (documents.empty()) return std::nullopt;
  const base::FilePath drafts = documents.AppendASCII(report::kDraftsFolder);
  const std::string path = tracing::TracePath(drafts.value());
  if (path.empty() || !report::InsideDrafts(drafts.value(), path)) return std::nullopt;
  const base::FilePath file(path);
  const base::FilePath folder = file.DirName();
  if (!base::CreateDirectory(drafts) || base::IsLink(drafts)) return std::nullopt;
  base::SetPosixFilePermissions(drafts, 0700);
  if (base::IsLink(folder) || !base::CreateDirectory(folder)) return std::nullopt;
  base::SetPosixFilePermissions(folder, 0700);
  if (base::IsLink(file) || base::DirectoryExists(file)) return std::nullopt;
  base::DeleteFile(file);
  return file;
}

void StopInto(Done done, std::optional<base::FilePath> file) {
  DCHECK_CURRENTLY_ON(content::BrowserThread::UI);
  content::TracingController* controller = content::TracingController::GetInstance();
  auto split = base::SplitOnceCallback(std::move(done));
  if (!file) {
    controller->StopTracing(nullptr);
    return std::move(split.first).Run(true, base::Value());
  }
  const bool stopping = controller->StopTracing(content::TracingController::CreateFileEndpoint(
      *file, base::BindOnce([](Done done, base::FilePath file) {
        std::move(done).Run(true, base::Value(file.value()));
      }, std::move(split.first), *file)));
  if (!stopping) std::move(split.second).Run(true, base::Value());
}

void End(bool keep, const base::FilePath& documents, Done done) {
  if (!Sessions().End()) return std::move(done).Run(true, base::Value());
  if (std::shared_ptr<TracingStart> pending = PendingStart().lock()) AnswerStart(pending, false);
  if (keep) {
    base::ThreadPool::PostTaskAndReplyWithResult(
        FROM_HERE, {base::MayBlock(), base::TaskPriority::USER_VISIBLE, base::TaskShutdownBehavior::SKIP_ON_SHUTDOWN},
        base::BindOnce(&PrepareTraceFile, documents), base::BindOnce(&StopInto, std::move(done)));
    return;
  }
  auto split = base::SplitOnceCallback(std::move(done));
  const bool stopping = content::TracingController::GetInstance()->StopTracing(
      base::MakeRefCounted<DiscardedTrace>(base::BindOnce([](Done done) {
        std::move(done).Run(true, base::Value());
      }, std::move(split.first))));
  if (!stopping) std::move(split.second).Run(true, base::Value());
}

void Refuse(Done done, std::string_view message) {
  std::move(done).Run(false, base::Value(base::DictValue().Set("code", "ERR_ENGINE").Set("message", message)));
}

}

bool LinuxTracingHandles(std::string_view name) {
  return tracing::Handles(name);
}

void LinuxTracingCall(std::string_view name, const base::DictValue& input, const base::FilePath& documents, Done done) {
  DCHECK_CURRENTLY_ON(content::BrowserThread::UI);
  if (name == tracing::kEndCall) {
    const std::optional<bool> keep = input.FindBool("keep");
    if (!keep || input.size() != 1) return Refuse(std::move(done), "engine.endTracing requires a boolean keep");
    return End(*keep, documents, std::move(done));
  }
  if (!input.empty()) return Refuse(std::move(done), "This tracing call takes no arguments");
  if (name == tracing::kBeginCall) return Begin(std::move(done));
  if (name == tracing::kIsTracingCall) return std::move(done).Run(true, base::Value(Sessions().tracing()));
  Refuse(std::move(done), "Unknown tracing call");
}

}
