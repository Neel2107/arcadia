#ifndef ARDIA_LINUX_AC_LINUX_CAPTURE_H_
#define ARDIA_LINUX_AC_LINUX_CAPTURE_H_

#include "base/functional/callback.h"

namespace content {
class WebContents;
}

namespace ardiacore {

using LinuxTabShareStarted =
    base::RepeatingCallback<void(content::WebContents* capturer, content::WebContents* shared)>;

bool StopLinuxCapture(content::WebContents* capturer);
bool ShareLinuxTabInstead(content::WebContents* target, content::WebContents* capturer);
void WatchLinuxTabShares(LinuxTabShareStarted started);

}

#endif
