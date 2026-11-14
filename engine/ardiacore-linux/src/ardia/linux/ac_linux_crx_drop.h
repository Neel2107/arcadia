#ifndef ARDIA_LINUX_AC_LINUX_CRX_DROP_H_
#define ARDIA_LINUX_AC_LINUX_CRX_DROP_H_

#include <string>

#include "base/functional/callback.h"

namespace content {
class WebContents;
}

namespace ardiacore {

struct LinuxCrxDropDelegate {
  base::RepeatingCallback<bool(content::WebContents*)> shown_by_a_window;
  base::RepeatingCallback<void(content::WebContents*, std::string message)> failed;
};

void StartLinuxCrxDrops(LinuxCrxDropDelegate delegate);

}

#endif
