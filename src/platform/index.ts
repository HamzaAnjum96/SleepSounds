import type { PlatformBridge } from './PlatformBridge';
import { webBridge } from './webBridge';
import { features } from '../config/features';

// The active bridge. Web today; when the native Android bridge lands it slots
// in here behind the feature flag, and nothing else in the app changes.
export const platform: PlatformBridge = features.nativeAndroidBridge
  ? webBridge // placeholder until a native bridge exists
  : webBridge;

export type { PlatformBridge, MediaMeta } from './PlatformBridge';
