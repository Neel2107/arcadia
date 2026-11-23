import { useEffect, useState, type ReactNode } from "react";
import { StyleSheet, Text, View, type LayoutChangeEvent } from "react-native";
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withTiming, type SharedValue } from "react-native-reanimated";
import { withAlpha } from "../../lib/color";
import { tileGradient } from "../../lib/favicon";
import { linearGradientCss } from "../../lib/gradient";
import { PROFILE_COLORS, shadowCss, smoothCorners, space, Symbol, useReduceMotion, useTheme, type Theme } from "../ui";
import { blockingScene } from "./onboardingTokens";

const CARD = blockingScene.card;
const BADGE = blockingScene.badge;
const REDUCED_FRAME = 0.8;

const span = (t: number, from: number, to: number) => {
  "worklet";
  return Math.min(1, Math.max(0, (t - from) / (to - from)));
};

const settle = (t: number, from: number, to: number) => {
  "worklet";
  return Easing.inOut(Easing.cubic)(span(t, from, to));
};

const popped = (t: number, from: number) => {
  "worklet";
  const grow = Easing.out(Easing.back(2.2))(span(t, from, from + 0.07));
  return grow * (1 - span(t, from + 0.1, from + 0.16));
};

type Strike = { at: number };

export const sceneScale = (width: number, height: number) => Math.min(blockingScene.maxScale, Math.max(blockingScene.minScale, Math.min(width / (CARD.width + 2 * space.l), height / (CARD.height + 2 * space.l))));

export function BlockingScene() {
  const theme = useTheme();
  const reduceMotion = useReduceMotion();
  const clock = useSharedValue(reduceMotion ? REDUCED_FRAME : 0);
  const [loop, setLoop] = useState(0);
  const [scale, setScale] = useState<number | null>(null);

  useEffect(() => {
    if (reduceMotion) {
      clock.value = REDUCED_FRAME;
      return;
    }
    clock.value = 0;
    clock.value = withTiming(1, { duration: blockingScene.loopMs, easing: Easing.linear });
    const timer = setTimeout(() => setLoop((now) => now + 1), blockingScene.loopMs);
    return () => {
      clearTimeout(timer);
      cancelAnimation(clock);
    };
  }, [loop, reduceMotion, clock]);

  const measure = (event: LayoutChangeEvent) => setScale(sceneScale(event.nativeEvent.layout.width, event.nativeEvent.layout.height));
  const veil = useAnimatedStyle(() => ({ opacity: reduceMotion ? 1 : span(clock.value, 0, 0.05) * (1 - span(clock.value, 0.95, 1)) }), [reduceMotion]);
  const shown = scale ?? 1;

  return (
    <View testID="blockingScene" onLayout={measure} style={[styles.fill, { opacity: scale === null ? 0 : 1 }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={[styles.card, { backgroundColor: theme.groupFill, boxShadow: shadowCss("floating", theme.dark), transform: [{ scale: shown }] }]}>
        <Animated.View style={[styles.page, veil]}>
          <Collapsing clock={clock} strike={{ at: blockingScene.strikes.banner }} height={blockingScene.banner} theme={theme}>
            <AdFace label="Ad" colors={tileGradient(PROFILE_COLORS.orange.swatch)} />
          </Collapsing>
          <View style={[styles.title, { backgroundColor: withAlpha(theme.label, 0.8) }]} />
          {blockingScene.lines.map((share, index) => (
            <View key={index} style={[styles.line, { width: `${share * 100}%`, backgroundColor: withAlpha(theme.label, 0.14) }]} />
          ))}
          <Collapsing clock={clock} strike={{ at: blockingScene.strikes.inline }} height={blockingScene.inline} theme={theme}>
            <AdFace label="Sponsored" colors={tileGradient(PROFILE_COLORS.green.swatch)} />
          </Collapsing>
          {blockingScene.lines.map((share, index) => (
            <View key={`after${index}`} style={[styles.line, { width: `${(1.1 - share * 0.4) * 80}%`, backgroundColor: withAlpha(theme.label, 0.14) }]} />
          ))}
          <View style={[styles.figure, { backgroundColor: withAlpha(PROFILE_COLORS.blue.swatch, 0.22) }]} />
          {blockingScene.lines.slice(0, 3).map((share, index) => (
            <View key={`tail${index}`} style={[styles.line, { width: `${share * 100}%`, backgroundColor: withAlpha(theme.label, 0.14) }]} />
          ))}
        </Animated.View>
        <CookieBar clock={clock} theme={theme} veil={veil} />
      </View>
    </View>
  );
}

function AdFace({ label, colors }: { label: string; colors: [string, string] }) {
  return (
    <View style={[styles.ad, { experimental_backgroundImage: linearGradientCss(colors, true, CARD.width, blockingScene.banner) }]}>
      <View style={styles.adTag}>
        <Text style={styles.adTagText}>{label}</Text>
      </View>
      <View style={styles.adLines}>
        <View style={[styles.adLine, { width: "62%" }]} />
        <View style={[styles.adLine, { width: "40%", opacity: 0.6 }]} />
      </View>
      <View style={styles.adButton} />
    </View>
  );
}

function Badge({ clock, at, theme }: { clock: SharedValue<number>; at: number; theme: Theme }) {
  const style = useAnimatedStyle(() => {
    const grow = popped(clock.value, at);
    return { opacity: Math.min(1, grow * 1.5), transform: [{ scale: grow }] };
  }, [at]);
  return (
    <Animated.View pointerEvents="none" style={[styles.badge, { backgroundColor: theme.spaceAccent, boxShadow: shadowCss("control", theme.dark) }, style]}>
      <Symbol name="handRaised" size={BADGE * 0.52} color={theme.onSpaceAccent} />
    </Animated.View>
  );
}

function Collapsing({ clock, strike, height, theme, children }: { clock: SharedValue<number>; strike: Strike; height: number; theme: Theme; children: ReactNode }) {
  const style = useAnimatedStyle(() => {
    const gone = settle(clock.value, strike.at + 0.12, strike.at + 0.24);
    return { height: height * (1 - gone), marginBottom: blockingScene.gap * (1 - gone) - blockingScene.gap, opacity: 1 - span(clock.value, strike.at + 0.11, strike.at + 0.19), transform: [{ scale: 1 - 0.06 * gone }] };
  }, [strike.at, height]);
  return (
    <Animated.View style={[styles.collapsing, style]}>
      {children}
      <View style={styles.badgeSlot} pointerEvents="none">
        <Badge clock={clock} at={strike.at} theme={theme} />
      </View>
    </Animated.View>
  );
}

function CookieBar({ clock, theme, veil }: { clock: SharedValue<number>; theme: Theme; veil: ReturnType<typeof useAnimatedStyle> }) {
  const at = blockingScene.strikes.cookies;
  const slide = useAnimatedStyle(() => ({ transform: [{ translateY: settle(clock.value, at + 0.12, at + 0.24) * (blockingScene.cookie + space.l) }] }), [at]);
  return (
    <Animated.View style={[styles.cookie, { backgroundColor: theme.dark ? blockingScene.cookieFill.dark : blockingScene.cookieFill.light, boxShadow: shadowCss("card", theme.dark) }, slide, veil]}>
      <View style={styles.cookieWords}>
        <Text style={[styles.cookieTitle, { color: theme.label }]}>We value your privacy</Text>
        <View style={[styles.line, { width: "86%", backgroundColor: withAlpha(theme.label, 0.16) }]} />
      </View>
      <View style={styles.cookieButtons}>
        <View style={[styles.cookieButton, { backgroundColor: withAlpha(theme.label, 0.12) }]} />
        <View style={[styles.cookieButton, { backgroundColor: PROFILE_COLORS.blue.swatch }]} />
      </View>
      <View style={styles.badgeSlot} pointerEvents="none">
        <Badge clock={clock} at={at} theme={theme} />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, alignSelf: "stretch", alignItems: "center", justifyContent: "center" },
  card: { width: CARD.width, height: CARD.height, borderRadius: CARD.radius, ...smoothCorners, overflow: "hidden" },
  page: { padding: CARD.pad, gap: blockingScene.gap },
  title: { height: 10, width: "72%", borderRadius: 5, marginTop: 2 },
  line: { height: 6, borderRadius: 3 },
  figure: { height: 70, borderRadius: 10 },
  collapsing: { overflow: "visible" },
  ad: { flex: 1, borderRadius: 10, overflow: "hidden", flexDirection: "row", alignItems: "center", paddingHorizontal: space.m, gap: space.s },
  adTag: { position: "absolute", top: 5, left: 6, paddingHorizontal: 4, paddingVertical: 1, borderRadius: 3, backgroundColor: "rgba(0,0,0,0.28)" },
  adTagText: { color: "#FFFFFF", fontSize: 7.5, fontWeight: "700", letterSpacing: 0.3 },
  adLines: { flex: 1, gap: 5, paddingTop: 8 },
  adLine: { height: 6, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.9)" },
  adButton: { width: 34, height: 16, borderRadius: 8, borderWidth: 1.5, marginTop: 8, borderColor: "rgba(255,255,255,0.9)" },
  badgeSlot: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center" },
  badge: { width: BADGE, height: BADGE, borderRadius: BADGE / 2, alignItems: "center", justifyContent: "center" },
  cookie: { position: "absolute", left: space.s, right: space.s, bottom: space.s, height: blockingScene.cookie, borderRadius: 14, ...smoothCorners, padding: space.m, flexDirection: "row", alignItems: "center", gap: space.m },
  cookieWords: { flex: 1, gap: 6 },
  cookieTitle: { fontSize: 10, fontWeight: "700" },
  cookieButtons: { gap: 5 },
  cookieButton: { width: 46, height: 14, borderRadius: 7 },
});
