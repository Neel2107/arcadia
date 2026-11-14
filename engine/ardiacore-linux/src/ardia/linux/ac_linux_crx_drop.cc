#include "ardia/linux/ac_linux_crx_drop.h"

#include <memory>
#include <optional>
#include <string>
#include <utility>
#include <vector>

#include "ardia/linux/ac_linux_crx_drop_core.h"
#include "base/files/file_path.h"
#include "base/functional/bind.h"
#include "base/memory/scoped_refptr.h"
#include "base/memory/weak_ptr.h"
#include "base/no_destructor.h"
#include "base/strings/utf_string_conversions.h"
#include "chrome/browser/extensions/extension_install_prompt.h"
#include "chrome/browser/extensions/extension_management.h"
#include "chrome/browser/profiles/profile.h"
#include "content/public/browser/browser_thread.h"
#include "content/public/browser/web_contents.h"
#include "content/public/common/drop_data.h"
#include "extensions/browser/crx_installer.h"
#include "extensions/browser/install/crx_install_error.h"
#include "extensions/browser/install_prompt_data.h"

extern bool (*g_ardia_linux_page_drop)(content::WebContents*, const content::DropData&);

namespace ardiacore {
namespace {

namespace drop = ardia::linux_crx_drop;

LinuxCrxDropDelegate& Delegate() {
  static base::NoDestructor<LinuxCrxDropDelegate> delegate;
  return *delegate;
}

void Installed(base::WeakPtr<content::WebContents> contents, const std::optional<extensions::CrxInstallError>& error) {
  const bool cancelled = error && (error->detail() == extensions::CrxInstallErrorDetail::USER_CANCELED ||
                                   error->detail() == extensions::CrxInstallErrorDetail::USER_ABORTED);
  if (!drop::ReportsFailure(error.has_value(), cancelled) || !Delegate().failed) return;
  Delegate().failed.Run(contents.get(), drop::Message(base::UTF16ToUTF8(error->message())));
}

bool InstallDroppedExtensions(content::WebContents* contents, const content::DropData& data) {
  DCHECK_CURRENTLY_ON(content::BrowserThread::UI);
  if (!contents) return false;
  std::vector<std::string> paths;
  for (const ui::FileInfo& file : data.filenames) paths.push_back(file.path.value());
  Profile* profile = Profile::FromBrowserContext(contents->GetBrowserContext());
  if (!profile) return false;
  const bool all_crx = drop::AllCrx(paths);
  if (!drop::TakesDrop(all_crx, all_crx && Delegate().shown_by_a_window && Delegate().shown_by_a_window.Run(contents),
                       profile->IsOffTheRecord(),
                       all_crx && extensions::ExtensionManagementFactory::GetForBrowserContext(profile)
                                      ->BlocklistedByDefault())) {
    return false;
  }
  for (const std::string& path : paths) {
    scoped_refptr<extensions::CrxInstaller> installer = extensions::CrxInstaller::Create(
        profile, std::make_unique<ExtensionInstallPrompt>(
                     contents, std::make_unique<extensions::InstallPromptData>(
                                   extensions::InstallPromptData::UNSET_PROMPT_TYPE)));
    installer->set_error_on_unsupported_requirements(true);
    installer->set_off_store_install_allow_reason(extensions::CrxInstaller::OffStoreInstallAllowedFromSettingsPage);
    installer->set_install_immediately(true);
    installer->AddInstallerCallback(base::BindOnce(&Installed, contents->GetWeakPtr()));
    installer->InstallCrx(base::FilePath(path));
  }
  return true;
}

}

void StartLinuxCrxDrops(LinuxCrxDropDelegate delegate) {
  DCHECK_CURRENTLY_ON(content::BrowserThread::UI);
  Delegate() = std::move(delegate);
  g_ardia_linux_page_drop = &InstallDroppedExtensions;
}

}
