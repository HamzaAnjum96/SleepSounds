// Crafted marks for the sound-editor variant chips. These are presentation
// only: the variant *name* stays the source of truth (soundEditorDefs.ts) and
// the accessible label. A mark just gives a half-asleep, one-handed reader the
// gist at a glance — intensity as 1/2/3 ascending bars, rain as drop-count and
// surface scenes (roof / window / tin), fire as per-character flames.
//
// Every mark is a 16px line/figure drawn in `currentColor`, so it inherits the
// chip's colour: muted when idle, the category accent when the chip is active.
// Filled shapes (drops, flames) use currentColor too; idle bars dim via opacity.

import type { ReactNode } from 'react';

function Svg({ children }: { children: ReactNode }) {
  return (
    <svg
      className="sb-variant-mark"
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

/** Teardrop with the tip at the top — used for both raindrops and flames. */
function teardrop(cx: number, cy: number, s = 1): string {
  return (
    `M${cx} ${cy} ` +
    `C ${cx + 2.2 * s} ${cy + 3.4 * s} ${cx + 2.2 * s} ${cy + 5.6 * s} ${cx} ${cy + 6.3 * s} ` +
    `C ${cx - 2.2 * s} ${cy + 5.6 * s} ${cx - 2.2 * s} ${cy + 3.4 * s} ${cx} ${cy} Z`
  );
}

const fill = { fill: 'currentColor', stroke: 'none' } as const;

// ── position: `count` ascending bars, the first `level` of them filled ──────
// The bars read as "where this character sits on the set's calm → lively
// ordering", so every chip in a set gets a distinct mark (a 4-chip set draws
// 4 bars, not 3 with the last two identical).
function Bars({ level, count = 3 }: { level: number; count?: number }) {
  const n = Math.max(2, Math.min(count, 5));
  const w = 2.2;
  const gap = (16 - 1.6 - n * w) / (n - 1); // spread across the 16px box
  const bars = Array.from({ length: n }, (_, i) => ({
    x: 0.8 + i * (w + gap),
    h: 4 + ((10 - 4) * i) / (n - 1),
  }));
  return (
    <Svg>
      {bars.map((b, i) => (
        <rect
          key={b.x}
          x={b.x}
          y={13.5 - b.h}
          width={w}
          height={b.h}
          rx={1.1}
          fill="currentColor"
          stroke="none"
          opacity={i < level ? 1 : 0.24}
        />
      ))}
    </Svg>
  );
}

// ── rain ─────────────────────────────────────────────────────────────────────
function Drizzle() {
  // fine, misty diagonal streaks rather than discrete drops
  const streaks = [
    [4.5, 2.6], [8, 2.6], [11.5, 2.6],
    [6.2, 8.4], [9.7, 8.4],
  ];
  return (
    <Svg>
      {streaks.map(([x, y]) => (
        <line key={`${x}-${y}`} x1={x} y1={y} x2={x - 1.6} y2={y + 4.4} opacity={0.92} />
      ))}
    </Svg>
  );
}

function Drops({ count }: { count: number }) {
  const sets: Record<number, Array<[number, number, number]>> = {
    1: [[8, 4, 1.05]],
    2: [[5.3, 4.4, 0.82], [10.7, 4.4, 0.82]],
    3: [[4.2, 5, 0.66], [8, 3.6, 0.66], [11.8, 5, 0.66]],
  };
  return (
    <Svg>
      {sets[count].map(([cx, cy, s]) => (
        <path key={`${cx}-${cy}`} d={teardrop(cx, cy, s)} {...fill} />
      ))}
    </Svg>
  );
}

function Roof() {
  // a peaked (wooden) roofline with rain falling onto it
  return (
    <Svg>
      <path d="M2.4 12.4 L8 7.4 L13.6 12.4" />
      <path d={teardrop(5.6, 2.4, 0.52)} {...fill} />
      <path d={teardrop(10.4, 2.4, 0.52)} {...fill} />
    </Svg>
  );
}

function Window() {
  // a glazed sash with rain streaking down the pane
  return (
    <Svg>
      <rect x="3" y="3.4" width="10" height="10" rx="1.6" />
      <path d="M8 3.4 V13.4" opacity={0.75} />
      <path d="M5.4 6 L6.7 7.7" opacity={0.9} />
      <path d="M9.5 8.6 L10.8 10.3" opacity={0.9} />
    </Svg>
  );
}

function Tin() {
  // a corrugated metal sheet (the wave says "tin") under falling rain
  return (
    <Svg>
      <path d="M2 11.4 q1.5 -2.2 3 0 t3 0 t3 0 t3 0" />
      <path d="M2 13.2 H14" opacity={0.55} />
      <path d={teardrop(5.6, 2.6, 0.5)} {...fill} />
      <path d={teardrop(10.4, 2.6, 0.5)} {...fill} />
    </Svg>
  );
}

// ── fire (per-character) ─────────────────────────────────────────────────────
function Embers() {
  // a low, dying flame over glowing coals
  return (
    <Svg>
      <path d={teardrop(8, 7.4, 0.7)} {...fill} />
      <circle cx="4.6" cy="12.4" r="0.9" {...fill} opacity={0.7} />
      <circle cx="11.4" cy="12.4" r="0.9" {...fill} opacity={0.7} />
    </Svg>
  );
}

function Hearth() {
  // a flame inside a fireplace arch
  return (
    <Svg>
      <path d="M3 13.2 V9 A5 5 0 0 1 13 9 V13.2" />
      <path d={teardrop(8, 6.4, 0.78)} {...fill} />
    </Svg>
  );
}

function Campfire() {
  // a flame over two crossed logs
  return (
    <Svg>
      <path d={teardrop(8, 3.4, 1.05)} {...fill} />
      <path d="M3.6 13 L8.4 11.2" opacity={0.8} />
      <path d="M12.4 13 L7.6 11.2" opacity={0.8} />
    </Svg>
  );
}

function Bonfire() {
  // a tall flame with a second tongue of fire
  return (
    <Svg>
      <path d={teardrop(7.4, 2.6, 1.25)} {...fill} />
      <path d={teardrop(11.4, 6.2, 0.62)} {...fill} opacity={0.85} />
    </Svg>
  );
}

function Stove() {
  // a contained wood stove with a glowing door
  return (
    <Svg>
      <rect x="3.4" y="3.6" width="9.2" height="9" rx="1.6" />
      <path d="M3.4 13.4 L2.4 14.6 M12.6 13.4 L13.6 14.6" opacity={0.7} />
      <path d={teardrop(8, 6.6, 0.5)} {...fill} />
    </Svg>
  );
}

function Crackling() {
  // a flame throwing sparks
  return (
    <Svg>
      <path d={teardrop(8, 4, 0.95)} {...fill} />
      <circle cx="3.4" cy="4.2" r="0.85" {...fill} />
      <circle cx="12.7" cy="5.2" r="0.85" {...fill} />
      <circle cx="12.2" cy="2.6" r="0.6" {...fill} opacity={0.75} />
    </Svg>
  );
}

const MARKS: Record<string, () => ReactNode> = {
  lvl1: () => <Bars level={1} />,
  lvl2: () => <Bars level={2} />,
  lvl3: () => <Bars level={3} />,
  mist: () => <Drizzle />,
  drop1: () => <Drops count={1} />,
  drop2: () => <Drops count={2} />,
  drop3: () => <Drops count={3} />,
  roof: () => <Roof />,
  window: () => <Window />,
  tin: () => <Tin />,
  ember: () => <Embers />,
  hearth: () => <Hearth />,
  flame: () => <Campfire />,
  blaze: () => <Bonfire />,
  stove: () => <Stove />,
  crackle: () => <Crackling />,
};

/** The mark token for a variant: its explicit `icon` if set, else a position
 *  bar (the simple sounds list their variants calm → lively). `count` sizes
 *  the bar set so a 4-variant sound gets four distinct marks. */
export function variantToken(icon: string | undefined, index: number, count = 3): string {
  if (icon) return icon;
  return `lvl${Math.min(index + 1, count)}of${Math.max(2, Math.min(count, 5))}`;
}

export function VariantMark({ token }: { token: string }): ReactNode {
  const pos = /^lvl(\d)of(\d)$/.exec(token);
  if (pos) return <Bars level={Number(pos[1])} count={Number(pos[2])} />;
  return (MARKS[token] ?? MARKS.lvl2)();
}
