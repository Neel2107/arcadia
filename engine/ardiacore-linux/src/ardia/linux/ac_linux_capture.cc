#include "ardia/linux/ac_linux_capture.h"

#include <optional>
#include <utility>
#include <vector>

#include "ardia/linux/ac_linux_media_share.h"
#include "base/memory/scoped_refptr.h"
#include "base/no_destructor.h"
#include "chrome/browser/media/webrtc/media_capture_devices_dispatcher.h"
#include "chrome/browser/media/webrtc/media_stream_capture_indicator.h"
#include "chrome/browser/ui/tab_sharing/tab_sharing_infobar_delegate.h"
#include "components/infobars/content/content_infobar_manager.h"
#include "components/infobars/core/infobar.h"
#include "components/infobars/core/infobar_delegate.h"
#include "content/public/browser/browser_thread.h"
#include "content/public/browser/global_routing_id.h"
#include "content/public/browser/render_frame_host.h"
#include "content/public/browser/web_contents.h"

extern void (*g_ardia_linux_tab_share_started)(content::GlobalRenderFrameHostId capturer,
                                               content::WebContents* shared_tab);

namespace ardiacore {
namespace {

namespace share = ardia::linux_media_share;

LinuxTabShareStarted& Started() {
  static base::NoDestructor<LinuxTabShareStarted> started;
  return *started;
}

void TabShareStarted(content::GlobalRenderFrameHostId capturer, content::WebContents* shared_tab) {
  DCHECK_CURRENTLY_ON(content::BrowserThread::UI);
  content::RenderFrameHost* frame = content::RenderFrameHost::FromID(capturer);
  content::WebContents* capturing = frame ? content::WebContents::FromRenderFrameHost(frame) : nullptr;
  if (capturing && shared_tab && Started()) Started().Run(capturing, shared_tab);
}

}

bool StopLinuxCapture(content::WebContents* capturer) {
  DCHECK_CURRENTLY_ON(content::BrowserThread::UI);
  if (!capturer) return false;
  scoped_refptr<MediaStreamCaptureIndicator> indicator =
      MediaCaptureDevicesDispatcher::GetInstance()->GetMediaStreamCaptureIndicator();
  const bool capturing = share::WasCapturing({indicator->IsCapturingTab(capturer), indicator->IsCapturingWindow(capturer),
                                              indicator->IsCapturingDisplay(capturer)});
  indicator->StopMediaCapturing(capturer, MediaStreamCaptureIndicator::MediaType::kDisplayMedia);
  return capturing;
}

bool ShareLinuxTabInstead(content::WebContents* target, content::WebContents* capturer) {
  DCHECK_CURRENTLY_ON(content::BrowserThread::UI);
  infobars::ContentInfoBarManager* manager =
      target && capturer ? infobars::ContentInfoBarManager::FromWebContents(target) : nullptr;
  if (!manager) return false;
  std::vector<share::SharingBar> bars;
  std::vector<TabSharingInfoBarDelegate*> delegates;
  for (infobars::InfoBar* infobar : manager->infobars()) {
    share::SharingBar bar;
    TabSharingInfoBarDelegate* sharing = nullptr;
    if (infobar->delegate()->GetIdentifier() == infobars::InfoBarDelegate::TAB_SHARING_INFOBAR_DELEGATE) {
      sharing = static_cast<TabSharingInfoBarDelegate*>(infobar->delegate());
      content::RenderFrameHost* frame = content::RenderFrameHost::FromID(sharing->capturer_id());
      bar.tab_sharing = true;
      bar.for_capturer = frame && content::WebContents::FromRenderFrameHost(frame) == capturer;
      bar.offers_share_instead = (sharing->GetButtons() & TabSharingInfoBarDelegate::kShareThisTabInstead) != 0;
      bar.share_instead_enabled =
          bar.offers_share_instead && sharing->IsButtonEnabled(TabSharingInfoBarDelegate::kShareThisTabInstead);
    }
    bars.push_back(bar);
    delegates.push_back(sharing);
  }
  const std::optional<size_t> chosen = share::BarToShareInstead(bars);
  if (!chosen) return false;
  delegates[*chosen]->ShareThisTabInstead();
  return true;
}

void WatchLinuxTabShares(LinuxTabShareStarted started) {
  DCHECK_CURRENTLY_ON(content::BrowserThread::UI);
  Started() = std::move(started);
  g_ardia_linux_tab_share_started = &TabShareStarted;
}

}
