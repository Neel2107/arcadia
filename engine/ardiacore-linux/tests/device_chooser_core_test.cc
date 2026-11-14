#include <cstdio>
#include <cstdlib>
#include <string>
#include <vector>

#include "ardia/linux/ac_linux_device_chooser_core.h"

namespace chooser = ardia::linux_device_chooser;

namespace {

void Expect(bool condition, const char* what) {
  if (!condition) {
    std::fprintf(stderr, "failed: %s\n", what);
    std::abort();
  }
}

base::DictValue Input(int id) {
  base::DictValue input;
  input.Set("id", id);
  return input;
}

}

int main() {
  using chooser::Action;
  Expect(chooser::ParseAction("media.selectDevice") == Action::kSelect, "select");
  Expect(chooser::ParseAction("media.cancelDeviceChooser") == Action::kCancel, "cancel");
  Expect(chooser::ParseAction("media.refreshDeviceChooser") == Action::kRefresh, "refresh");
  Expect(chooser::ParseAction("media.openBluetoothSettings") == Action::kSettings, "settings");
  for (const char* other : {"", "media.deviceChooser", "media.selectdevice", "selectDevice", "media.stopCapture"}) {
    Expect(!chooser::ParseAction(other), "an unknown call is not a chooser call");
  }

  auto select = Input(7);
  select.Set("index", 2);
  const auto parsed = chooser::ParseRequest("media.selectDevice", select);
  Expect(parsed && parsed->action == Action::kSelect && parsed->id == 7 && parsed->index == 2, "a selection parses");
  auto negative = Input(7);
  negative.Set("index", -1);
  const auto none = chooser::ParseRequest("media.selectDevice", negative);
  Expect(none && none->index == -1, "an index of -1 is the Mac's way to confirm without a row");
  Expect(!chooser::ParseRequest("media.selectDevice", Input(7)), "a selection needs an index");
  auto text_index = Input(7);
  text_index.Set("index", std::string("2"));
  Expect(!chooser::ParseRequest("media.selectDevice", text_index), "an index is a number");
  auto extra = Input(7);
  extra.Set("index", 2);
  extra.Set("tabId", std::string("t1"));
  Expect(!chooser::ParseRequest("media.selectDevice", extra), "no extra keys on a selection");
  Expect(!chooser::ParseRequest("media.selectDevice", base::DictValue()), "an id is required");
  Expect(!chooser::ParseRequest("media.cancelDeviceChooser", Input(0)), "ids start at 1");
  Expect(!chooser::ParseRequest("media.cancelDeviceChooser", Input(-4)), "ids are positive");
  const auto cancel = chooser::ParseRequest("media.cancelDeviceChooser", Input(9));
  Expect(cancel && cancel->action == Action::kCancel && cancel->id == 9, "a cancel parses");
  Expect(!chooser::ParseRequest("media.cancelDeviceChooser", select), "no extra keys on a cancel");
  Expect(chooser::ParseRequest("media.refreshDeviceChooser", Input(1)).has_value(), "a refresh parses");
  Expect(chooser::ParseRequest("media.openBluetoothSettings", Input(1)).has_value(), "a settings call parses");
  Expect(!chooser::ParseRequest("media.stopCapture", Input(1)), "another call is refused");

  const auto one = chooser::SelectedIndices(1, 3, false);
  Expect(one && *one == std::vector<size_t>{1}, "a row in range is selected");
  Expect(!chooser::SelectedIndices(3, 3, false), "a row past the end is ignored");
  Expect(!chooser::SelectedIndices(-1, 3, false), "no row is ignored when a row is required");
  Expect(!chooser::SelectedIndices(0, 0, false), "an empty list has no rows");
  const auto empty = chooser::SelectedIndices(-1, 3, true);
  Expect(empty && empty->empty(), "a chooser whose buttons are always on may be confirmed with no row");
  const auto past = chooser::SelectedIndices(99, 3, true);
  Expect(past && past->empty(), "a bad row with always-on buttons confirms with no row, as on the Mac");

  Expect(chooser::MayAnswer(4, 4), "the window that shows the chooser answers it");
  Expect(!chooser::MayAnswer(4, 5) && !chooser::MayAnswer(0, 0) && !chooser::MayAnswer(-1, -1),
         "another window, or no window, does not");

  Expect(chooser::Text("Pixel Buds") == "Pixel Buds", "text passes through");
  Expect(chooser::Text("caf\xc3\xa9") == "caf\xc3\xa9", "a complete character at the end is kept");
  Expect(chooser::Text(std::string(5000, 'x')).size() == chooser::kTextMaxBytes, "text is bounded");
  const std::string split = std::string(chooser::kTextMaxBytes - 1, 'x') + "\xc3\xa9" + "tail";
  Expect(chooser::Text(split) == std::string(chooser::kTextMaxBytes - 1, 'x'), "a cut never splits a character");

  chooser::State closed;
  closed.id = 12;
  const base::DictValue closed_event = chooser::Event(closed, "tab-1");
  Expect(closed_event.size() == 4, "a closed chooser carries only id, open, tabId and options");
  Expect(closed_event.FindInt("id") == 12 && closed_event.FindBool("open") == false, "closed id and state");
  Expect(*closed_event.FindString("tabId") == "tab-1", "closed tab");
  Expect(closed_event.FindList("options") && closed_event.FindList("options")->size() == 0, "closed options");

  chooser::State open;
  open.id = 13;
  open.open = true;
  open.title = "example.com wants to pair";
  open.ok_label = "Pair";
  open.cancel_label = "Cancel";
  open.no_options_text = "No compatible devices found.";
  open.scanning_text = "Scanning for devices…";
  open.refreshing = true;
  open.can_refresh = true;
  open.both_buttons_enabled = false;
  open.show_signal = true;
  open.options = {{"Headset", true, true, 4}, {"Mouse", false, false, 1}};
  const base::DictValue event = chooser::Event(open, "");
  for (const char* key : {"id", "tabId", "open", "title", "okLabel", "cancelLabel", "noOptionsText", "scanningText",
                          "refreshing", "canRefresh", "adapterOff", "unauthorized", "bothButtonsEnabled", "showSignal",
                          "options"}) {
    Expect(event.Find(key) != nullptr, key);
  }
  Expect(event.size() == 15, "exactly the shared DeviceChooser fields");
  Expect(event.Find("tabId")->is_none(), "a chooser with no tab says null, as the Mac does");
  Expect(*event.FindString("title") == "example.com wants to pair" && *event.FindString("okLabel") == "Pair", "labels");
  Expect(event.FindBool("refreshing") == true && event.FindBool("canRefresh") == true, "refresh state");
  Expect(event.FindBool("adapterOff") == false && event.FindBool("unauthorized") == false, "adapter state");
  const base::ListValue* options = event.FindList("options");
  Expect(options && options->size() == 2, "two rows");
  const base::DictValue& first = (*options)[0].GetDict();
  Expect(first.size() == 4 && *first.FindString("name") == "Headset" && first.FindBool("connected") == true &&
             first.FindBool("paired") == true && first.FindInt("signal") == 4,
         "a row has name, connected, paired and signal");

  open.show_signal = false;
  const base::DictValue plain = chooser::Event(open, "tab-2");
  Expect((*plain.FindList("options"))[0].GetDict().FindInt("signal") == -1, "no signal column means -1");

  open.options.assign(chooser::kMaxOptions + 50, chooser::Option{"Device", false, false, 0});
  Expect(chooser::Event(open, "tab-2").FindList("options")->size() == chooser::kMaxOptions, "rows are bounded");
  std::puts("ok");
  return 0;
}
