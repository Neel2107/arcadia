import { act, type ReactTestInstance } from "react-test-renderer";
import { BlockingDemo } from "../components/onboarding/BlockingDemo";
import { blockingDemo } from "../components/onboarding/blockingDemoTokens";
import type { BlockingCategory } from "../platform/blocking";
import * as settingsActions from "../state/settings/actions";
import { useBlocking } from "../state/settings/actions";
import { renderSurface, unmount } from "../../test/render/harness";

const mockMotion = { reduced: false };
jest.mock("../state/app/systemLook", () => ({ ...jest.requireActual("../state/app/systemLook"), useReduceMotion: () => mockMotion.reduced }));

const FIELD: Record<BlockingCategory, "blocksAds" | "blocksTrackers" | "hidesCookieBanners"> = { ads: "blocksAds", trackers: "blocksTrackers", cookieBanners: "hidesCookieBanners" };

const withBlocking = (ads: boolean, trackers: boolean, cookieBanners: boolean) =>
  useBlocking.setState({ busy: false, state: { isEnabled: true, blocksAds: ads, blocksTrackers: trackers, hidesCookieBanners: cookieBanners, exemptHosts: [], lists: [] } as never });

const categories = () => {
  const state = useBlocking.getState().state!;
  return { ads: state.blocksAds, trackers: state.blocksTrackers, cookieBanners: state.hidesCookieBanners };
};

let writes: [BlockingCategory, boolean][] = [];

beforeEach(() => {
  jest.useFakeTimers();
  mockMotion.reduced = false;
  writes = [];
  withBlocking(true, true, true);
  jest.spyOn(settingsActions, "setBlockingCategory").mockImplementation((category, on) => {
    writes.push([category, on]);
    const state = useBlocking.getState().state!;
    useBlocking.setState({ state: { ...state, [FIELD[category]]: on } });
  });
});

afterEach(() => {
  act(() => jest.runOnlyPendingTimers());
  jest.useRealTimers();
  jest.restoreAllMocks();
});

type Root = ReturnType<typeof renderSurface>;

const blockingSwitch = (root: Root): ReactTestInstance => {
  const found = root.root.findAll((node) => typeof node.type === "string" && node.props.accessibilityRole === "switch");
  expect(found).toHaveLength(1);
  return found[0]!;
};

const isOn = (root: Root) => blockingSwitch(root).props.accessibilityState.checked as boolean;

const flip = (root: Root) => {
  const pressable = root.root.findAll((node) => node.props.accessibilityRole === "switch" && typeof node.props.onPress === "function")[0]!;
  act(() => pressable.props.onPress());
};

test("the switch is a screen-reader switch labelled Block Ads and Trackers, and the phone mock stays hidden", () => {
  const root = renderSurface(<BlockingDemo />, { flushTimers: false });
  expect(blockingSwitch(root).props.accessibilityLabel).toBe("Block Ads and Trackers");
  const phone = root.root.findAll((node) => typeof node.type === "string" && node.props.testID === "phoneFrame")[0]!;
  expect(phone.props.accessibilityElementsHidden).toBe(true);
  expect(phone.props.importantForAccessibility).toBe("no-hide-descendants");
  unmount(root);
});

test("it shows the page with the switch off first, then turns blocking on by itself after the preview, writing all three categories", () => {
  const root = renderSurface(<BlockingDemo />, { flushTimers: false });
  expect(isOn(root)).toBe(false);
  act(() => jest.advanceTimersByTime(blockingDemo.previewMs - 1));
  expect(isOn(root)).toBe(false);
  expect(writes).toEqual([]);
  act(() => jest.advanceTimersByTime(1));
  expect(isOn(root)).toBe(true);
  expect(writes).toEqual([
    ["ads", true],
    ["trackers", true],
    ["cookieBanners", true],
  ]);
  expect(categories()).toEqual({ ads: true, trackers: true, cookieBanners: true });
  unmount(root);
});

test("turning the switch off turns all three categories off, and on again turns them all back on", () => {
  const root = renderSurface(<BlockingDemo />, { flushTimers: false });
  act(() => jest.advanceTimersByTime(blockingDemo.previewMs));
  flip(root);
  expect(isOn(root)).toBe(false);
  expect(categories()).toEqual({ ads: false, trackers: false, cookieBanners: false });
  flip(root);
  expect(isOn(root)).toBe(true);
  expect(categories()).toEqual({ ads: true, trackers: true, cookieBanners: true });
  unmount(root);
});

test("a tap during the preview is the user's choice and the auto flip never fires", () => {
  const root = renderSurface(<BlockingDemo />, { flushTimers: false });
  flip(root);
  expect(isOn(root)).toBe(true);
  writes = [];
  flip(root);
  act(() => jest.advanceTimersByTime(blockingDemo.previewMs * 2));
  expect(isOn(root)).toBe(false);
  expect(writes.every(([, on]) => !on)).toBe(true);
  expect(categories()).toEqual({ ads: false, trackers: false, cookieBanners: false });
  unmount(root);
});

test("blocking already partly off is kept: no auto flip, and the switch reads off", () => {
  withBlocking(true, false, true);
  const root = renderSurface(<BlockingDemo />, { flushTimers: false });
  act(() => jest.advanceTimersByTime(blockingDemo.previewMs * 2));
  expect(isOn(root)).toBe(false);
  expect(writes).toEqual([]);
  expect(categories()).toEqual({ ads: true, trackers: false, cookieBanners: true });
  flip(root);
  expect(categories()).toEqual({ ads: true, trackers: true, cookieBanners: true });
  unmount(root);
});

test("with Reduce Motion there is no auto flip, but the switch still sets all three", () => {
  mockMotion.reduced = true;
  const root = renderSurface(<BlockingDemo />, { flushTimers: false });
  expect(isOn(root)).toBe(true);
  act(() => jest.advanceTimersByTime(blockingDemo.previewMs * 2));
  expect(writes).toEqual([]);
  flip(root);
  expect(isOn(root)).toBe(false);
  expect(categories()).toEqual({ ads: false, trackers: false, cookieBanners: false });
  flip(root);
  expect(categories()).toEqual({ ads: true, trackers: true, cookieBanners: true });
  unmount(root);
});
