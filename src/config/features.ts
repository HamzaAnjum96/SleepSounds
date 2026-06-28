// Local feature flags — ship incomplete work safely and keep the web build
// stable while larger pieces (native bridge, supporter screen) are in progress.
export const features = {
  supporterScreen: false,
  experimentalSounds: false,
  nativeAndroidBridge: false,
  // Per-layer mute (M) / solo (S) toggles in the now-playing controls. Hidden
  // for now; the mixer logic stays wired up, so flip this on to bring them back.
  layerMuteSolo: false,
} as const;
