import { useEffect, useState, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from "react-native";
import Animated, { cancelAnimation, Easing, FadeIn, FadeOut, useAnimatedStyle, useSharedValue, withTiming, type SharedValue } from "react-native-reanimated";
import { withAlpha } from "../../lib/color";
import { tileGradient } from "../../lib/favicon";
import { linearGradientCss } from "../../lib/gradient";
import { ForcedDark, font, PROFILE_COLORS, smoothCorners, space, Symbol, tabsMotion, useReduceMotion, useTheme, type Theme } from "../ui";
import { phoneFrame, tipsReel } from "./onboardingTokens";

export const REEL_TIPS = ["Tap + to search.", "Flick a tab up to close it.", "Swipe a page to go back."] as const;

const STAGE = tipsReel.stage;
const SCREEN_W = STAGE.width - 2 * STAGE.bezel;
const SCREEN_H = STAGE.height - 2 * STAGE.bezel;
const BAR = tipsReel.bar;
const FINGER = tipsReel.finger;
const CAPTION_BLOCK = tipsReel.captionGap + tipsReel.captionHeight + tipsReel.dotsGap + tipsReel.dot.height;
const REDUCED_FRAME = 0.9;

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

export const reelScale = (height: number) => Math.min(tipsReel.maxScale, Math.max(tipsReel.minScale, (height - CAPTION_BLOCK) / STAGE.height));

export function TipsReel() {
  return (
    <ForcedDark value={false}>
      <TipsReelStage />
    </ForcedDark>
  );
}

function TipsReelStage() {
  const theme = useTheme();
  const reduceMotion = useReduceMotion();
  const [scene, setScene] = useState(0);
  const [scale, setScale] = useState<number | null>(null);
  const clock = useSharedValue(reduceMotion ? REDUCED_FRAME : 0);

  useEffect(() => {
    if (reduceMotion) {
      clock.value = REDUCED_FRAME;
    } else {
      clock.value = 0;
      clock.value = withTiming(1, { duration: tipsReel.sceneMs, easing: Easing.linear });
    }
    const timer = setTimeout(() => setScene((now) => (now + 1) % REEL_TIPS.length), reduceMotion ? tipsReel.reducedSceneMs : tipsReel.sceneMs);
    return () => {
      clearTimeout(timer);
      cancelAnimation(clock);
    };
  }, [scene, reduceMotion, clock]);

  const measure = (event: LayoutChangeEvent) => setScale(reelScale(event.nativeEvent.layout.height));
  const shown = scale ?? 1;
  const fade = reduceMotion ? tabsMotion.fade : tabsMotion.surfaceFade;

  return (
    <View testID="tipsReel" onLayout={measure} style={[styles.fill, { opacity: scale === null ? 0 : 1 }]} accessible accessibilityLabel={REEL_TIPS.join(" ")}>
      <View style={{ width: STAGE.width * shown, height: STAGE.height * shown }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Pressable testID="tipsReelStage" onPress={() => setScene((now) => (now + 1) % REEL_TIPS.length)} style={[styles.stage, { backgroundColor: phoneFrame.bezelColor, boxShadow: phoneFrame.shadow, transform: [{ scale: shown }] }]}>
          <View style={[styles.screen, { experimental_backgroundImage: linearGradientCss(theme.backdrop, false, 1, 1) }]}>
            <Animated.View key={scene} entering={FadeIn.duration(fade)} exiting={FadeOut.duration(fade)} style={StyleSheet.absoluteFill}>
              {scene === 0 ? <SearchScene clock={clock} theme={theme} /> : scene === 1 ? <CloseScene clock={clock} theme={theme} /> : <BackScene clock={clock} theme={theme} />}
            </Animated.View>
            {reduceMotion ? null : <Finger clock={clock} scene={scene} />}
          </View>
          <View style={styles.island} />
        </Pressable>
      </View>
      <Animated.Text key={`caption${scene}`} testID="tipsReelCaption" entering={FadeIn.duration(fade)} exiting={FadeOut.duration(fade)} style={[font.body, styles.caption, { color: tipsReel.captionInk }]} numberOfLines={1} adjustsFontSizeToFit>
        {REEL_TIPS[scene]}
      </Animated.Text>
      <View style={styles.dots} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {REEL_TIPS.map((tip, index) => (
          <Pressable key={tip} testID="tipsReelDot" hitSlop={tipsReel.dot.hitSlop} onPress={() => setScene(index)} style={[styles.dot, { backgroundColor: withAlpha(tipsReel.captionInk, 0.3) }]}>
            {index < scene || (reduceMotion && index === scene) ? <View style={[styles.dotFill, { width: "100%", backgroundColor: tipsReel.captionInk }]} /> : index === scene ? <DotFill clock={clock} color={tipsReel.captionInk} /> : null}
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function DotFill({ clock, color }: { clock: SharedValue<number>; color: string }) {
  const fill = useAnimatedStyle(() => ({ width: `${clock.value * 100}%` }));
  return <Animated.View style={[styles.dotFill, { backgroundColor: color }, fill]} />;
}

const FINGER_PATHS = [
  (t: number) => {
    "worklet";
    const reach = glide(t, 0.16, 0.36);
    const x = SCREEN_W * 0.66 + (SCREEN_W / 2 - SCREEN_W * 0.66) * reach;
    const y = SCREEN_H * 0.62 + (SCREEN_H - BAR.bottom - BAR.height / 2 - SCREEN_H * 0.62) * reach;
    return { x, y, opacity: span(t, 0.08, 0.16) * (1 - span(t, 0.42, 0.48)), press: pulse(t, 0.34, 0.44) };
  },
  (t: number) => {
    "worklet";
    const deck = tipsReel.deck;
    const lift = glide(t, 0.2, 0.42) * SCREEN_H * deck.lift + span(t, 0.42, 0.5) * SCREEN_H * 0.22;
    return { x: SCREEN_W / 2, y: SCREEN_H * (deck.topShare + deck.heightShare * 0.62) - lift, opacity: span(t, 0.08, 0.16) * (1 - span(t, 0.44, 0.52)), press: span(t, 0.16, 0.2) * (1 - span(t, 0.42, 0.46)) };
  },
  (t: number) => {
    "worklet";
    const back = tipsReel.back;
    return { x: back.edge + glide(t, 0.2, 0.55) * SCREEN_W * back.dragShare, y: SCREEN_H * 0.46, opacity: span(t, 0.08, 0.16) * (1 - span(t, 0.55, 0.63)), press: span(t, 0.16, 0.2) * (1 - span(t, 0.55, 0.59)) };
  },
];

function Finger({ clock, scene }: { clock: SharedValue<number>; scene: number }) {
  const style = useAnimatedStyle(() => {
    const at = FINGER_PATHS[scene]!(clock.value);
    return {
      opacity: at.opacity,
      transform: [{ translateX: at.x - FINGER.side / 2 }, { translateY: at.y - FINGER.side / 2 }, { scale: 1 - (1 - FINGER.pressScale) * at.press }],
    };
  }, [scene]);
  return <Animated.View testID="tipsReelFinger" pointerEvents="none" style={[styles.finger, style]} />;
}

function PageMock({ look, theme }: { look: number; theme: Theme }) {
  const page = tipsReel.page;
  const swatch = PROFILE_COLORS[tipsReel.looks[look % tipsReel.looks.length]!].swatch;
  return (
    <View style={[styles.page, { backgroundColor: theme.groupFill }]}>
      <View style={{ height: SCREEN_H * page.header, experimental_backgroundImage: linearGradientCss(tileGradient(swatch), false, 1, 1) }} />
      <View style={styles.pageWords}>
        <View style={[styles.title, { width: `${page.titleWidth * 100}%`, backgroundColor: withAlpha(theme.label, 0.75) }]} />
        {page.lines.map((share, index) => (
          <View key={index} style={[styles.line, { width: `${share * 100}%`, backgroundColor: withAlpha(theme.label, 0.14) }]} />
        ))}
        <View style={[styles.figure, { backgroundColor: withAlpha(swatch, 0.22) }]} />
        {page.lines.slice(0, 2).map((share, index) => (
          <View key={`tail${index}`} style={[styles.line, { width: `${share * 100}%`, backgroundColor: withAlpha(theme.label, 0.14) }]} />
        ))}
      </View>
    </View>
  );
}

function BottomBar({ theme, children }: { theme: Theme; children?: ReactNode }) {
  return (
    <View style={[styles.bar, { backgroundColor: theme.groupFill, borderColor: theme.cardEdge }]}>
      <Symbol name="squareOnSquare" size={BAR.glyph} color={theme.label} />
      <View style={[styles.plus, { backgroundColor: theme.plusFill }]}>
        {children}
        <Symbol name="plus" size={BAR.glyph} color={theme.label} />
      </View>
      <Symbol name="chevronUp" size={BAR.glyph} color={theme.label} />
    </View>
  );
}

function SearchScene({ clock, theme }: { clock: SharedValue<number>; theme: Theme }) {
  const tray = tipsReel.tray;
  const height = SCREEN_H * tray.share;
  const flash = useAnimatedStyle(() => ({ opacity: pulse(clock.value, 0.34, 0.48), transform: [{ scale: 0.7 + 0.5 * span(clock.value, 0.34, 0.48) }] }));
  const bar = useAnimatedStyle(() => ({ opacity: 1 - span(clock.value, 0.46, 0.54) }));
  const dim = useAnimatedStyle(() => ({ opacity: settle(clock.value, 0.46, 0.62) }));
  const rise = useAnimatedStyle(() => ({ transform: [{ translateY: (1 - settle(clock.value, 0.46, 0.64)) * (height + BAR.bottom) }] }));
  const typed = useAnimatedStyle(() => ({ width: tray.queryWidth * span(clock.value, 0.62, 0.8) }));
  const results = useAnimatedStyle(() => ({ opacity: span(clock.value, 0.78, 0.86), transform: [{ translateY: 6 * (1 - settle(clock.value, 0.78, 0.9)) }] }));
  return (
    <View style={styles.fill}>
      <PageMock look={0} theme={theme} />
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: theme.trayDim }, dim]} />
      <Animated.View style={[styles.barSlot, bar]}>
        <BottomBar theme={theme}>
          <Animated.View style={[styles.plusFlash, { backgroundColor: theme.spaceAccent }, flash]} />
        </BottomBar>
      </Animated.View>
      <Animated.View style={[styles.tray, { height, backgroundColor: theme.groupFill }, rise]}>
        <View style={[styles.field, { backgroundColor: theme.fieldFill }]}>
          <Symbol name="magnifyingglass" size={11} color={theme.secondaryLabel} />
          <Animated.View style={[styles.query, typed]}>
            <Text style={[styles.queryText, { color: theme.label }]} numberOfLines={1}>
              {tray.query}
            </Text>
          </Animated.View>
          <View style={[styles.caret, { backgroundColor: theme.spaceAccentInk }]} />
        </View>
        <Animated.View style={[styles.results, results]}>
          {[0.72, 0.54].map((share) => (
            <View key={share} style={styles.result}>
              <View style={[styles.resultIcon, { backgroundColor: withAlpha(theme.label, 0.12) }]} />
              <View style={[styles.line, { width: `${share * 100}%`, backgroundColor: withAlpha(theme.label, 0.2) }]} />
            </View>
          ))}
        </Animated.View>
        <View style={[styles.keyboard, { backgroundColor: withAlpha(theme.label, 0.05) }]}>
          {tray.keyRows.map((keys, row) => (
            <View key={row} style={styles.keyRow}>
              {Array.from({ length: keys }, (_, key) => (
                <View key={key} style={[styles.key, { backgroundColor: withAlpha(theme.label, theme.dark ? 0.22 : 0.1) }]} />
              ))}
            </View>
          ))}
        </View>
      </Animated.View>
    </View>
  );
}

const DECK = tipsReel.deck;
const CARD_W = SCREEN_W * DECK.widthShare;
const CARD_H = SCREEN_H * DECK.heightShare;
const CARD_PITCH = CARD_W + DECK.gap;

function DeckCard({ clock, slot, look, closes, theme }: { clock: SharedValue<number>; slot: number; look: number; closes: boolean; theme: Theme }) {
  const style = useAnimatedStyle(() => {
    const t = clock.value;
    const shift = slot > 0 ? settle(t, 0.54, 0.76) * CARD_PITCH : 0;
    const lift = closes ? glide(t, 0.2, 0.42) * SCREEN_H * DECK.lift + Easing.in(Easing.quad)(span(t, 0.42, 0.56)) * SCREEN_H : 0;
    const press = closes ? span(t, 0.16, 0.22) * (1 - span(t, 0.42, 0.5)) : 0;
    return {
      opacity: closes ? 1 - span(t, 0.46, 0.56) : 1,
      transform: [{ translateX: slot * CARD_PITCH - shift }, { translateY: -lift }, { scale: 1 - 0.03 * press }],
    };
  }, [slot, closes]);
  return (
    <Animated.View style={[styles.card, { borderColor: theme.cardEdge }, style]}>
      <PageMock look={look} theme={theme} />
    </Animated.View>
  );
}

function CloseScene({ clock, theme }: { clock: SharedValue<number>; theme: Theme }) {
  return (
    <View style={styles.fill}>
      {[-1, 0, 1, 2].map((slot) => (
        <DeckCard key={slot} clock={clock} slot={slot} look={slot + 1} closes={slot === 0} theme={theme} />
      ))}
    </View>
  );
}

function BackScene({ clock, theme }: { clock: SharedValue<number>; theme: Theme }) {
  const back = tipsReel.back;
  const progress = (t: number) => {
    "worklet";
    return glide(t, 0.2, 0.55) * back.dragShare + settle(t, 0.55, 0.72) * (1 - back.dragShare);
  };
  const under = useAnimatedStyle(() => ({ transform: [{ translateX: back.parallax * SCREEN_W * (1 - progress(clock.value)) }] }));
  const shade = useAnimatedStyle(() => ({ opacity: back.shade * (1 - progress(clock.value)) }));
  const top = useAnimatedStyle(() => ({ transform: [{ translateX: progress(clock.value) * SCREEN_W }] }));
  return (
    <View style={styles.fill}>
      <Animated.View style={[StyleSheet.absoluteFill, under]}>
        <PageMock look={1} theme={theme} />
        <Animated.View style={[StyleSheet.absoluteFill, styles.shade, shade]} />
      </Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, styles.lifted, top]}>
        <PageMock look={3} theme={theme} />
      </Animated.View>
      <View style={styles.barSlot}>
        <BottomBar theme={theme} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, alignItems: "center", justifyContent: "center" },
  stage: {
    position: "absolute",
    width: STAGE.width,
    height: STAGE.height,
    left: "50%",
    top: "50%",
    marginLeft: -STAGE.width / 2,
    marginTop: -STAGE.height / 2,
    borderRadius: STAGE.radius,
    ...smoothCorners,
    padding: STAGE.bezel,
  },
  screen: { flex: 1, borderRadius: STAGE.screenRadius, ...smoothCorners, overflow: "hidden" },
  island: { position: "absolute", left: (STAGE.width - STAGE.island.width) / 2 - 1, top: STAGE.island.top + STAGE.bezel, width: STAGE.island.width, height: STAGE.island.height, borderRadius: STAGE.island.height / 2, backgroundColor: "#000000" },
  caption: { marginTop: tipsReel.captionGap, minHeight: tipsReel.captionHeight, textAlign: "center", fontWeight: "600", paddingHorizontal: space.l },
  dots: { flexDirection: "row", gap: tipsReel.dot.gap, marginTop: tipsReel.dotsGap },
  dot: { width: tipsReel.dot.width, height: tipsReel.dot.height, borderRadius: tipsReel.dot.height / 2, overflow: "hidden" },
  dotFill: { height: "100%", borderRadius: tipsReel.dot.height / 2 },
  finger: { position: "absolute", left: 0, top: 0, width: FINGER.side, height: FINGER.side, borderRadius: FINGER.side / 2, backgroundColor: tipsReel.fingerFill, borderWidth: FINGER.ring, borderColor: tipsReel.fingerRing, boxShadow: tipsReel.fingerShadow },
  page: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, overflow: "hidden" },
  pageWords: { padding: tipsReel.page.pad, gap: tipsReel.page.gap },
  title: { height: tipsReel.page.title, borderRadius: tipsReel.page.title / 2, marginBottom: 2 },
  line: { height: tipsReel.page.line, borderRadius: tipsReel.page.line / 2 },
  figure: { height: SCREEN_H * 0.12, borderRadius: 8, marginVertical: 2 },
  barSlot: { position: "absolute", left: BAR.inset, right: BAR.inset, bottom: BAR.bottom },
  bar: { height: BAR.height, borderRadius: BAR.height / 2, borderWidth: StyleSheet.hairlineWidth, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: space.m, boxShadow: "0px 4px 14px rgba(0, 0, 0, 0.18)" },
  plus: { width: BAR.plus, height: BAR.plus, borderRadius: BAR.plus / 2, alignItems: "center", justifyContent: "center" },
  plusFlash: { position: "absolute", width: BAR.plus, height: BAR.plus, borderRadius: BAR.plus / 2 },
  tray: { position: "absolute", left: 0, right: 0, bottom: 0, borderTopLeftRadius: tipsReel.tray.radius, borderTopRightRadius: tipsReel.tray.radius, ...smoothCorners, padding: space.s, gap: space.s, boxShadow: "0px -4px 18px rgba(0, 0, 0, 0.16)" },
  field: { height: tipsReel.tray.field, borderRadius: tipsReel.tray.field / 2, flexDirection: "row", alignItems: "center", paddingHorizontal: space.s + 2, gap: space.xs },
  query: { overflow: "hidden" },
  queryText: { fontSize: 11, lineHeight: 14, fontWeight: "500", width: tipsReel.tray.queryWidth },
  caret: { width: 1.5, height: tipsReel.tray.caret, borderRadius: 1 },
  results: { gap: space.s, paddingHorizontal: space.xs },
  result: { flexDirection: "row", alignItems: "center", gap: space.s },
  resultIcon: { width: 14, height: 14, borderRadius: 4 },
  keyboard: { flex: 1, borderRadius: 10, padding: space.xs, gap: tipsReel.tray.rowGap, justifyContent: "flex-end" },
  keyRow: { flexDirection: "row", justifyContent: "center", gap: tipsReel.tray.keyGap },
  key: { flex: 1, maxWidth: 12, height: tipsReel.tray.keyHeight, borderRadius: 3 },
  card: { position: "absolute", left: (SCREEN_W - CARD_W) / 2, top: SCREEN_H * DECK.topShare, width: CARD_W, height: CARD_H, borderRadius: DECK.radius, ...smoothCorners, overflow: "hidden", borderWidth: StyleSheet.hairlineWidth },
  shade: { backgroundColor: "#000000" },
  lifted: { boxShadow: tipsReel.pageShadow },
});
