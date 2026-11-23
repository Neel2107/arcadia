import { Pressable, StyleSheet, Text } from "react-native";
import { ActionButton, font, smoothCorners, space, Toggle, type ActionInk } from "../ui";
import { CrossfadeText } from "../settings/SettingsKit";
import { brand } from "./onboardingTokens";

export const KIT_INK = {
  primary: { fill: brand.paper, label: brand.ink, edge: "transparent" },
  secondary: { fill: "transparent", label: brand.cream, edge: "transparent" },
} as const satisfies Record<string, ActionInk>;

export const KIT_DEFAULT_BROWSER = {
  title: brand.cream,
  body: brand.creamMuted,
  cardFill: brand.glass,
  cardEdge: brand.glassEdge,
  divider: brand.glassEdge,
  primary: KIT_INK.primary,
  secondary: KIT_INK.secondary,
} as const;

export function KitPrimary({ title, onPress, testID = "onboardingPrimary" }: { title: string; onPress: () => void; testID?: string }) {
  return <ActionButton testID={testID} title={title} onPress={onPress} variant="filled" size="hero" capsule ink={KIT_INK.primary} />;
}

export function KitSecondary({ title, onPress }: { title: string; onPress: () => void }) {
  return <ActionButton title={title} onPress={onPress} variant="plain" size="regular" ink={KIT_INK.secondary} />;
}

export function KitSubtitle({ text, testID = "onboardingSubtitle" }: { text: string; testID?: string }) {
  return <CrossfadeText testID={testID} text={text} style={[font.body, styles.subtitle]} />;
}

export function KitSettingRow({ label, value, onChange, testID }: { label: string; value: boolean; onChange: (on: boolean) => void; testID?: string }) {
  return (
    <Pressable testID={testID} accessibilityRole="switch" accessibilityLabel={label} accessibilityState={{ checked: value }} onPress={() => onChange(!value)} style={styles.row}>
      <Text style={[font.body, styles.rowLabel]} numberOfLines={2} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {label}
      </Text>
      <Toggle value={value} onChange={onChange} label={label} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  subtitle: { textAlign: "center", color: brand.creamMuted },
  row: {
    minHeight: 56,
    borderRadius: 28,
    ...smoothCorners,
    backgroundColor: brand.glass,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: brand.glassEdge,
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: space.xl,
    paddingRight: space.m,
    gap: space.m,
  },
  rowLabel: { flex: 1, color: brand.cream },
});
