import { useEffect } from "react";
import { AppState, Platform, StyleSheet, Text, useWindowDimensions, View, type ViewInstance } from "react-native";
import { askForDefaultBrowser, refreshDefaultBrowser, useDefaultBrowser } from "../../state/settings/defaultBrowser";
import { popSettings } from "../../state/settings/nav";
import { defaultBrowserCopy } from "../../state/settings/settingsRules";
import { ActionButton, AppIcon, font, ink, PrimaryButton, radius, settingsLayout, settingsTint, space, spacesLayout, Symbol, useTheme, smoothCorners, type ActionInk } from "../ui";
import { SettingsPage } from "./SettingsKit";

export type DefaultBrowserPalette = { title: string; body: string; cardFill: string; cardEdge: string; divider: string; primary: ActionInk; secondary: ActionInk };

export function DefaultBrowserSteps({ onLater, onDone, headingRef, inkActions = false, palette }: { onLater?: () => void; onDone?: () => void; headingRef?: (node: ViewInstance | null) => void; inkActions?: boolean; palette?: DefaultBrowserPalette }) {
  const theme = useTheme();
  const titleInk = palette?.title ?? theme.label;
  const bodyInk = palette?.body ?? theme.secondaryLabel;
  const status = useDefaultBrowser((s) => s.status);
  const { fontScale } = useWindowDimensions();
  useEffect(() => {
    void refreshDefaultBrowser();
    const returns = AppState.addEventListener("change", (next) => {
      if (next === "active") void refreshDefaultBrowser();
    });
    return () => returns.remove();
  }, []);
  if (!status) return null;
  const copy = defaultBrowserCopy(status);
  const listsSteps = fontScale >= settingsLayout.accessibilityFontScale;
  const ask = async () => {
    if (copy.inSettings) onDone?.();
    const after = await askForDefaultBrowser(copy.does);
    if (copy.inSettings) return;
    if (after.unavailable) onLater?.();
    else if (after.status?.isDefault) onDone?.();
  };
  return (
    <View style={styles.column}>
      <View style={styles.words}>
        <Text ref={headingRef} accessibilityRole="header" style={[font.title, styles.heavy, { color: titleInk }]}>
          {copy.title}
        </Text>
        <Text style={[font.body, styles.centered, { color: bodyInk }]}>{copy.subtitle}</Text>
      </View>
      {copy.steps.length && listsSteps ? (
        <View testID="defaultBrowserList" style={styles.list}>
          {copy.steps.map((step, index) => (
            <Text key={step} style={[font.body, { color: titleInk }]}>{`${index + 1}. ${step}`}</Text>
          ))}
        </View>
      ) : copy.steps.length ? (
        <View style={[styles.card, palette ? { backgroundColor: palette.cardFill, borderWidth: StyleSheet.hairlineWidth, borderColor: palette.cardEdge } : { backgroundColor: theme.groupFill }]}>
          {copy.steps.map((step, index) => (
            <View key={step}>
              <View accessible style={styles.step}>
                <StepIcon index={index} count={copy.steps.length} inSettings={copy.inSettings} />
                <Text style={[font.body, styles.fill, { color: titleInk }]}>{`${index + 1}. ${step}`}</Text>
              </View>
              {index < copy.steps.length - 1 ? <View style={[styles.divider, { backgroundColor: palette?.divider ?? theme.separator }]} /> : null}
            </View>
          ))}
        </View>
      ) : null}
      <View style={styles.actions}>
        {copy.action ? (
          inkActions || palette ? <ActionButton title={copy.action} onPress={() => void ask()} variant="filled" tone="ink" size="hero" capsule ink={palette?.primary} /> : <PrimaryButton title={copy.action} onPress={() => void ask()} />
        ) : onLater ? (
          inkActions || palette ? <ActionButton title="Continue" onPress={onLater} variant="filled" tone="ink" size="hero" capsule ink={palette?.primary} /> : <PrimaryButton title="Continue" onPress={onLater} />
        ) : null}
        {copy.action && onLater ? (
          <ActionButton title="Maybe Later" onPress={onLater} variant="plain" tone={inkActions ? "ink" : "neutral"} size="regular" ink={palette?.secondary} />
        ) : null}
      </View>
    </View>
  );
}

function StepIcon({ index, count, inSettings }: { index: number; count: number; inSettings: boolean }) {
  const theme = useTheme();
  if (index === count - 1) return <AppIcon side={settingsLayout.tile} />;
  if (inSettings && index === 0) {
    return (
      <View style={[styles.tile, { backgroundColor: settingsTint.neutral }]}>
        <Symbol name="gearshape" size={17} color={ink.white} />
      </View>
    );
  }
  if (inSettings) {
    return (
      <View style={styles.tile}>
        <Symbol name="handPointUpLeftFill" size={18} color={theme.secondaryLabel} />
      </View>
    );
  }
  return (
    <View style={[styles.tile, { backgroundColor: settingsTint.defaultBrowser }]}>
      <Symbol name="handPointUpLeftFill" size={18} color={ink.white} />
    </View>
  );
}

export function DefaultBrowserPage() {
  return (
    <SettingsPage title="Default Browser" onBack={popSettings}>
      <DefaultBrowserSteps />
    </SettingsPage>
  );
}

const styles = StyleSheet.create({
  column: { gap: space.xxl, paddingHorizontal: space.l + 4, paddingTop: space.l },
  words: { gap: space.s, alignItems: "center" },
  heavy: { fontWeight: "700", textAlign: "center", ...(Platform.OS === "ios" ? { fontFamily: "ui-rounded" } : null) },
  list: { gap: space.m },
  centered: { textAlign: "center" },
  fill: { flex: 1 },
  card: { borderRadius: radius.card, ...smoothCorners, overflow: "hidden" },
  step: { flexDirection: "row", alignItems: "center", gap: space.m, minHeight: 52, paddingHorizontal: space.l },
  tile: { width: settingsLayout.tile, height: settingsLayout.tile, borderRadius: spacesLayout.stepTileRadius, ...smoothCorners, alignItems: "center", justifyContent: "center" },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: spacesLayout.stepDividerInset },
  actions: { gap: space.s },
});
