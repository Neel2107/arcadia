#ifndef ARDIA_LINUX_AC_LINUX_MEDIA_SHARE_H_
#define ARDIA_LINUX_AC_LINUX_MEDIA_SHARE_H_

#include <cstddef>
#include <optional>
#include <string>
#include <string_view>
#include <vector>

namespace ardia::linux_media_share {

inline constexpr char kStopCaptureCall[] = "media.stopCapture";
inline constexpr char kChangeCaptureSourceCall[] = "media.changeCaptureSource";
inline constexpr char kTabShareEvent[] = "media.tabShare";
inline constexpr const char* kMediaShareCapabilities[] = {"media.stopCapture", "media.changeCaptureSource", "media.tabShare"};
inline constexpr size_t kTabIdMaxBytes = 256;
inline constexpr size_t kOriginMaxBytes = 2048;

constexpr bool Handles(std::string_view name) {
  return name == kStopCaptureCall || name == kChangeCaptureSourceCall;
}

constexpr bool ValidTabId(std::string_view id) {
  if (id.empty() || id.size() > kTabIdMaxBytes) return false;
  for (const char c : id) {
    const unsigned char byte = static_cast<unsigned char>(c);
    if (byte < 0x20 || byte == 0x7f) return false;
  }
  return true;
}

struct Capture {
  bool tab = false;
  bool window = false;
  bool display = false;
};

constexpr bool WasCapturing(const Capture& capture) {
  return capture.tab || capture.window || capture.display;
}

struct SharingBar {
  bool tab_sharing = false;
  bool for_capturer = false;
  bool offers_share_instead = false;
  bool share_instead_enabled = false;
};

inline std::optional<size_t> BarOfCapturer(const std::vector<SharingBar>& bars) {
  std::optional<size_t> found;
  for (size_t index = 0; index < bars.size(); ++index) {
    if (!bars[index].tab_sharing || !bars[index].for_capturer) continue;
    if (found) return std::nullopt;
    found = index;
  }
  return found;
}

inline std::optional<size_t> BarToShareInstead(const std::vector<SharingBar>& bars) {
  const std::optional<size_t> found = BarOfCapturer(bars);
  if (!found || !bars[*found].offers_share_instead || !bars[*found].share_instead_enabled) return std::nullopt;
  return found;
}

struct TabShare {
  std::string capturer;
  std::string captured;
  std::string origin;
};

inline std::optional<TabShare> ReportedTabShare(int capturer_window, std::string_view capturer, std::string_view captured,
                                                std::string_view origin) {
  if (capturer_window <= 0 || !ValidTabId(capturer) || !ValidTabId(captured)) return std::nullopt;
  TabShare share;
  share.capturer = std::string(capturer);
  share.captured = std::string(captured);
  if (origin.size() <= kOriginMaxBytes && origin != "null") share.origin = std::string(origin);
  return share;
}

}

#endif
