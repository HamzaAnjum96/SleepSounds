// Local, privacy-safe logging. No analytics, no network — debug/info are
// dev-only; warn/error always surface so real problems aren't swallowed.
type LogArgs = unknown[];

export const logger = {
  debug: (...args: LogArgs) => { if (import.meta.env.DEV) console.debug(...args); },
  info: (...args: LogArgs) => { if (import.meta.env.DEV) console.info(...args); },
  warn: (...args: LogArgs) => { console.warn(...args); },
  error: (...args: LogArgs) => { console.error(...args); },
};
