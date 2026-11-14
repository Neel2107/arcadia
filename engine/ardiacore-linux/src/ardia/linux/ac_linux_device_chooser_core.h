#ifndef ARDIA_LINUX_AC_LINUX_DEVICE_CHOOSER_CORE_H_
#define ARDIA_LINUX_AC_LINUX_DEVICE_CHOOSER_CORE_H_

#include <stddef.h>

#include <algorithm>
#include <optional>
#include <string>
#include <string_view>
#include <utility>
#include <vector>

#include "base/values.h"

namespace ardia::linux_device_chooser {

inline constexpr char kEvent[] = "media.deviceChooser";
inline constexpr char kSelectCall[] = "media.selectDevice";
inline constexpr char kCancelCall[] = "media.cancelDeviceChooser";
inline constexpr char kRefreshCall[] = "media.refreshDeviceChooser";
inline constexpr char kSettingsCall[] = "media.openBluetoothSettings";
inline constexpr const char* kDeviceChooserCapabilities[] = {
    "media.deviceChooser", "media.selectDevice", "media.cancelDeviceChooser", "media.refreshDeviceChooser",
    "media.openBluetoothSettings"};
inline constexpr size_t kMaxOptions = 512;
inline constexpr size_t kTextMaxBytes = 1024;
inline constexpr size_t kMaxOpen = 64;

enum class Action { kSelect, kCancel, kRefresh, kSettings };

constexpr std::optional<Action> ParseAction(std::string_view call) {
  if (call == kSelectCall) return Action::kSelect;
  if (call == kCancelCall) return Action::kCancel;
  if (call == kRefreshCall) return Action::kRefresh;
  if (call == kSettingsCall) return Action::kSettings;
  return std::nullopt;
}

struct Request {
  Action action = Action::kCancel;
  int id = 0;
  int index = -1;
};

inline std::optional<Request> ParseRequest(std::string_view call, const base::DictValue& input) {
  const std::optional<Action> action = ParseAction(call);
  if (!action) return std::nullopt;
  const std::optional<int> id = input.FindInt("id");
  if (!id || *id <= 0) return std::nullopt;
  Request request;
  request.action = *action;
  request.id = *id;
  if (*action != Action::kSelect) return input.size() == 1 ? std::optional<Request>(request) : std::nullopt;
  const std::optional<int> index = input.FindInt("index");
  if (!index || input.size() != 2) return std::nullopt;
  request.index = *index;
  return request;
}

inline std::optional<std::vector<size_t>> SelectedIndices(int index, size_t options, bool both_buttons_always_enabled) {
  if (index >= 0 && static_cast<size_t>(index) < options) return std::vector<size_t>{static_cast<size_t>(index)};
  if (!both_buttons_always_enabled) return std::nullopt;
  return std::vector<size_t>();
}

constexpr bool MayAnswer(int caller_window, int chooser_window) {
  return caller_window > 0 && caller_window == chooser_window;
}

inline std::string Text(std::string_view raw) {
  if (raw.size() <= kTextMaxBytes) return std::string(raw);
  size_t end = kTextMaxBytes;
  while (end > 0 && (static_cast<unsigned char>(raw[end]) & 0xc0) == 0x80) --end;
  return std::string(raw.substr(0, end));
}

struct Option {
  std::string name;
  bool connected = false;
  bool paired = false;
  int signal = -1;
};

struct State {
  int id = 0;
  bool open = false;
  std::string title;
  std::string ok_label;
  std::string cancel_label;
  std::string no_options_text;
  std::string scanning_text;
  bool refreshing = false;
  bool can_refresh = false;
  bool adapter_off = false;
  bool unauthorized = false;
  bool both_buttons_enabled = false;
  bool show_signal = false;
  std::vector<Option> options;
};

inline base::DictValue Event(const State& state, std::string_view tab_id) {
  base::ListValue options;
  base::DictValue event;
  event.Set("id", state.id);
  event.Set("open", state.open);
  if (tab_id.empty()) {
    event.Set("tabId", base::Value());
  } else {
    event.Set("tabId", std::string(tab_id));
  }
  if (state.open) {
    event.Set("title", Text(state.title));
    event.Set("okLabel", Text(state.ok_label));
    event.Set("cancelLabel", Text(state.cancel_label));
    event.Set("noOptionsText", Text(state.no_options_text));
    event.Set("scanningText", Text(state.scanning_text));
    event.Set("refreshing", state.refreshing);
    event.Set("canRefresh", state.can_refresh);
    event.Set("adapterOff", state.adapter_off);
    event.Set("unauthorized", state.unauthorized);
    event.Set("bothButtonsEnabled", state.both_buttons_enabled);
    event.Set("showSignal", state.show_signal);
    const size_t count = std::min(state.options.size(), kMaxOptions);
    for (size_t index = 0; index < count; ++index) {
      const Option& option = state.options[index];
      options.Append(base::DictValue()
          .Set("name", Text(option.name))
          .Set("connected", option.connected)
          .Set("paired", option.paired)
          .Set("signal", state.show_signal ? option.signal : -1));
    }
  }
  event.Set("options", std::move(options));
  return event;
}

}

#endif
