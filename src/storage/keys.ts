// All localStorage keys in one place. The saved-mixes key keeps its historical
// name so existing user data keeps loading after this refactor.
export const STORAGE_KEYS = {
  savedMixes: 'sleep-mixer-presets-v2',
  lastSession: 'drift-last-session',
} as const;
