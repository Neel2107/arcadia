import { StyleSheet } from "react-native";
import * as Reanimated from "react-native-reanimated";
import { act } from "react-test-renderer";
import { flightScale, SyncFlight } from "../components/onboarding/SyncFlight";
import { syncFlight } from "../components/onboarding/syncFlightTokens";
import { renderSurface, unmount, withTabs } from "../../test/render/harness";

const mockMotion = { reduced: false };
jest.mock("../state/app/systemLook", () => ({ ...jest.requireActual("../state/app/systemLook"), useReduceMotion: () => mockMotion.reduced }));

beforeEach(() => {
  jest.useFakeTimers();
  withTabs(1);
  mockMotion.reduced = false;
});

afterEach(() => {
  act(() => jest.runOnlyPendingTimers());
  jest.useRealTimers();
  jest.restoreAllMocks();
});

type Root = ReturnType<typeof renderSurface>;

const hosts = (root: Root, testID: string) => root.root.findAll((node) => node.props.testID === testID && typeof node.type === "string");

test("the flight is decorative: hidden from VoiceOver and TalkBack", () => {
  const root = renderSurface(<SyncFlight connected={false} />);
  const frame = hosts(root, "syncFlight")[0]!;
  expect(frame.props.accessibilityElementsHidden).toBe(true);
  expect(frame.props.importantForAccessibility).toBe("no-hide-descendants");
  expect(root.root.findAll((node) => typeof node.type === "string" && node.props.accessible === true)).toHaveLength(0);
  unmount(root);
});

test("while not connected, three tabs loop from the Mac sidebar into the phone's list, with no checkmark", () => {
  const repeat = jest.spyOn(Reanimated, "withRepeat");
  const root = renderSurface(<SyncFlight connected={false} />);
  expect(repeat).toHaveBeenCalledTimes(1);
  expect(hosts(root, "syncFlightMacRow")).toHaveLength(syncFlight.tabs.length);
  expect(hosts(root, "syncFlightChip")).toHaveLength(syncFlight.loop.flights.length);
  expect(hosts(root, "syncFlightPhoneRow")).toHaveLength(syncFlight.loop.flights.length);
  expect(hosts(root, "syncFlightCheck")).toHaveLength(0);
  unmount(root);
});

test("once connected the loop stops, the phone shows every tab and the checkmark badge pops in", () => {
  const repeat = jest.spyOn(Reanimated, "withRepeat");
  const root = renderSurface(<SyncFlight connected />);
  expect(repeat).not.toHaveBeenCalled();
  expect(hosts(root, "syncFlightCheck")).toHaveLength(1);
  expect(hosts(root, "syncFlightChip")).toHaveLength(0);
  expect(hosts(root, "syncFlightPhoneRow")).toHaveLength(syncFlight.tabs.length);
  unmount(root);
});

test("with Reduce Motion nothing flies or loops: the phone shows its filled list", () => {
  mockMotion.reduced = true;
  const repeat = jest.spyOn(Reanimated, "withRepeat");
  const root = renderSurface(<SyncFlight connected={false} />);
  expect(repeat).not.toHaveBeenCalled();
  expect(hosts(root, "syncFlightChip")).toHaveLength(0);
  expect(hosts(root, "syncFlightPhoneRow")).toHaveLength(syncFlight.loop.flights.length);
  expect(hosts(root, "syncFlightCheck")).toHaveLength(0);
  unmount(root);
});

test("the stage scales down to fit the space it gets and never grows past its drawn size", () => {
  const { width, height } = syncFlight.stage;
  expect(flightScale(width * 3, height * 3)).toBe(1);
  expect(flightScale(width / 2, height * 3)).toBeCloseTo(0.5);
  expect(flightScale(width * 3, height / 4)).toBeCloseTo(0.25);
  const root = renderSurface(<SyncFlight connected={false} />);
  expect(StyleSheet.flatten(hosts(root, "syncFlight")[0]!.props.style).opacity).toBe(0);
  act(() => hosts(root, "syncFlight")[0]!.props.onLayout({ nativeEvent: { layout: { x: 0, y: 0, width: width / 2, height: height * 2 } } }));
  expect(StyleSheet.flatten(hosts(root, "syncFlight")[0]!.props.style).opacity).toBe(1);
  expect(StyleSheet.flatten(hosts(root, "syncFlightStage")[0]!.props.style).transform).toEqual([{ scale: 0.5 }]);
  unmount(root);
});
