#ifndef ARDIA_LINUX_AC_LINUX_CRX_DROP_CORE_H_
#define ARDIA_LINUX_AC_LINUX_CRX_DROP_CORE_H_

#include <cstddef>
#include <string>
#include <string_view>
#include <vector>

namespace ardia::linux_crx_drop {

inline constexpr char kFailedEvent[] = "extensions.installFailed";
inline constexpr const char* kCrxDropCapabilities[] = {"extensions.installFailed"};
inline constexpr size_t kMaxFiles = 64;
inline constexpr size_t kPathMaxBytes = 4096;
inline constexpr size_t kMessageMaxBytes = 2048;

constexpr bool CrxPath(std::string_view path) {
  constexpr std::string_view extension = ".crx";
  if (path.size() <= extension.size() || path.size() > kPathMaxBytes || path.front() != '/') return false;
  if (path.find('\0') != std::string_view::npos) return false;
  const std::string_view tail = path.substr(path.size() - extension.size());
  for (size_t index = 0; index < extension.size(); ++index) {
    const char c = tail[index];
    const char lower = c >= 'A' && c <= 'Z' ? static_cast<char>(c - 'A' + 'a') : c;
    if (lower != extension[index]) return false;
  }
  return true;
}

inline bool AllCrx(const std::vector<std::string>& paths) {
  if (paths.empty() || paths.size() > kMaxFiles) return false;
  for (const std::string& path : paths) {
    if (!CrxPath(path)) return false;
  }
  return true;
}

constexpr bool TakesDrop(bool all_crx, bool tab_shown_by_a_window, bool private_profile, bool installs_blocked) {
  return all_crx && tab_shown_by_a_window && !private_profile && !installs_blocked;
}

constexpr bool ReportsFailure(bool failed, bool cancelled_by_the_user) {
  return failed && !cancelled_by_the_user;
}

inline std::string Message(std::string_view raw) {
  if (raw.size() <= kMessageMaxBytes) return std::string(raw);
  size_t end = kMessageMaxBytes;
  while (end > 0 && (static_cast<unsigned char>(raw[end]) & 0xc0) == 0x80) --end;
  return std::string(raw.substr(0, end));
}

}

#endif
