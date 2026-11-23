import { useEffect, useState } from "react";
import { StyleSheet, Text, View, type LayoutChangeEvent } from "react-native";
import Animated, { cancelAnimation, Easing, FadeIn, FadeOut, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSpring, withTiming, type SharedValue } from "react-native-reanimated";
import { withAlpha } from "../../lib/color";
import { tileGradient } from "../../lib/favicon";
import { linearGradientCss } from "../../lib/gradient";
import { PROFILE_COLORS, smoothCorners, spring, Symbol, useReduceMotion } from "../ui";
import { phoneFrame } from "./onboardingTokens";
import { PhoneFrame, PHONE_SCREEN } from "./PhoneFrame";
import { syncFlight } from "./syncFlightTokens";

const STAGE = syncFlight.stage;
const MAC = syncFlight.mac;
const ROW = syncFlight.macRow;
const PAGE = syncFlight.page;
const PHONE = syncFlight.phone;
const LIST = syncFlight.phoneList;
const CHIP = syncFlight.chip;
const CHECK = syncFlight.check;
const LOOP = syncFlight.loop;
const GLOW = syncFlight.connectedGlow;
const TABS = syncFlight.tabs;

const ROW_WIDTH = MAC.sidebarWidth - 2 * ROW.inset;
const PAGE_WIDTH = MAC.width - MAC.sidebarWidth;
const PHONE_WIDTH = phoneFrame.width * PHONE.scale;
const PHONE_HEIGHT = phoneFrame.height * PHONE.scale;
const SCREEN_LEFT = PHONE.left + phoneFrame.bezel * PHONE.scale;
const SCREEN_TOP = PHONE.top + phoneFrame.bezel * PHONE.scale;
const SLOT_WIDTH = PHONE_SCREEN.width - 2 * LIST.inset;
const LANDED_SCALE = (LIST.height * PHONE.scale) / ROW.height;
const POP = spring(CHECK.pop.response, CHECK.pop.damping);

const FLOWN_TABS: readonly number[] = LOOP.flights;
const FILLED_TABS: readonly number[] = [...FLOWN_TABS, ...TABS.map((_, index) => index).filter((index) => !FLOWN_TABS.includes(index))];

const macRowTop = (row: number) => ROW.top + row * (ROW.height + ROW.gap);
const phoneSlotTop = (slot: number) => LIST.top + slot * (LIST.height + LIST.gap);

const flightStart = (flight: number) => LOOP.firstAt + flight * LOOP.stagger;
const flightTimes = (flight: number) => {
  const lifted = flightStart(flight) + LOOP.lift;
  const arrived = lifted + LOOP.fly;
  return { start: flightStart(flight), lifted, arrived, landed: arrived + LOOP.land };
};

const flightPath = (flight: number) => {
  const row = FLOWN_TABS[flight]!;
  return {
    from: { x: MAC.left + ROW.inset + ROW_WIDTH / 2, y: MAC.top + macRowTop(row) + ROW.height / 2 },
    to: { x: SCREEN_LEFT + LIST.inset * PHONE.scale + (ROW_WIDTH * LANDED_SCALE) / 2, y: SCREEN_TOP + (phoneSlotTop(flight) + LIST.height / 2) * PHONE.scale },
  };
};

export const flightScale = (width: number, height: number) => Math.max(0, Math.min(syncFlight.maxScale, width / STAGE.width, height / STAGE.height));

const span = (t: number, from: number, to: number) => {
  "worklet";
  return Math.min(1, Math.max(0, (t - from) / (to - from)));
};

const glide = (t: number, from: number, to: number) => {
  "worklet";
  return Easing.inOut(Easing.cubic)(span(t, from, to));
};

const settle = (t: number, from: number, to: number) => {
  "worklet";
  return Easing.out(Easing.cubic)(span(t, from, to));
};

const pulse = (t: number, from: number, to: number) => {
  "worklet";
  const x = span(t, from, to);
  return x < 0.5 ? x * 2 : (1 - x) * 2;
};

const checkPop = () => {
  "worklet";
  return {
    initialValues: { opacity: 0, transform: [{ scale: 0 }] },
    animations: { opacity: withDelay(CHECK.delayMs, withTiming(1, { duration: syncFlight.fadeMs })), transform: [{ scale: withDelay(CHECK.delayMs, withSpring(1, POP)) }] },
  };
};

export function SyncFlight({ connected }: { connected: boolean }) {
  const reduceMotion = useReduceMotion();
  const [scale, setScale] = useState<number | null>(null);
  const looping = !connected && !reduceMotion;
  const clock = useSharedValue(0);
  const glow = useSharedValue(0);

  useEffect(() => {
    if (!looping) return;
    clock.value = 0;
    clock.value = withRepeat(withTiming(1, { duration: LOOP.ms, easing: Easing.linear }), -1, false);
    return () => {
      cancelAnimation(clock);
      clock.value = 0;
    };
  }, [looping, clock]);

  useEffect(() => {
    if (!connected) return;
    glow.value = 0;
    glow.value = withTiming(1, { duration: GLOW.ms, easing: Easing.linear });
    return () => {
      cancelAnimation(glow);
      glow.value = 0;
    };
  }, [connected, glow]);

  const measure = (event: LayoutChangeEvent) => setScale(flightScale(event.nativeEvent.layout.width, event.nativeEvent.layout.height));
  const shown = scale ?? 1;

  return (
    <View testID="syncFlight" onLayout={measure} style={[styles.fill, { opacity: scale === null ? 0 : 1 }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={{ width: STAGE.width * shown, height: STAGE.height * shown }}>
        <View testID="syncFlightStage" style={[styles.stage, { transform: [{ scale: shown }] }]}>
          <MacWindow clock={clock} glow={glow} />
          <View style={styles.phoneSlot}>
            <PhoneFrame screenColor={syncFlight.phoneScreen} style={styles.phone}>
              <PhoneList />
              {looping ? <LoopSlots clock={clock} /> : <FilledSlots key={connected ? "connected" : "reduced"} count={connected ? TABS.length : FLOWN_TABS.length} reduceMotion={reduceMotion} />}
            </PhoneFrame>
          </View>
          {looping ? FLOWN_TABS.map((_, flight) => <FlightChip key={flight} clock={clock} flight={flight} />) : null}
          {connected ? (
            <Animated.View testID="syncFlightCheck" entering={reduceMotion ? FadeIn.duration(syncFlight.reducedFadeMs) : checkPop} exiting={FadeOut.duration(syncFlight.fadeMs)} style={styles.check}>
              <Symbol name="checkmark" size={CHECK.glyph} color={CHECK.ink} weight="bold" />
            </Animated.View>
          ) : null}
        </View>
      </View>
    </View>
  );
}

function TabFace({ tab }: { tab: number }) {
  const spec = TABS[tab]!;
  return (
    <View style={styles.macFace}>
      <View style={[styles.macSwatch, { backgroundColor: PROFILE_COLORS[spec.look].swatch }]} />
      <View style={[styles.macBar, { width: spec.bar }]} />
    </View>
  );
}

function MacWindow({ clock, glow }: { clock: SharedValue<number>; glow: SharedValue<number> }) {
  const hero = PROFILE_COLORS[TABS[0]!.look].swatch;
  return (
    <View testID="syncFlightMac" style={styles.mac}>
      <View style={styles.sidebar}>
        <View style={styles.lights}>
          {MAC.trafficLights.map((color) => (
            <View key={color} style={[styles.light, { backgroundColor: color }]} />
          ))}
        </View>
        {TABS.map((spec, row) => (
          <MacRow key={spec.look} row={row} clock={clock} glow={glow} />
        ))}
      </View>
      <View style={styles.page}>
        <View style={styles.url} />
        <View style={[styles.hero, { experimental_backgroundImage: linearGradientCss(tileGradient(hero), false, 1, 1) }]} />
        {PAGE.lines.map((share, index) => (
          <View key={index} style={[styles.pageLine, { top: PAGE.lineTop + index * (PAGE.lineHeight + PAGE.lineGap), width: (PAGE_WIDTH - 2 * PAGE.pad) * share }]} />
        ))}
      </View>
    </View>
  );
}

function MacRow({ row, clock, glow }: { row: number; clock: SharedValue<number>; glow: SharedValue<number> }) {
  const flight = FLOWN_TABS.indexOf(row);
  const times = flight >= 0 ? flightTimes(flight) : null;
  const highlight = useAnimatedStyle(() => {
    const flown = times ? settle(clock.value, times.start, times.lifted) * (1 - span(clock.value, times.landed, times.landed + LOOP.glowFade)) : 0;
    const swept = pulse(glow.value, row * GLOW.stagger, row * GLOW.stagger + GLOW.width);
    return { opacity: Math.max(flown, swept) };
  });
  const swatch = PROFILE_COLORS[TABS[row]!.look].swatch;
  return (
    <View testID="syncFlightMacRow" style={[styles.macRow, { top: macRowTop(row) }, row === 0 ? styles.activeRow : null]}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.rowHighlight, { backgroundColor: withAlpha(swatch, ROW.highlightAlpha) }, highlight]} />
      <TabFace tab={row} />
    </View>
  );
}

function FlightChip({ clock, flight }: { clock: SharedValue<number>; flight: number }) {
  const times = flightTimes(flight);
  const { from, to } = flightPath(flight);
  const motion = useAnimatedStyle(() => {
    const t = clock.value;
    const lift = settle(t, times.start, times.lifted);
    const travel = glide(t, times.lifted, times.arrived);
    const land = span(t, times.arrived, times.landed);
    const x = from.x + (to.x - from.x) * travel;
    const y = from.y + (to.y - from.y) * travel - CHIP.arc * 4 * travel * (1 - travel) - CHIP.liftRise * lift * (1 - travel);
    const size = 1 + (CHIP.liftScale - 1) * lift * (1 - travel) + (LANDED_SCALE - 1) * travel;
    return {
      opacity: t >= times.start && t < times.landed ? 1 - land : 0,
      transform: [{ translateX: x - ROW_WIDTH / 2 }, { translateY: y - ROW.height / 2 }, { scale: size }],
    };
  });
  const plate = useAnimatedStyle(() => ({ opacity: settle(clock.value, times.start, times.lifted) }));
  return (
    <Animated.View testID="syncFlightChip" pointerEvents="none" style={[styles.chip, motion]}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.chipPlate, plate]} />
      <TabFace tab={FLOWN_TABS[flight]!} />
    </Animated.View>
  );
}

function PhoneList() {
  return (
    <View style={styles.listHeader}>
      <Symbol name="laptop" size={LIST.glyph} color={LIST.glyphInk} />
      <Text allowFontScaling={false} numberOfLines={1} style={styles.listTitle}>
        {LIST.title}
      </Text>
    </View>
  );
}

function PhoneRowFace({ tab }: { tab: number }) {
  const spec = TABS[tab]!;
  return (
    <>
      <View style={[styles.phoneSwatch, { backgroundColor: PROFILE_COLORS[spec.look].swatch }]} />
      <View style={[styles.phoneBar, { width: spec.bar * LIST.barStretch }]} />
    </>
  );
}

function LoopSlots({ clock }: { clock: SharedValue<number> }) {
  return (
    <>
      {FLOWN_TABS.map((tab, slot) => (
        <View key={`placeholder${tab}`} style={[styles.phoneRow, styles.placeholder, { top: phoneSlotTop(slot) }]} />
      ))}
      {FLOWN_TABS.map((tab, slot) => (
        <LoopRow key={tab} clock={clock} slot={slot} />
      ))}
    </>
  );
}

function LoopRow({ clock, slot }: { clock: SharedValue<number>; slot: number }) {
  const times = flightTimes(slot);
  const style = useAnimatedStyle(() => {
    const t = clock.value;
    const landing = span(t, times.arrived, times.landed);
    const shown = settle(t, times.arrived, times.landed) * (1 - span(t, LOOP.resetFrom, LOOP.resetTo));
    const grow = LOOP.settleFrom + (1 - LOOP.settleFrom) * Easing.out(Easing.back(LOOP.settleOvershoot))(landing);
    return { opacity: shown, transform: [{ scale: grow }] };
  });
  return (
    <Animated.View testID="syncFlightPhoneRow" style={[styles.phoneRow, styles.phoneRowFill, { top: phoneSlotTop(slot) }, style]}>
      <PhoneRowFace tab={FLOWN_TABS[slot]!} />
    </Animated.View>
  );
}

function FilledSlots({ count, reduceMotion }: { count: number; reduceMotion: boolean }) {
  const step = reduceMotion ? syncFlight.reducedStaggerMs : syncFlight.filledStaggerMs;
  return (
    <>
      {FILLED_TABS.slice(0, count).map((tab, slot) => (
        <Animated.View
          key={tab}
          testID="syncFlightPhoneRow"
          entering={FadeIn.duration(reduceMotion ? syncFlight.reducedFadeMs : syncFlight.fadeMs).delay(slot * step)}
          style={[styles.phoneRow, styles.phoneRowFill, { top: phoneSlotTop(slot) }]}
        >
          <PhoneRowFace tab={tab} />
        </Animated.View>
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, alignSelf: "stretch", alignItems: "center", justifyContent: "center" },
  stage: { position: "absolute", width: STAGE.width, height: STAGE.height, left: "50%", top: "50%", marginLeft: -STAGE.width / 2, marginTop: -STAGE.height / 2 },
  mac: {
    position: "absolute",
    left: MAC.left,
    top: MAC.top,
    width: MAC.width,
    height: MAC.height,
    borderRadius: MAC.radius,
    ...smoothCorners,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: MAC.border,
    backgroundColor: MAC.chrome,
    boxShadow: MAC.shadow,
    flexDirection: "row",
  },
  sidebar: { width: MAC.sidebarWidth, backgroundColor: MAC.sidebar, borderTopLeftRadius: MAC.radius, borderBottomLeftRadius: MAC.radius, ...smoothCorners, borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: MAC.divider },
  lights: { position: "absolute", top: MAC.lightsTop, left: MAC.lightsLeft, flexDirection: "row", gap: MAC.lightGap },
  light: { width: MAC.light, height: MAC.light, borderRadius: MAC.light / 2 },
  macRow: { position: "absolute", left: ROW.inset, width: ROW_WIDTH, height: ROW.height, borderRadius: ROW.radius, ...smoothCorners },
  activeRow: { backgroundColor: ROW.activeFill, boxShadow: ROW.activeShadow },
  rowHighlight: { borderRadius: ROW.radius, ...smoothCorners },
  macFace: { flex: 1, flexDirection: "row", alignItems: "center", paddingHorizontal: ROW.pad, gap: ROW.barGap },
  macSwatch: { width: ROW.swatch, height: ROW.swatch, borderRadius: ROW.swatchRadius, ...smoothCorners },
  macBar: { height: ROW.bar, borderRadius: ROW.bar / 2, backgroundColor: ROW.ink },
  page: { flex: 1 },
  url: { position: "absolute", top: PAGE.urlTop, left: (PAGE_WIDTH - PAGE.urlWidth) / 2, width: PAGE.urlWidth, height: PAGE.urlHeight, borderRadius: PAGE.urlHeight / 2, backgroundColor: PAGE.urlFill },
  hero: { position: "absolute", top: PAGE.heroTop, left: PAGE.pad, right: PAGE.pad, height: PAGE.heroHeight, borderRadius: PAGE.heroRadius, ...smoothCorners },
  pageLine: { position: "absolute", left: PAGE.pad, height: PAGE.lineHeight, borderRadius: PAGE.lineHeight / 2, backgroundColor: PAGE.lineInk },
  phoneSlot: { position: "absolute", left: PHONE.left, top: PHONE.top, width: PHONE_WIDTH, height: PHONE_HEIGHT },
  phone: { position: "absolute", left: (PHONE_WIDTH - phoneFrame.width) / 2, top: (PHONE_HEIGHT - phoneFrame.height) / 2, transform: [{ scale: PHONE.scale }] },
  listHeader: { position: "absolute", top: LIST.titleTop, left: LIST.titleLeft, right: LIST.titleLeft, flexDirection: "row", alignItems: "center", gap: LIST.glyphGap },
  listTitle: { fontSize: LIST.titleSize, lineHeight: LIST.titleLineHeight, fontWeight: "700", color: LIST.titleInk },
  phoneRow: { position: "absolute", left: LIST.inset, width: SLOT_WIDTH, height: LIST.height, borderRadius: LIST.radius, ...smoothCorners },
  placeholder: { backgroundColor: LIST.placeholder },
  phoneRowFill: { backgroundColor: LIST.fill, flexDirection: "row", alignItems: "center", paddingHorizontal: LIST.pad, gap: LIST.swatchGap },
  phoneSwatch: { width: LIST.swatch, height: LIST.swatch, borderRadius: LIST.swatchRadius, ...smoothCorners },
  phoneBar: { height: LIST.bar, borderRadius: LIST.bar / 2, backgroundColor: LIST.ink },
  chip: { position: "absolute", left: 0, top: 0, width: ROW_WIDTH, height: ROW.height },
  chipPlate: { borderRadius: ROW.radius, ...smoothCorners, backgroundColor: CHIP.fill, boxShadow: CHIP.shadow },
  check: {
    position: "absolute",
    left: PHONE.left + PHONE_WIDTH - CHECK.inset - CHECK.side / 2,
    top: PHONE.top + CHECK.inset - CHECK.side / 2,
    width: CHECK.side,
    height: CHECK.side,
    borderRadius: CHECK.side / 2,
    backgroundColor: CHECK.fill,
    borderWidth: CHECK.ring,
    borderColor: CHECK.ringColor,
    boxShadow: CHECK.shadow,
    alignItems: "center",
    justifyContent: "center",
  },
});
