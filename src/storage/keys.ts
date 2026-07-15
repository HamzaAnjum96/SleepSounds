// The persisted user-data keys (mixes + last session) live here together,
// since they're loaded through the storage/migrations layer. One-off UI flags
// (onboarding, install-prompt dismissal, storage-notice ack) stay co-located
// with the components that own them. The saved-mixes key keeps its historical
// name so existing user data keeps loading.
export const STORAGE_KEYS = {
  savedMixes: 'sleep-mixer-presets-v2',
  lastSession: 'drift-last-session',
  soundOrder: 'drift-sound-order',
} as const;
