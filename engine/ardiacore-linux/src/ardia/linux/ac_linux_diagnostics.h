#ifndef ARDIA_LINUX_AC_LINUX_DIAGNOSTICS_H_
#define ARDIA_LINUX_AC_LINUX_DIAGNOSTICS_H_

#include <stdint.h>

#include <limits>
#include <optional>

#include "base/values.h"

namespace ardia::linux_diagnostics {

inline constexpr char kSampleCall[] = "ArdiaApp.diagnosticsSample";
inline constexpr const char* kDiagnosticsCapabilities[] = {"ArdiaApp.diagnosticsSample"};
inline constexpr uint64_t kBytesPerMB = 1048576;
inline constexpr int64_t kBytesPerTenthGB = 104857600;

struct Sample {
  std::optional<uint64_t> footprint_bytes;
  std::optional<int64_t> free_disk_bytes;
};

constexpr uint64_t FootprintBytes(uint64_t anonymous_resident_bytes, uint64_t swapped_bytes) {
  return swapped_bytes > std::numeric_limits<uint64_t>::max() - anonymous_resident_bytes
             ? std::numeric_limits<uint64_t>::max()
             : anonymous_resident_bytes + swapped_bytes;
}

constexpr int FootprintMB(uint64_t bytes) {
  const uint64_t megabytes = bytes / kBytesPerMB;
  return megabytes > static_cast<uint64_t>(std::numeric_limits<int>::max()) ? std::numeric_limits<int>::max()
                                                                            : static_cast<int>(megabytes);
}

constexpr double FreeDiskGB(int64_t bytes) {
  return static_cast<double>(bytes / kBytesPerTenthGB) / 10;
}

inline base::DictValue Reply(const Sample& sample) {
  base::DictValue reply;
  if (sample.footprint_bytes && *sample.footprint_bytes > 0) reply.Set("footprintMB", FootprintMB(*sample.footprint_bytes));
  if (sample.free_disk_bytes && *sample.free_disk_bytes >= 0) reply.Set("freeDiskGB", FreeDiskGB(*sample.free_disk_bytes));
  return reply;
}

}

#endif
