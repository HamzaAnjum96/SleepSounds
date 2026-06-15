// Local feature flags — ship incomplete work safely and keep the web build
// stable while larger pieces (native bridge, supporter screen) are in progress.
export const features = {
  customMixEditor: true,
  supporterScreen: false,
  experimentalSounds: false,
  nativeAndroidBridge: false,
} as const;
