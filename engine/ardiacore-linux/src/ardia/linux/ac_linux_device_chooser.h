#ifndef ARDIA_LINUX_AC_LINUX_DEVICE_CHOOSER_H_
#define ARDIA_LINUX_AC_LINUX_DEVICE_CHOOSER_H_

#include <string>
#include <string_view>

#include "base/functional/callback.h"
#include "base/values.h"

namespace content {
class WebContents;
}

namespace ardiacore {

struct LinuxChooserTab {
  int window = 0;
  std::string key;
};

struct LinuxDeviceChoosersDelegate {
  base::RepeatingCallback<LinuxChooserTab(content::WebContents*)> tab_for;
  base::RepeatingCallback<bool(int window, base::DictValue chooser)> deliver;
};

void StartLinuxDeviceChoosers(LinuxDeviceChoosersDelegate delegate);
bool LinuxDeviceChooserHandles(std::string_view name);
std::string LinuxDeviceChooserCall(int window, std::string_view name, const base::DictValue& input);
void LinuxDeviceChoosersWindowGone(int window);

}

#endif
