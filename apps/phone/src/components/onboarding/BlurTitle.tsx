import { useState } from "react";
import { StyleSheet, View, type ViewInstance } from "react-native";
import { Host, Text as SwiftText } from "@expo/ui/swift-ui";
import { accessibilityHidden, animation, Animation, blur, font, foregroundStyle, frame, multilineTextAlignment, onAppear, opacity, padding, scaleEffect } from "@expo/ui/swift-ui/modifiers";
import { useReduceMotion } from "../ui";
import { blurTitle } from "./onboardingTokens";

export function BlurTitle({ text, size = blurTitle.size, delayS = blurTitle.delayS, headingRef }: { text: string; size?: number; delayS?: number; headingRef?: (node: ViewInstance | null) => void }) {
  const reduceMotion = useReduceMotion();
  const [appeared, setAppeared] = useState(false);
  const sharp = appeared || reduceMotion;
  return (
    <View ref={headingRef} testID="blurTitle" accessible accessibilityRole="header" accessibilityLabel={text} style={styles.slot}>
      <Host matchContents={{ vertical: true }} style={styles.host} colorScheme="dark">
        <SwiftText
          modifiers={[
            font({ size, weight: "bold", design: "rounded" }),
            foregroundStyle(blurTitle.ink),
            multilineTextAlignment("center"),
            frame({ maxWidth: blurTitle.maxWidth }),
            padding({ horizontal: blurTitle.room, vertical: blurTitle.room / 2 }),
            blur(sharp ? 0 : blurTitle.blur),
            scaleEffect(sharp ? 1 : blurTitle.fromScale),
            opacity(sharp ? 1 : 0),
            animation(reduceMotion ? Animation.easeOut({ duration: blurTitle.reducedS }) : Animation.smooth({ duration: blurTitle.durationS }).delay(delayS), sharp),
            accessibilityHidden(true),
            onAppear(() => setAppeared(true)),
          ]}
        >
          {text}
        </SwiftText>
      </Host>
    </View>
  );
}

const styles = StyleSheet.create({
  slot: { alignSelf: "stretch", alignItems: "center", marginVertical: -blurTitle.room / 2 },
  host: { alignSelf: "stretch" },
});
