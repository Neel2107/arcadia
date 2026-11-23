import { Pressable, StyleSheet, View } from "react-native";
import Animated, { useAnimatedStyle, withSpring } from "react-native-reanimated";
import { tileGradient } from "../../lib/favicon";
import { linearGradientCss } from "../../lib/gradient";
import { haptics } from "../../state/app/haptics";
import { setColorChoice } from "../../state/settings/actions";
import { usePreferences } from "../../state/settings/hooks";
import { PROFILE_COLORS, spring, Symbol, useReduceMotion, type ProfileColor } from "../ui";
import { colorStep } from "./onboardingTokens";

export const ONBOARDING_COLORS = Object.keys(PROFILE_COLORS) as ProfileColor[];

export function ColorChoices() {
  const chosen = usePreferences((p) => p.colorChoice);
  const rows: ProfileColor[][] = [];
  for (let at = 0; at < ONBOARDING_COLORS.length; at += colorStep.perRow) rows.push(ONBOARDING_COLORS.slice(at, at + colorStep.perRow));
  return (
    <View testID="colorChoices" accessibilityRole="radiogroup" style={styles.grid}>
      {rows.map((row, index) => (
        <View key={index} style={styles.row}>
          {row.map((color) => (
            <Swatch key={color} color={color} selected={chosen === color} />
          ))}
        </View>
      ))}
    </View>
  );
}

const settle = spring(0.35, 0.6);

function Swatch({ color, selected }: { color: ProfileColor; selected: boolean }) {
  const reduceMotion = useReduceMotion();
  const ring = useAnimatedStyle(() => ({ opacity: withSpring(selected ? 1 : 0, settle), transform: [{ scale: reduceMotion ? 1 : withSpring(selected ? 1 : 0.8, settle) }] }), [selected, reduceMotion]);
  const mark = useAnimatedStyle(() => ({ opacity: withSpring(selected ? 1 : 0, settle), transform: [{ scale: reduceMotion ? 1 : withSpring(selected ? 1 : 0.4, settle) }] }), [selected, reduceMotion]);
  const pick = () => {
    if (selected) return;
    haptics.selection();
    setColorChoice(color);
  };
  return (
    <Pressable
      testID={`colorChoice-${color}`}
      accessibilityRole="radio"
      accessibilityLabel={PROFILE_COLORS[color].name}
      accessibilityState={{ selected, checked: selected }}
      onPress={pick}
      style={({ pressed }) => [styles.slot, { transform: [{ scale: pressed && !reduceMotion ? colorStep.pressScale : 1 }] }]}
    >
      <Animated.View pointerEvents="none" style={[styles.ring, ring]} />
      <View style={[styles.swatch, { experimental_backgroundImage: linearGradientCss(tileGradient(PROFILE_COLORS[color].swatch), true, colorStep.swatch, colorStep.swatch) }]}>
        <Animated.View style={mark}>
          <Symbol name="checkmark" size={colorStep.check} color="#FFFFFF" weight="semibold" />
        </Animated.View>
      </View>
    </Pressable>
  );
}

const SLOT = colorStep.swatch + 2 * (colorStep.ring + colorStep.ringGap);

const styles = StyleSheet.create({
  grid: { gap: colorStep.gap - 2 * (colorStep.ring + colorStep.ringGap) + 8, alignItems: "center" },
  row: { flexDirection: "row", gap: colorStep.gap - 2 * (colorStep.ring + colorStep.ringGap) + 8 },
  slot: { width: SLOT, height: SLOT, alignItems: "center", justifyContent: "center" },
  ring: { position: "absolute", width: SLOT, height: SLOT, borderRadius: SLOT / 2, borderWidth: colorStep.ring, borderColor: "#FFFFFF" },
  swatch: { width: colorStep.swatch, height: colorStep.swatch, borderRadius: colorStep.swatch / 2, alignItems: "center", justifyContent: "center", boxShadow: "0px 6px 18px rgba(0, 0, 0, 0.25)" },
});
