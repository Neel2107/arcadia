#include <cassert>
#include <cstdio>
#include <string>
#include <vector>

#include "ardia/linux/ac_linux_crx_drop_core.h"

namespace drop = ardia::linux_crx_drop;

int main() {
  assert(drop::CrxPath("/home/user/Downloads/extension.crx"));
  assert(drop::CrxPath("/home/user/Downloads/EXTENSION.CRX"));
  assert(drop::CrxPath("/tmp/a b/with space.Crx"));
  assert(drop::CrxPath("/tmp/.crx"));
  assert(!drop::CrxPath(""));
  assert(!drop::CrxPath(".crx"));
  assert(!drop::CrxPath("extension.crx"));
  assert(!drop::CrxPath("relative/extension.crx"));
  assert(!drop::CrxPath("/home/user/extension.crx.zip"));
  assert(!drop::CrxPath("/home/user/extension.crx/"));
  assert(!drop::CrxPath("/home/user/extensioncrx"));
  assert(!drop::CrxPath("/home/user/photo.png"));
  assert(!drop::CrxPath(std::string("/home/user/a\0.crx", 17)));
  assert(!drop::CrxPath("/" + std::string(drop::kPathMaxBytes, 'a') + ".crx"));

  assert(!drop::AllCrx({}));
  assert(drop::AllCrx({"/a/one.crx"}));
  assert(drop::AllCrx({"/a/one.crx", "/b/two.CRX"}));
  assert(!drop::AllCrx({"/a/one.crx", "/b/notes.txt"}));
  assert(!drop::AllCrx({"/b/notes.txt"}));
  assert(drop::AllCrx(std::vector<std::string>(drop::kMaxFiles, "/a/one.crx")));
  assert(!drop::AllCrx(std::vector<std::string>(drop::kMaxFiles + 1, "/a/one.crx")));

  assert(drop::TakesDrop(true, true, false, false));
  assert(!drop::TakesDrop(false, true, false, false));
  assert(!drop::TakesDrop(true, false, false, false));
  assert(!drop::TakesDrop(true, true, true, false));
  assert(!drop::TakesDrop(true, true, false, true));

  assert(drop::ReportsFailure(true, false));
  assert(!drop::ReportsFailure(false, false));
  assert(!drop::ReportsFailure(true, true));
  assert(!drop::ReportsFailure(false, true));

  assert(drop::Message("Package is invalid: 'CRX_HEADER_INVALID'.") == "Package is invalid: 'CRX_HEADER_INVALID'.");
  assert(drop::Message("").empty());
  assert(drop::Message(std::string(5000, 'x')).size() == drop::kMessageMaxBytes);
  const std::string split = std::string(drop::kMessageMaxBytes - 1, 'x') + "\xc3\xa9" + "tail";
  assert(drop::Message(split) == std::string(drop::kMessageMaxBytes - 1, 'x'));
  std::puts("ok");
  return 0;
}
