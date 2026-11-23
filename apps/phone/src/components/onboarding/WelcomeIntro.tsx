import { useEffect, useState } from "react";
import { StyleSheet, useWindowDimensions, View, type ViewInstance } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withSpring, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ellipse, Host, Rectangle, Text as SwiftText, ZStack } from "@expo/ui/swift-ui";
import { accessibilityHidden, animation, Animation, blur, font, foregroundStyle, frame, multilineTextAlignment, offset, onAppear, opacity, padding, scaleEffect } from "@expo/ui/swift-ui/modifiers";
import { hslToRgb, parseColor, rgbToHsl, toHex } from "../../lib/color";
import type { ProfileLook } from "../../lib/profileLook";
import { ActionButton, AppIcon, spring, useProfileLook, useReduceMotion } from "../ui";
import { welcomeIntro } from "./onboardingTokens";

export const WELCOME_TITLE = "Welcome to Ardia";

type Blob = { color: string; from: { x: number; y: number }; to: { x: number; y: number }; side: number; fade: number; driftS: number };

const tone = (hue: number, saturation: number, lightness: number) => toHex(hslToRgb(((hue % 1) + 1) % 1, saturation, lightness).map((channel) => channel * 255));

export function introPalette(look: ProfileLook): { base: string; blobs: Blob[] } {
  const [r, g, b] = parseColor(look.swatch);
  const [hue] = rgbToHsl(r / 255, g / 255, b / 255);
  const vivid = look.isNeutral ? welcomeIntro.neutralSaturation : welcomeIntro.saturation;
  return {
    base: tone(hue, vivid, welcomeIntro.baseLightness),
    blobs: welcomeIntro.blobs.map((blob) => ({
      color: tone(hue + blob.hueShift, vivid, blob.lightness),
      from: blob.from,
      to: blob.to,
      side: blob.side,
      fade: blob.fade,
      driftS: blob.driftS,
    })),
  };
}

function useAfterAppear(delayMs = 0): [boolean, () => void] {
  const [appeared, setAppeared] = useState(false);
  const [started, setStarted] = useState(false);
  useEffect(() => {
    if (!appeared) return;
    const timer = setTimeout(() => setStarted(true), delayMs);
    return () => clearTimeout(timer);
  }, [appeared, delayMs]);
  return [started, () => setAppeared(true)];
}

export function WelcomeMesh({ onShown }: { onShown?: () => void }) {
  const look = useProfileLook();
  const reduceMotion = useReduceMotion();
  const palette = introPalette(look);
  const [bloomed, appeared] = useAfterAppear(welcomeIntro.appearSettleMs);
  const [drifting, appearedForDrift] = useAfterAppear(welcomeIntro.driftDelayMs);
  const shown = () => {
    appeared();
    appearedForDrift();
    onShown?.();
  };
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: palette.base }]}>
    <Host testID="welcomeMesh" ignoreSafeArea="all" style={StyleSheet.absoluteFill} colorScheme="dark">
      <ZStack modifiers={[accessibilityHidden(true), onAppear(shown)]}>
        <Rectangle modifiers={[foregroundStyle(palette.base)]} />
        {palette.blobs.map((blob, index) => (
          <Ellipse
            key={index}
            modifiers={[
              foregroundStyle(blob.color),
              frame({ width: blob.side, height: blob.side }),
              scaleEffect(bloomed || reduceMotion ? 1 : welcomeIntro.bloomFrom),
              opacity(bloomed || reduceMotion ? blob.fade : 0),
              animation(Animation.smooth({ duration: welcomeIntro.bloomS }).delay(welcomeIntro.bloomDelayS + index * welcomeIntro.bloomStaggerS), bloomed),
              offset(drifting && !reduceMotion ? blob.to : blob.from),
              animation(Animation.easeInOut({ duration: blob.driftS }).repeat({ repeatCount: welcomeIntro.driftRepeats, autoreverses: true }), drifting),
              blur(welcomeIntro.blobBlur),
            ]}
          />
        ))}
      </ZStack>
    </Host>
    </View>
  );
}

export function WelcomeIntro({ onStart, headingRef }: { onStart: () => void; headingRef?: (node: ViewInstance | null) => void }) {
  const reduceMotion = useReduceMotion();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const [revealed, titleAppeared] = useAfterAppear(welcomeIntro.appearSettleMs);
  const flight = useSharedValue(reduceMotion ? 1 : 0);
  const shown = useSharedValue(reduceMotion ? 0 : 1);
  const action = useSharedValue(0);
  const iconTop = height * welcomeIntro.iconTopShare - insets.top;
  const fromCenter = height / 2 - insets.top - (iconTop + welcomeIntro.iconSide / 2);

  useEffect(() => {
    if (!revealed) return;
    if (reduceMotion) {
      shown.value = withTiming(1, { duration: welcomeIntro.reducedFadeMs });
      action.value = withDelay(welcomeIntro.reducedFadeMs, withTiming(1, { duration: welcomeIntro.reducedFadeMs }));
      return;
    }
    flight.value = withDelay(welcomeIntro.holdMs, withSpring(1, spring(welcomeIntro.flight.response, welcomeIntro.flight.damping)));
    shown.value = 1;
    action.value = withDelay(welcomeIntro.actionDelayMs, withSpring(1, spring(0.5, 0.9)));
  }, [revealed, reduceMotion, flight, shown, action]);

  const icon = useAnimatedStyle(() => {
    const travel = 1 - flight.value;
    return {
      opacity: shown.value,
      transform: [
        { translateY: fromCenter * travel },
        { scale: 1 + (welcomeIntro.launchScale - 1) * travel },
        { rotate: `${welcomeIntro.wobbleDegrees * Math.sin(Math.min(1, Math.max(0, flight.value)) * Math.PI)}deg` },
      ],
    };
  }, [fromCenter]);
  const start = useAnimatedStyle(() => ({ opacity: action.value, transform: [{ translateY: (1 - action.value) * welcomeIntro.actionRise }] }));
  const sharp = revealed || reduceMotion;

  return (
    <View testID="welcomeIntro" style={styles.fill}>
      <Animated.View testID="welcomeIcon" style={[styles.icon, { top: iconTop }, icon]}>
        <AppIcon side={welcomeIntro.iconSide} shadow scalesWithText={false} />
      </Animated.View>
      <View style={styles.fill} />
      <View ref={headingRef} accessible accessibilityRole="header" accessibilityLabel={WELCOME_TITLE} style={styles.words}>
        <Host matchContents={{ vertical: true }} style={styles.wordsHost} colorScheme="dark">
          <SwiftText
            modifiers={[
              font({ size: welcomeIntro.titleSize, weight: "bold", design: "rounded" }),
              foregroundStyle("#FFFFFF"),
              multilineTextAlignment("center"),
              frame({ maxWidth: welcomeIntro.titleMaxWidth }),
              padding({ all: welcomeIntro.blurRoom }),
              blur(sharp ? 0 : welcomeIntro.titleBlur),
              scaleEffect(sharp ? 1 : welcomeIntro.titleFromScale),
              opacity(sharp ? 1 : 0),
              animation(reduceMotion ? Animation.easeOut({ duration: welcomeIntro.reducedFadeMs / 1000 }) : Animation.smooth({ duration: welcomeIntro.titleS }).delay(welcomeIntro.titleDelayS), sharp),
              accessibilityHidden(true),
              onAppear(titleAppeared),
            ]}
          >
            {WELCOME_TITLE}
          </SwiftText>
        </Host>
      </View>
      <Animated.View testID="onboardingActions" style={[styles.actions, start]}>
        <ActionButton testID="onboardingPrimary" title="Get Started" onPress={onStart} variant="filled" tone="overlay" size="hero" capsule />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  icon: { position: "absolute", alignSelf: "center", zIndex: 1 },
  words: { alignItems: "center", marginBottom: welcomeIntro.wordsBottom },
  wordsHost: { alignSelf: "stretch" },
  actions: { paddingHorizontal: welcomeIntro.actionsInset, paddingBottom: welcomeIntro.actionsBottom },
});
