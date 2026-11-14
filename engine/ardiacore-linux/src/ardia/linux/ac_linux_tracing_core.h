#ifndef ARDIA_LINUX_AC_LINUX_TRACING_CORE_H_
#define ARDIA_LINUX_AC_LINUX_TRACING_CORE_H_

#include <optional>
#include <string>
#include <string_view>

namespace ardia::linux_tracing {

inline constexpr char kBeginCall[] = "engine.beginTracing";
inline constexpr char kEndCall[] = "engine.endTracing";
inline constexpr char kIsTracingCall[] = "engine.isTracing";
inline constexpr const char* kTracingCapabilities[] = {"engine.beginTracing", "engine.endTracing", "engine.isTracing"};
inline constexpr int kStartChecks = 100;
inline constexpr int kStartCheckMs = 100;
inline constexpr char kTraceFolder[] = "00000000-0000-0000-0000-000000000000";
inline constexpr char kTraceFile[] = "trace.json";

constexpr bool Handles(std::string_view name) {
  return name == kBeginCall || name == kEndCall || name == kIsTracingCall;
}

class Sessions {
 public:
  bool tracing() const { return tracing_; }
  bool Current(int session) const { return session == session_; }

  std::optional<int> Begin() {
    if (tracing_) return std::nullopt;
    tracing_ = true;
    return ++session_;
  }

  void StartFailed(int session) {
    if (Current(session)) tracing_ = false;
  }

  bool End() {
    if (!tracing_) return false;
    tracing_ = false;
    ++session_;
    return true;
  }

 private:
  bool tracing_ = false;
  int session_ = 0;
};

enum class StartWatch { kDone, kFailed, kFailedAndStop, kWait };

constexpr StartWatch NextStartWatch(bool answered, bool current, bool engine_tracing, int checks_left) {
  if (answered) return StartWatch::kDone;
  if (!current || !engine_tracing) return StartWatch::kFailed;
  if (checks_left <= 0) return StartWatch::kFailedAndStop;
  return StartWatch::kWait;
}

constexpr bool StopsAfterLateStart(bool answered, bool current, bool tracing) {
  return answered && current && !tracing;
}

inline std::string TracePath(std::string_view drafts) {
  if (drafts.empty() || drafts.front() != '/' || drafts.back() == '/') return std::string();
  std::string path(drafts);
  path += '/';
  path += kTraceFolder;
  path += '/';
  path += kTraceFile;
  return path;
}

}

#endif
