#include <cstdio>
#include <cstdlib>
#include <limits>

#include "ardia/linux/ac_linux_diagnostics.h"

using namespace ardia::linux_diagnostics;

namespace {

void Expect(bool condition, const char* what) {
  if (!condition) {
    std::fprintf(stderr, "failed: %s\n", what);
    std::abort();
  }
}

}

int main() {
  Expect(FootprintBytes(300ull << 20, 20ull << 20) == (320ull << 20), "anonymous memory plus what was swapped out");
  Expect(FootprintBytes(std::numeric_limits<uint64_t>::max(), 1) == std::numeric_limits<uint64_t>::max(), "no wrap");
  Expect(FootprintMB(0) == 0 && FootprintMB(1048575) == 0 && FootprintMB(1048576) == 1, "whole megabytes, cut as on the Mac");
  Expect(FootprintMB(734003200) == 700, "700 MB");
  Expect(FootprintMB(std::numeric_limits<uint64_t>::max()) == std::numeric_limits<int>::max(), "an absurd amount is capped");
  Expect(FreeDiskGB(0) == 0.0, "a full disk");
  Expect(FreeDiskGB(104857599) == 0.0 && FreeDiskGB(104857600) == 0.1, "tenths of a gigabyte, cut as on the Mac");
  Expect(FreeDiskGB(52428800000) == 50.0, "500 hundred-mebibyte steps read as 50");
  Expect(FreeDiskGB(8598323200 + 104857599) == 8.2, "cut to the tenth below, never rounded up");

  const base::DictValue empty = Reply({});
  Expect(empty.size() == 0, "nothing known is an empty sample, the answer the shell gave before");

  Sample both;
  both.footprint_bytes = 734003200;
  both.free_disk_bytes = 52428800000;
  const base::DictValue reply = Reply(both);
  Expect(reply.size() == 2, "the Mac's two fields");
  Expect(reply.FindInt("footprintMB") == 700, "footprintMB is a whole number");
  Expect(reply.FindDouble("freeDiskGB") == 50.0, "freeDiskGB");

  Sample memory_only;
  memory_only.footprint_bytes = 5ull << 20;
  const base::DictValue memory = Reply(memory_only);
  Expect(memory.size() == 1 && memory.FindInt("footprintMB") == 5, "a disk that can't be read is left out");

  Sample unread;
  unread.footprint_bytes = 0;
  unread.free_disk_bytes = -1;
  Expect(Reply(unread).size() == 0, "a zero footprint and a negative size are not answers");

  Sample full;
  full.free_disk_bytes = 0;
  const base::DictValue none_free = Reply(full);
  Expect(none_free.size() == 1 && none_free.FindDouble("freeDiskGB") == 0.0, "a full disk is an answer");
  std::puts("ok");
  return 0;
}
