#include <cassert>
#include <cstdio>
#include <string>
#include <vector>

#include "ardia/linux/ac_linux_media_share.h"

namespace share = ardia::linux_media_share;

int main() {
  assert(share::Handles("media.stopCapture") && share::Handles("media.changeCaptureSource"));
  for (const char* other : {"", "media.tabShare", "media.stopCapture ", "media.stopcapture", "media.showCastDialog",
                            "media.displayMediaSources", "stopCapture"}) {
    assert(!share::Handles(other));
  }

  assert(share::ValidTabId("t1") && share::ValidTabId("tab-9f3c") && share::ValidTabId(std::string(256, 'a')));
  assert(!share::ValidTabId("") && !share::ValidTabId(std::string(257, 'a')));
  assert(!share::ValidTabId(std::string("a\0b", 3)) && !share::ValidTabId("a\nb") && !share::ValidTabId("a\x7f"));

  assert(!share::WasCapturing({}));
  assert(share::WasCapturing({true, false, false}));
  assert(share::WasCapturing({false, true, false}));
  assert(share::WasCapturing({false, false, true}));

  using Bar = share::SharingBar;
  const Bar other_bar{false, false, false, false};
  const Bar mine{true, true, true, true};
  const Bar theirs{true, false, true, true};
  const Bar mine_disabled{true, true, true, false};
  const Bar mine_stop_only{true, true, false, false};
  assert(!share::BarToShareInstead({}));
  assert(!share::BarToShareInstead({other_bar}));
  assert(!share::BarToShareInstead({theirs}));
  assert(share::BarToShareInstead({mine}) == 0u);
  assert(share::BarToShareInstead({other_bar, theirs, mine}) == 2u);
  assert(!share::BarToShareInstead({mine, mine}));
  assert(!share::BarToShareInstead({mine, mine_disabled}));
  assert(!share::BarToShareInstead({mine_disabled}));
  assert(!share::BarToShareInstead({mine_stop_only}));
  assert(share::BarOfCapturer({mine_stop_only}) == 0u);
  const Bar not_sharing_but_marked{false, true, true, true};
  assert(!share::BarToShareInstead({not_sharing_but_marked}));

  const auto reported = share::ReportedTabShare(3, "capturer", "captured", "https://meet.example");
  assert(reported && reported->capturer == "capturer" && reported->captured == "captured" &&
         reported->origin == "https://meet.example");
  assert(!share::ReportedTabShare(0, "capturer", "captured", "https://meet.example"));
  assert(!share::ReportedTabShare(-1, "capturer", "captured", "https://meet.example"));
  assert(!share::ReportedTabShare(3, "", "captured", "https://meet.example"));
  assert(!share::ReportedTabShare(3, "capturer", "", "https://meet.example"));
  const auto opaque = share::ReportedTabShare(3, "capturer", "captured", "null");
  assert(opaque && opaque->origin.empty());
  const auto long_origin = share::ReportedTabShare(3, "capturer", "captured", std::string(4096, 'a'));
  assert(long_origin && long_origin->origin.empty());
  std::puts("ok");
  return 0;
}
