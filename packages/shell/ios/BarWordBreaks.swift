import AppKit

enum BarWordBreaks {
  static let fieldId = "ardia.barField"

  private enum Edit {
    case delete(forward: Bool)
    case move(forward: Bool, extending: Bool)
    case moveVisually(right: Bool, extending: Bool)
  }

  private struct Extension {
    let anchor: Int
    let range: NSRange
  }

  private static var extensionKey = 0

  static let install: Void = {
    let edits: [(String, Edit)] = [
      ("deleteWordBackward:", .delete(forward: false)),
      ("deleteWordForward:", .delete(forward: true)),
      ("moveWordBackward:", .move(forward: false, extending: false)),
      ("moveWordForward:", .move(forward: true, extending: false)),
      ("moveWordBackwardAndModifySelection:", .move(forward: false, extending: true)),
      ("moveWordForwardAndModifySelection:", .move(forward: true, extending: true)),
      ("moveWordLeft:", .moveVisually(right: false, extending: false)),
      ("moveWordRight:", .moveVisually(right: true, extending: false)),
      ("moveWordLeftAndModifySelection:", .moveVisually(right: false, extending: true)),
      ("moveWordRightAndModifySelection:", .moveVisually(right: true, extending: true)),
    ]
    typealias Command = @convention(c) (NSTextView, Selector, Any?) -> Void
    for (name, edit) in edits {
      let selector = NSSelectorFromString(name)
      guard let method = class_getInstanceMethod(NSTextView.self, selector) else { continue }
      let original = unsafeBitCast(method_getImplementation(method), to: Command.self)
      let block: @convention(block) (NSTextView, Any?) -> Void = { view, sender in
        if !isBarField(view) || view.hasMarkedText() || !perform(edit, in: view) { original(view, selector, sender) }
      }
      let imp = imp_implementationWithBlock(block)
      if !class_addMethod(NSTextView.self, selector, imp, method_getTypeEncoding(method)) { method_setImplementation(method, imp) }
    }
  }()

  private static func isBarField(_ view: NSTextView) -> Bool {
    guard view.isFieldEditor, let host = (view.delegate as? NSTextField)?.superview,
          host.responds(to: NSSelectorFromString("nativeID"))
    else { return false }
    return host.value(forKey: "nativeID") as? String == fieldId
  }

  private static func perform(_ edit: Edit, in view: NSTextView) -> Bool {
    let text = view.string
    switch edit {
    case .delete(let forward):
      return delete(forward: forward, in: view, text: text)
    case .move(let forward, let extending):
      move(forward: forward, extending: extending, in: view, text: text)
    case .moveVisually(let right, let extending):
      guard !ChromeWordBreaks.containsRightToLeftText(text) else { return false }
      move(forward: right, extending: extending, in: view, text: text)
    }
    return true
  }

  private static func delete(forward: Bool, in view: NSTextView, text: String) -> Bool {
    let selection = view.selectedRange()
    guard selection.length == 0 else { return false }
    let caret = selection.location
    let stop = ChromeWordBreaks.stop(forward: forward, from: caret, in: text)
    guard stop != caret else { return true }
    let range = NSRange(location: min(caret, stop), length: abs(stop - caret))
    guard view.shouldChangeText(in: range, replacementString: "") else { return true }
    view.replaceCharacters(in: range, with: "")
    view.didChangeText()
    view.setSelectedRange(NSRange(location: range.location, length: 0))
    view.scrollRangeToVisible(view.selectedRange())
    noteEdit(.delete, stop: stop, forward: forward, from: caret, in: text)
    return true
  }

  private static func move(forward: Bool, extending: Bool, in view: NSTextView, text: String) {
    let selection = view.selectedRange()
    let from: Int, anchor: Int?
    if extending {
      let held = objc_getAssociatedObject(view, &extensionKey) as? Extension
      let kept = held.flatMap { NSEqualRanges($0.range, selection) ? $0.anchor : nil }
        ?? (selection.length == 0 || forward ? selection.location : NSMaxRange(selection))
      anchor = kept
      from = kept == selection.location ? NSMaxRange(selection) : selection.location
    } else {
      anchor = nil
      from = forward ? NSMaxRange(selection) : selection.location
    }
    let stop = ChromeWordBreaks.stop(forward: forward, from: from, in: text)
    let next = anchor.map { NSRange(location: min($0, stop), length: abs(stop - $0)) } ?? NSRange(location: stop, length: 0)
    if let anchor { objc_setAssociatedObject(view, &extensionKey, Extension(anchor: anchor, range: next), .OBJC_ASSOCIATION_RETAIN_NONATOMIC) }
    view.setSelectedRange(next, affinity: forward ? .downstream : .upstream, stillSelecting: false)
    view.scrollRangeToVisible(NSRange(location: stop, length: 0))
    noteEdit(.move, stop: stop, forward: forward, from: from, in: text)
  }

  private enum EditKind: String {
    case delete
    case move
  }

  private static func noteEdit(_ kind: EditKind, stop: Int, forward: Bool, from: Int, in text: String) {
    guard stop != from else { return }
    let splitAtDot = stop != ChromeWordBreaks.stop(forward: forward, from: from, in: text, splittingLetterStops: false)
    ShellEvents.send(.app, ["type": "barWordEdit", "kind": kind.rawValue, "splitAtDot": splitAtDot])
  }
}
