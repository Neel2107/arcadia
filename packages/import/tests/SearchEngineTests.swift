import Foundation
import XCTest
@testable import ArdiaImportCore

final class SearchEngineTests: XCTestCase {
  let importer = Importer(discovery: Fixtures.discovery())

  func engine(_ browserId: String, _ profileId: String) throws -> ImportedSearchEngine? {
    try importer.importData(browserId: browserId, profileId: profileId, kinds: [.bookmarks]).searchEngine
  }

  func testArcProfileOnDuckDuckGoBringsItsKeywordRow() throws {
    let engine = try XCTUnwrap(try engine("arc", "Default"))
    XCTAssertEqual(engine, ImportedSearchEngine(name: "DuckDuckGo", keyword: "duckduckgo.com",
                                                url: "https://duckduckgo.com/?q={searchTerms}", prepopulateId: 92))
  }

  func testProfileOnTheBrowsersOwnDefaultBringsNothing() throws {
    XCTAssertNil(try engine("arc", "Profile 1"))
    XCTAssertNil(try engine("brave", "Default"))
  }

  func testChoiceThatPointsAtAMissingRowBringsNothing() throws {
    XCTAssertNil(try engine("dia", "Profile 2"))
  }

  func testCustomEngineKeepsItsTemplate() throws {
    let engine = try XCTUnwrap(try engine("chrome", "Default"))
    XCTAssertEqual(engine.name, "Ardia Docs")
    XCTAssertEqual(engine.keyword, "docs")
    XCTAssertEqual(engine.url, "https://docs.ardia.example/find?q={searchTerms}&enc={inputEncoding}&{google:RLZ}")
    XCTAssertNil(engine.prepopulateId)
  }

  func testSelectedEngineInPreferencesWithoutWebData() throws {
    let engine = try XCTUnwrap(try engine("chrome", "Profile 1"))
    XCTAssertEqual(engine.keyword, "bing.com")
    XCTAssertEqual(engine.prepopulateId, 3)
    XCTAssertTrue(engine.url.hasPrefix("https://www.bing.com/search?q={searchTerms}"))
  }

  func testGoogleChosenExplicitlyComesWithItsBaseUrlTemplate() throws {
    let engine = try XCTUnwrap(try engine("helium", "Default"))
    XCTAssertEqual(engine.keyword, "google.com")
    XCTAssertEqual(engine.prepopulateId, 1)
    XCTAssertTrue(engine.url.hasPrefix("{google:baseURL}search?q={searchTerms}"))
  }

  func testEngineIsReadWhateverKindsAreAskedForAndLeavesWebDataUntouched() throws {
    let webData = Fixtures.support("Arc/User Data/Default/Web Data")
    let before = try Data(contentsOf: webData)
    let result = try importer.importData(browserId: "arc", profileId: "Default", kinds: [])
    XCTAssertEqual(result.searchEngine?.keyword, "duckduckgo.com")
    XCTAssertEqual(try Data(contentsOf: webData), before)
  }

  func testEngineIsEncodedForJavaScriptAndLeftOutWhenThereIsNone() throws {
    let arc = try importer.importData(browserId: "arc", profileId: "Default", kinds: [])
    let json = try XCTUnwrap(try JSONSerialization.jsonObject(with: JSONEncoder().encode(arc)) as? [String: Any])
    let engine = try XCTUnwrap(json["searchEngine"] as? [String: Any])
    XCTAssertEqual(engine["keyword"] as? String, "duckduckgo.com")
    XCTAssertEqual(engine["prepopulateId"] as? Int, 92)
    let brave = try importer.importData(browserId: "brave", profileId: "Default", kinds: [])
    let braveJson = try XCTUnwrap(try JSONSerialization.jsonObject(with: JSONEncoder().encode(brave)) as? [String: Any])
    XCTAssertNil(braveJson["searchEngine"])
  }

  func testUnreadablePreferencesBringNothing() throws {
    let dir = FileManager.default.temporaryDirectory.appendingPathComponent("ardia-search-\(UUID().uuidString)")
    try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    defer { try? FileManager.default.removeItem(at: dir) }
    XCTAssertNil(ChromiumSearchEngine.read(profile: dir))
    try Data("{not json".utf8).write(to: dir.appendingPathComponent("Preferences"))
    XCTAssertNil(ChromiumSearchEngine.read(profile: dir))
    try Data(#"{"default_search_provider_data":{"template_url_data":{"short_name":"Odd","keyword":"odd","url":"https://odd.example/"}}}"#.utf8)
      .write(to: dir.appendingPathComponent("Preferences"))
    XCTAssertNil(ChromiumSearchEngine.read(profile: dir))
  }
}
