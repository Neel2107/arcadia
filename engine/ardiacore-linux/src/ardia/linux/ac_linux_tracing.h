#ifndef ARDIA_LINUX_AC_LINUX_TRACING_H_
#define ARDIA_LINUX_AC_LINUX_TRACING_H_

#include <string_view>

#include "base/files/file_path.h"
#include "base/functional/callback.h"
#include "base/values.h"

namespace ardiacore {

bool LinuxTracingHandles(std::string_view name);
void LinuxTracingCall(std::string_view name, const base::DictValue& input, const base::FilePath& documents,
                      base::OnceCallback<void(bool, base::Value)> done);

}

#endif
