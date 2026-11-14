#include <cassert>
#include <cstdio>
#include <string>

#include "ardia/linux/ac_linux_report_core.h"
#include "ardia/linux/ac_linux_tracing_core.h"

namespace tracing = ardia::linux_tracing;
namespace report = ardia::linux_report;

int main() {
  assert(tracing::Handles("engine.beginTracing") && tracing::Handles("engine.endTracing") &&
         tracing::Handles("engine.isTracing"));
  for (const char* other : {"", "engine.tracing", "engine.begintracing", "beginTracing", "engine.info"}) {
    assert(!tracing::Handles(other));
  }

  tracing::Sessions sessions;
  assert(!sessions.tracing());
  assert(!sessions.End());
  const auto first = sessions.Begin();
  assert(first && sessions.tracing() && sessions.Current(*first));
  assert(!sessions.Begin());
  assert(sessions.tracing());
  assert(sessions.End());
  assert(!sessions.tracing() && !sessions.Current(*first));
  assert(!sessions.End());

  const auto second = sessions.Begin();
  assert(second && *second != *first && sessions.Current(*second));
  sessions.StartFailed(*first);
  assert(sessions.tracing());
  sessions.StartFailed(*second);
  assert(!sessions.tracing());
  const auto third = sessions.Begin();
  assert(third && sessions.Current(*third) && !sessions.Current(*second));
  assert(sessions.End());
  sessions.StartFailed(*third);
  const auto fourth = sessions.Begin();
  assert(fourth && sessions.tracing());
  sessions.StartFailed(*third);
  assert(sessions.tracing());

  using tracing::StartWatch;
  assert(tracing::NextStartWatch(true, true, true, 50) == StartWatch::kDone);
  assert(tracing::NextStartWatch(true, false, false, 0) == StartWatch::kDone);
  assert(tracing::NextStartWatch(false, false, true, 50) == StartWatch::kFailed);
  assert(tracing::NextStartWatch(false, true, false, 50) == StartWatch::kFailed);
  assert(tracing::NextStartWatch(false, true, true, 0) == StartWatch::kFailedAndStop);
  assert(tracing::NextStartWatch(false, true, true, -1) == StartWatch::kFailedAndStop);
  assert(tracing::NextStartWatch(false, true, true, 1) == StartWatch::kWait);
  assert(tracing::NextStartWatch(false, true, true, tracing::kStartChecks) == StartWatch::kWait);
  assert(tracing::kStartChecks * tracing::kStartCheckMs == 10000);

  assert(tracing::StopsAfterLateStart(true, true, false));
  assert(!tracing::StopsAfterLateStart(false, true, false));
  assert(!tracing::StopsAfterLateStart(true, false, false));
  assert(!tracing::StopsAfterLateStart(true, true, true));

  const std::string drafts = "/home/user/.config/ardia/Default/Ardia/Report Drafts";
  const std::string path = tracing::TracePath(drafts);
  assert(path == drafts + "/00000000-0000-0000-0000-000000000000/trace.json");
  assert(report::DraftFolderName(tracing::kTraceFolder));
  assert(report::InsideDrafts(drafts, path));
  assert(report::InsideDrafts(drafts, drafts + "/" + tracing::kTraceFolder));
  assert(tracing::TracePath("").empty());
  assert(tracing::TracePath("relative/Report Drafts").empty());
  assert(tracing::TracePath("/home/user/Report Drafts/").empty());
  std::puts("ok");
  return 0;
}
