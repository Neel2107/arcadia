import ExpoModulesCore
import UIKit
import WebKit

final class PhoneMeadowView: ExpoView {
  let onMeadow = EventDispatcher()
  private var webView: WKWebView?
  private var isReady = false
  private var sentHour: String?

  var hour: String? {
    didSet { sendHour() }
  }

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    backgroundColor = .clear
    clipsToBounds = true
    isUserInteractionEnabled = false
    isAccessibilityElement = false
    accessibilityElementsHidden = true
    load()
  }

  deinit {
    webView?.configuration.userContentController.removeScriptMessageHandler(forName: PhoneMeadowMessages.name)
  }

  private func load() {
    guard let page = PhoneMeadowMessages.page else {
      DispatchQueue.main.async { [weak self] in self?.onMeadow(["state": "failed"]) }
      return
    }
    let config = WKWebViewConfiguration()
    config.userContentController.add(PhoneMeadowMessages(owner: self), name: PhoneMeadowMessages.name)
    config.suppressesIncrementalRendering = true
    let web = WKWebView(frame: bounds, configuration: config)
    web.isOpaque = false
    web.backgroundColor = .clear
    web.scrollView.backgroundColor = .clear
    web.scrollView.isScrollEnabled = false
    web.scrollView.contentInsetAdjustmentBehavior = .never
    web.isUserInteractionEnabled = false
    web.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    addSubview(web)
    webView = web
    let opening = URL(string: "#calm", relativeTo: page.html)?.absoluteURL ?? page.html
    web.loadFileURL(opening, allowingReadAccessTo: page.folder)
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    webView?.frame = bounds
  }

  func received(_ body: Any) {
    guard let message = body as? [String: Any], let state = message["state"] as? String else { return }
    if state == "ready" {
      isReady = true
      sentHour = nil
      sendHour()
    }
    if state == "ready" || state == "failed" {
      onMeadow(["state": state])
    }
  }

  private func sendHour() {
    guard isReady, let hour, hour != sentHour, let webView else { return }
    sentHour = hour
    let quoted = (try? String(data: JSONSerialization.data(withJSONObject: [hour]), encoding: .utf8)) ?? "[]"
    webView.evaluateJavaScript("meadowHour(\(quoted)[0])")
  }
}

final class PhoneMeadowMessages: NSObject, WKScriptMessageHandler {
  static let name = "meadow"

  static let page: (html: URL, folder: URL)? = {
    guard let bundleURL = Bundle(for: PhoneMeadowMessages.self).url(forResource: "ArdiaPhoneMeadow", withExtension: "bundle"),
      let bundle = Bundle(url: bundleURL),
      let html = bundle.url(forResource: "index", withExtension: "html")
    else { return nil }
    return (html, bundle.bundleURL)
  }()

  private weak var owner: PhoneMeadowView?

  init(owner: PhoneMeadowView) {
    self.owner = owner
  }

  func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
    owner?.received(message.body)
  }
}
