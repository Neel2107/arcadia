import { Easing } from "react-native-reanimated";
import { departBezier, easeOutBezier, font, iPhoneOr, motionAliases, shape, space, tabsMotion } from "../ui";
import type { Motion } from "../ui/motion";

type Curve = readonly [number, number, number, number];

type TextSize = { fontSize: number; lineHeight: number };

export const onboardingLayout = {
  title: iPhoneOr<TextSize>(font.title, font.largeTitle),
  welcomeTitle: iPhoneOr<TextSize>(font.title, font.hero),
  welcomeSubtitleSize: iPhoneOr<TextSize>(font.body, font.title3),
  welcomeIconBottom: iPhoneOr(space.xxl, 0),
  welcomeGap: iPhoneOr(0, space.xxl),
  welcomeActionsTop: iPhoneOr(space.xxl, 0),
  illustrationInset: space.l,
  wordsTop: space.xl,
  wordsInset: space.huge,
  wordsGap: space.m,
  actionsTop: space.xxl,
  actionsInset: space.xl + space.xs,
  actionsBottom: space.m,
  actionsGap: space.s,
  rowHeight: iPhoneOr(56, 50),
  rowInset: space.l,
  cardInset: space.xs,
  cardRadius: shape.card,
  sketchScale: iPhoneOr(1.22, 1),
  rowIcons: iPhoneOr(false, true),
  startBackdrop: iPhoneOr(true, false),
  blockingScene: iPhoneOr(true, false),
  plainSharing: iPhoneOr(true, false),
  welcomeSubtitle: iPhoneOr(false, true),
  tipIcons: iPhoneOr(false, true),
  tipGlyph: 20,
  tipGlyphSlot: 28,
  minPage: 560,
  scrollsAboveFontScale: 1.35,
} as const;

export const onboardingInk = {
  light: { welcome: "#FFFFFF", steps: "#F2F2F7", subtitle: "rgba(60,60,67,0.88)" },
  dark: { welcome: "#000000", steps: "#000000", subtitle: "rgba(235,235,245,0.8)" },
} as const;

export const blurTitle = {
  size: 30,
  ink: "#FFFFFF",
  maxWidth: 340,
  room: 24,
  blur: 22,
  fromScale: 1.25,
  durationS: 0.85,
  delayS: 0.12,
  reducedS: 0.3,
} as const;

export const colorStep = {
  swatch: 58,
  gap: 22,
  ring: 3,
  ringGap: 4,
  perRow: 3,
  check: 22,
  pressScale: 0.9,
} as const;

export const phoneFrame = {
  width: 236,
  height: 470,
  radius: 40,
  bezel: 7,
  bezelColor: "#FFFFFF",
  screen: "#FFFFFF",
  statusHeight: 30,
  statusInk: "#111111",
  shadow: "0px 24px 60px rgba(0, 0, 0, 0.28)",
} as const;

export const welcomeIntro = {
  saturation: 0.86,
  neutralSaturation: 0.08,
  baseLightness: 0.3,
  blobs: [
    { hueShift: 0, lightness: 0.5, from: { x: -130, y: -250 }, to: { x: -50, y: -190 }, side: 440, fade: 1, driftS: 7 },
    { hueShift: 0.12, lightness: 0.56, from: { x: 170, y: 60 }, to: { x: 90, y: 150 }, side: 420, fade: 0.95, driftS: 8.5 },
    { hueShift: -0.05, lightness: 0.64, from: { x: -110, y: 300 }, to: { x: -170, y: 220 }, side: 380, fade: 0.8, driftS: 9.5 },
    { hueShift: -0.08, lightness: 0.44, from: { x: 170, y: -330 }, to: { x: 110, y: -260 }, side: 360, fade: 0.9, driftS: 6.5 },
  ],
  blobBlur: 90,
  recolorS: 0.8,
  appearSettleMs: 60,
  titleMaxWidth: 340,
  bloomFrom: 0.35,
  bloomS: 1.1,
  bloomDelayS: 0.45,
  bloomStaggerS: 0.08,
  driftDelayMs: 1600,
  driftRepeats: 10000,
  iconSide: 76,
  iconTopShare: 0.12,
  launchScale: 2.7,
  holdMs: 380,
  flight: { response: 0.75, damping: 0.72 },
  wobbleDegrees: -10,
  titleSize: 38,
  titleBlur: 26,
  titleFromScale: 1.3,
  titleS: 0.95,
  titleDelayS: 0.6,
  blurRoom: 28,
  wordsBottom: space.xl - 28,
  actionDelayMs: 1250,
  actionRise: 14,
  actionsInset: space.xl + space.xs,
  actionsBottom: space.m,
  reducedFadeMs: 300,
} as const;

export const blockingScene = {
  loopMs: 6200,
  card: { width: 244, height: 312, radius: 24, pad: 14 },
  minScale: 0.7,
  maxScale: 1.15,
  gap: 9,
  banner: 52,
  inline: 58,
  cookie: 54,
  badge: 34,
  lines: [0.94, 0.82, 0.9],
  strikes: { banner: 0.2, inline: 0.36, cookies: 0.52 },
  cookieFill: { light: "#FFFFFF", dark: "#2C2C2E" },
} as const;

export const tipsReel = {
  sceneMs: 3400,
  reducedSceneMs: 3200,
  stage: { width: 176, height: 344, radius: 34, bezel: 6, screenRadius: 28, island: { width: 46, height: 13, top: 9 } },
  captionGap: space.l,
  captionHeight: 22,
  dotsGap: space.s,
  dot: { width: 22, height: 4, gap: 6, hitSlop: 14 },
  minScale: 0.62,
  maxScale: 1,
  bar: { height: 34, inset: 14, bottom: 12, glyph: 15, plus: 26 },
  finger: { side: 26, ring: 1.5, pressScale: 0.78 },
  page: { header: 0.27, titleWidth: 0.68, lines: [0.9, 0.78, 0.86, 0.62], line: 5, title: 8, gap: 7, pad: 12 },
  tray: { share: 0.6, radius: 20, field: 28, query: "ardia.dev", queryWidth: 47, caret: 12, keyRows: [10, 9, 7], keyHeight: 17, keyGap: 3, rowGap: 5 },
  deck: { widthShare: 0.62, heightShare: 0.58, topShare: 0.15, gap: 10, radius: 16, lift: 0.17 },
  back: { parallax: -0.33, shade: 0.32, edge: 8, dragShare: 0.55 },
  phoneBody: { light: "#1C1C1E", dark: "#2C2C2E" },
  fingerFill: "rgba(255,255,255,0.55)",
  fingerRing: "rgba(255,255,255,0.95)",
  fingerShadow: "0px 2px 10px rgba(0, 0, 0, 0.35)",
  pageShadow: "-6px 0px 16px rgba(0, 0, 0, 0.22)",
  looks: ["plum", "blue", "green", "orange"] as const,
} as const;

export const onboardingCurves = {
  step: [0.05, 0.7, 0.1, 1] as Curve,
  rise: departBezier as Curve,
  easeOut: easeOutBezier as Curve,
} as const;

const timing = (duration: number, curve: Curve): Motion => ({ timing: { duration, easing: Easing.bezier(...curve) } });

export const onboardingMotion = {
  stepTravel: 72,
  riseDelayMs: 50,
  step: motionAliases.onboardingStep,
  stepReduced: motionAliases.onboardingStepReduced,
  rise: timing(360, onboardingCurves.rise),
  riseReduced: timing(300, onboardingCurves.easeOut),
  connectRise: tabsMotion.sheetRise,
  welcomeTilt: { fromDegrees: -18, travelDegrees: 12, reducedDegrees: -6, fromScale: 0.7, wordsRise: 16 },
} as const;
