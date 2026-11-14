#include "ardia/linux/ac_linux_device_chooser.h"

#include <algorithm>
#include <map>
#include <memory>
#include <optional>
#include <string>
#include <string_view>
#include <utility>
#include <vector>

#include "ardia/linux/ac_linux_device_chooser_core.h"
#include "base/functional/bind.h"
#include "base/functional/callback_helpers.h"
#include "base/location.h"
#include "base/memory/weak_ptr.h"
#include "base/no_destructor.h"
#include "base/strings/utf_string_conversions.h"
#include "base/task/single_thread_task_runner.h"
#include "components/permissions/chooser_controller.h"
#include "content/public/browser/browser_thread.h"
#include "content/public/browser/web_contents.h"

extern bool (*g_ardia_device_chooser)(content::WebContents* contents,
                                      std::unique_ptr<permissions::ChooserController>* controller,
                                      base::ScopedClosureRunner* fullscreen_blocker,
                                      base::OnceClosure* close_closure);

namespace ardiacore {
namespace {

namespace chooser = ardia::linux_device_chooser;

class DeviceChooser;

LinuxDeviceChoosersDelegate& Delegate() {
  static base::NoDestructor<LinuxDeviceChoosersDelegate> delegate;
  return *delegate;
}

std::map<int, std::unique_ptr<DeviceChooser>>& Live() {
  static base::NoDestructor<std::map<int, std::unique_ptr<DeviceChooser>>> live;
  return *live;
}

LinuxChooserTab TabFor(content::WebContents* contents) {
  return contents && Delegate().tab_for ? Delegate().tab_for.Run(contents) : LinuxChooserTab();
}

bool Deliver(int window, base::DictValue event) {
  return window > 0 && Delegate().deliver && Delegate().deliver.Run(window, std::move(event));
}

void Release(std::unique_ptr<permissions::ChooserController> controller) {
  base::SingleThreadTaskRunner::GetCurrentDefault()->PostTask(
      FROM_HERE, base::BindOnce([](std::unique_ptr<permissions::ChooserController>) {}, std::move(controller)));
}

class DeviceChooser : public permissions::ChooserController::View {
 public:
  DeviceChooser(std::unique_ptr<permissions::ChooserController> controller, content::WebContents* contents,
                base::ScopedClosureRunner fullscreen_blocker)
      : controller_(std::move(controller)),
        contents_(contents->GetWeakPtr()),
        fullscreen_blocker_(std::move(fullscreen_blocker)) {
    static int last_id = 0;
    id_ = ++last_id;
    controller_->set_view(this);
  }
  ~DeviceChooser() override {
    if (controller_) controller_->set_view(nullptr);
  }

  int id() const { return id_; }
  int window() const { return window_; }
  bool open() const { return open_ && controller_; }
  base::WeakPtr<DeviceChooser> GetWeakPtr() { return weak_factory_.GetWeakPtr(); }

  void Select(int index) {
    if (!open()) return;
    const std::optional<std::vector<size_t>> indices =
        chooser::SelectedIndices(index, controller_->NumOptions(), controller_->BothButtonsAlwaysEnabled());
    if (!indices) return;
    std::unique_ptr<permissions::ChooserController> controller = Finish();
    controller->Select(*indices);
    Release(std::move(controller));
  }

  void Cancel() {
    if (!open()) return;
    std::unique_ptr<permissions::ChooserController> controller = Finish();
    controller->Cancel();
    Release(std::move(controller));
  }

  void Refresh() {
    if (open()) controller_->RefreshOptions();
  }

  void CloseFromChrome() {
    if (open()) Release(Finish());
  }

  void Announce() {
    announced_ = true;
    Changed();
  }

  void CancelSoon() {
    base::SingleThreadTaskRunner::GetCurrentDefault()->PostTask(
        FROM_HERE, base::BindOnce([](base::WeakPtr<DeviceChooser> self) {
          if (self) self->Cancel();
        }, GetWeakPtr()));
  }

  void OnOptionsInitialized() override { Changed(); }
  void OnOptionAdded(size_t index) override { Changed(); }
  void OnOptionRemoved(size_t index) override { Changed(); }
  void OnOptionUpdated(size_t index) override { Changed(); }
  void OnAdapterEnabledChanged(bool enabled) override {
    adapter_on_ = enabled;
    Changed();
  }
  void OnAdapterAuthorizationChanged(bool authorized) override {
    authorized_ = authorized;
    Changed();
  }
  void OnRefreshStateChanged(bool refreshing) override {
    refreshing_ = refreshing;
    Changed();
  }

 private:
  chooser::State State() const {
    chooser::State state;
    state.id = id_;
    state.open = open();
    if (!state.open) return state;
    permissions::ChooserController* controller = controller_.get();
    state.title = base::UTF16ToUTF8(controller->GetTitle());
    state.ok_label = base::UTF16ToUTF8(controller->GetOkButtonLabel());
    state.cancel_label = base::UTF16ToUTF8(controller->GetCancelButtonLabel());
    state.no_options_text = base::UTF16ToUTF8(controller->GetNoOptionsText());
    state.scanning_text = base::UTF16ToUTF8(controller->GetThrobberLabelAndTooltip().first);
    state.refreshing = refreshing_;
    state.can_refresh = controller->ShouldShowReScanButton();
    state.adapter_off = controller->ShouldShowAdapterOffView() && !adapter_on_;
    state.unauthorized = controller->ShouldShowAdapterUnauthorizedView() && !authorized_;
    state.both_buttons_enabled = controller->BothButtonsAlwaysEnabled();
    state.show_signal = controller->ShouldShowIconBeforeText();
    const size_t count = std::min(controller->NumOptions(), chooser::kMaxOptions);
    for (size_t index = 0; index < count; ++index) {
      chooser::Option option;
      option.name = base::UTF16ToUTF8(controller->GetOption(index));
      option.connected = controller->IsConnected(index);
      option.paired = controller->IsPaired(index);
      option.signal = state.show_signal ? controller->GetSignalStrengthLevel(index) : -1;
      state.options.push_back(std::move(option));
    }
    return state;
  }

  void Changed() {
    if (!announced_) return;
    const LinuxChooserTab tab = TabFor(contents_.get());
    if (window_ > 0 && window_ != tab.window) {
      chooser::State closed;
      closed.id = id_;
      Deliver(window_, chooser::Event(closed, key_));
    }
    window_ = tab.window;
    key_ = tab.key;
    const bool delivered = Deliver(window_, chooser::Event(State(), key_));
    if (!delivered && open()) CancelSoon();
  }

  std::unique_ptr<permissions::ChooserController> Finish() {
    open_ = false;
    Changed();
    controller_->set_view(nullptr);
    std::unique_ptr<permissions::ChooserController> controller = std::move(controller_);
    base::SingleThreadTaskRunner::GetCurrentDefault()->PostTask(
        FROM_HERE, base::BindOnce([](int id) { Live().erase(id); }, id_));
    return controller;
  }

  std::unique_ptr<permissions::ChooserController> controller_;
  base::WeakPtr<content::WebContents> contents_;
  base::ScopedClosureRunner fullscreen_blocker_;
  int id_ = 0;
  int window_ = 0;
  std::string key_;
  bool open_ = true;
  bool announced_ = false;
  bool refreshing_ = false;
  bool adapter_on_ = true;
  bool authorized_ = true;
  base::WeakPtrFactory<DeviceChooser> weak_factory_{this};
};

DeviceChooser* Find(int id) {
  const auto found = Live().find(id);
  return found == Live().end() ? nullptr : found->second.get();
}

bool HandleDeviceChooser(content::WebContents* contents,
                         std::unique_ptr<permissions::ChooserController>* controller,
                         base::ScopedClosureRunner* fullscreen_blocker,
                         base::OnceClosure* close_closure) {
  DCHECK_CURRENTLY_ON(content::BrowserThread::UI);
  if (!contents || !controller || !*controller || !fullscreen_blocker || !close_closure ||
      Live().size() >= chooser::kMaxOpen || TabFor(contents).window <= 0) {
    return false;
  }
  auto adopted = std::make_unique<DeviceChooser>(std::move(*controller), contents, std::move(*fullscreen_blocker));
  DeviceChooser* raw = adopted.get();
  Live()[raw->id()] = std::move(adopted);
  base::SingleThreadTaskRunner::GetCurrentDefault()->PostTask(
      FROM_HERE, base::BindOnce([](base::WeakPtr<DeviceChooser> self) {
        if (self) self->Announce();
      }, raw->GetWeakPtr()));
  *close_closure = base::BindOnce([](base::WeakPtr<DeviceChooser> self) {
    if (self) self->CloseFromChrome();
  }, raw->GetWeakPtr());
  return true;
}

}

void StartLinuxDeviceChoosers(LinuxDeviceChoosersDelegate delegate) {
  DCHECK_CURRENTLY_ON(content::BrowserThread::UI);
  Delegate() = std::move(delegate);
  g_ardia_device_chooser = &HandleDeviceChooser;
}

bool LinuxDeviceChooserHandles(std::string_view name) {
  return chooser::ParseAction(name).has_value();
}

std::string LinuxDeviceChooserCall(int window, std::string_view name, const base::DictValue& input) {
  DCHECK_CURRENTLY_ON(content::BrowserThread::UI);
  const std::optional<chooser::Request> request = chooser::ParseRequest(name, input);
  if (!request) {
    return name == chooser::kSelectCall ? "A device choice requires {id, index}" : "A device chooser call requires {id}";
  }
  DeviceChooser* found = Find(request->id);
  if (!found || !found->open()) return std::string();
  if (!chooser::MayAnswer(window, found->window())) return "The device chooser belongs to another window";
  switch (request->action) {
    case chooser::Action::kSelect:
      found->Select(request->index);
      break;
    case chooser::Action::kCancel:
      found->Cancel();
      break;
    case chooser::Action::kRefresh:
      found->Refresh();
      break;
    case chooser::Action::kSettings:
      break;
  }
  return std::string();
}

void LinuxDeviceChoosersWindowGone(int window) {
  for (const auto& [id, live] : Live()) {
    if (live->window() == window) live->CancelSoon();
  }
}

}
