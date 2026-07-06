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

// ── ocean (shore scenes) ─────────────────────────────────────────────────────
function Lap() {
  // two small ripple lines, barely moving
  return (
    <Svg>
      <path d="M2.5 7.5 q1.8 -1.4 3.6 0 t3.6 0 t3.6 0" />
      <path d="M3.5 11 q1.7 -1.2 3.4 0 t3.4 0" opacity={0.55} />
    </Svg>
  );
}
function FarSurf() {
  // a flat horizon with small surf far below it
  return (
    <Svg>
      <path d="M2 5.5 H14" />
      <path d="M3.5 10.5 q1.6 -1.3 3.2 0 t3.2 0 t3.2 0" opacity={0.7} />
    </Svg>
  );
}
function Roller() {
  // one cresting curl over the waterline
  return (
    <Svg>
      <path d="M2.5 12 C 2.5 6.6, 8.4 5.4, 10.8 7.6 C 12.2 8.9, 11.4 11, 9.4 10.6" />
      <path d="M2.5 12.6 H13.5" opacity={0.6} />
    </Svg>
  );
}
function StormSurf() {
  // a heavy curl throwing spray
  return (
    <Svg>
      <path d="M2 12.4 C 2 6, 9 4.4, 11.8 7 C 13.4 8.5, 12.4 11.2, 10 10.6" />
      <circle cx="12.9" cy="4.4" r="0.8" {...fill} />
      <circle cx="10.9" cy="3.2" r="0.6" {...fill} opacity={0.8} />
    </Svg>
  );
}

// ── wind (places) ────────────────────────────────────────────────────────────
function NightBreeze() {
  // one soft streamline under a star
  return (
    <Svg>
      <path d="M2.5 9.5 q4.5 -2 8 0 q1.8 1 0.4 1.9" />
      <circle cx="12.4" cy="4.2" r="0.9" {...fill} opacity={0.85} />
    </Svg>
  );
}
function Hillside() {
  // wind over an open hill
  return (
    <Svg>
      <path d="M2 13 Q8 7.4 14 13" />
      <path d="M3.5 6.5 q3 -1.4 6 0" opacity={0.85} />
      <path d="M5.5 4 q2.4 -1.1 4.8 0" opacity={0.55} />
    </Svg>
  );
}
function Eaves() {
  // a roof corner with the wind curling under it
  return (
    <Svg>
      <path d="M3 8.5 L8 3.8 L13 8.5" />
      <path d="M4.5 12 q3.2 -1.8 6.4 0 q1.4 0.9 0.2 1.6" />
    </Svg>
  );
}
function Gale() {
  // hard, stacked streamlines
  return (
    <Svg>
      <path d="M2 5 q4.4 -1.6 8.6 0 q1.8 0.8 0.5 1.6" />
      <path d="M2 9 q5 -1.8 9.8 0" />
      <path d="M2 12.4 q3.6 -1.4 7 0" opacity={0.7} />
    </Svg>
  );
}

// ── fan (appliances) ─────────────────────────────────────────────────────────
function Purifier() {
  // a slim tower with vent slots
  return (
    <Svg>
      <rect x="5.4" y="2.8" width="5.2" height="10.4" rx="2.2" />
      <path d="M7.2 6 H8.8 M7.2 8 H8.8 M7.2 10 H8.8" opacity={0.8} />
    </Svg>
  );
}
function RoundFan() {
  // the bedside fan head
  return (
    <Svg>
      <circle cx="8" cy="8" r="5.2" />
      <circle cx="8" cy="8" r="0.9" {...fill} />
      <path d="M8 6.9 Q9.6 4.8 8.4 3.6 M9 8.6 Q11.4 9.4 12 7.8 M6.9 8.4 Q5.2 10.2 6.2 11.8" opacity={0.85} />
    </Svg>
  );
}
function BoxFan() {
  // a square case around the blades
  return (
    <Svg>
      <rect x="2.8" y="2.8" width="10.4" height="10.4" rx="1.6" />
      <circle cx="8" cy="8" r="3.4" opacity={0.85} />
      <circle cx="8" cy="8" r="0.8" {...fill} />
    </Svg>
  );
}
function ShopFan() {
  // a big head on a stand
  return (
    <Svg>
      <circle cx="8" cy="6.4" r="4.2" />
      <circle cx="8" cy="6.4" r="0.8" {...fill} />
      <path d="M8 10.6 V13.2 M5.6 13.2 H10.4" />
    </Svg>
  );
}

// ── windy forest (kinds of woods) ────────────────────────────────────────────
function Aspen() {
  // small leaves trembling
  return (
    <Svg>
      <path d={teardrop(5, 3.4, 0.55)} {...fill} />
      <path d={teardrop(10.6, 5, 0.55)} {...fill} opacity={0.85} />
      <path d={teardrop(7.4, 8.6, 0.55)} {...fill} opacity={0.7} />
      <path d="M3.5 12.8 q3.2 -1.3 6.4 0" opacity={0.6} />
    </Svg>
  );
}
function Canopy() {
  // a tree crown on its trunk
  return (
    <Svg>
      <path d="M4.5 10.6 Q2.4 10.4 2.8 8.2 Q2 5.6 4.8 5.2 Q5.4 2.6 8.2 3 Q11 2.8 11.4 5.4 Q14 6 13.2 8.4 Q13.6 10.4 11.4 10.6 Z" />
      <path d="M8 10.6 V13.6" />
    </Svg>
  );
}
function DeepWoods() {
  // two close pines
  return (
    <Svg>
      <path d="M2.6 12.6 L5.4 5 L8.2 12.6 Z" />
      <path d="M8 12.6 L10.6 6.8 L13.2 12.6 Z" opacity={0.75} />
    </Svg>
  );
}
function StormTrees() {
  // a pine leaning hard in the wind
  return (
    <Svg>
      <path d="M3.4 13 L7.8 5.4 L9.6 13 Z" />
      <path d="M8.5 4.5 q3 -1.4 5.4 -0.4" opacity={0.85} />
      <path d="M10 7.4 q2.4 -1 4 -0.3" opacity={0.6} />
    </Svg>
  );
}

// ── train (journeys) ─────────────────────────────────────────────────────────
function FarRails() {
  // rails receding to the horizon
  return (
    <Svg>
      <path d="M6.6 3.6 L3.6 13.2 M9.4 3.6 L12.4 13.2" />
      <path d="M5.9 7.4 H10.1 M5 10.4 H11" opacity={0.6} />
    </Svg>
  );
}
function SleeperCar() {
  // a carriage with lit windows
  return (
    <Svg>
      <rect x="2.6" y="5" width="10.8" height="6.2" rx="1.4" />
      <path d="M5.4 7.2 H6.8 M9.2 7.2 H10.6" opacity={0.85} />
      <circle cx="5.4" cy="12.6" r="0.9" {...fill} />
      <circle cx="10.6" cy="12.6" r="0.9" {...fill} />
    </Svg>
  );
}
function JointedRail() {
  // a rail with a joint gap — the clack
  return (
    <Svg>
      <path d="M2 9.4 H6.9 M9.1 9.4 H14" />
      <path d="M6.9 7.6 V11.2 M9.1 7.6 V11.2" opacity={0.8} />
      <circle cx="8" cy="4.6" r="0.8" {...fill} opacity={0.85} />
    </Svg>
  );
}
function Express() {
  // a streamlined nose with speed lines
  return (
    <Svg>
      <path d="M5 6 H10.2 Q13.6 6 13.6 8.5 Q13.6 11 10.2 11 H5 Z" />
      <path d="M2 7.2 H4 M2 9.8 H4" opacity={0.7} />
    </Svg>
  );
}

// ── airplane (seats & moments) ───────────────────────────────────────────────
function NightFlight() {
  // a crescent with a distant plane
  return (
    <Svg>
      <path d="M10.2 3.2 A4.6 4.6 0 1 0 13.8 9.4 A4 4 0 0 1 10.2 3.2" />
      <path d="M2.6 11.6 L6.4 10.4 M4.6 9.6 L4.9 12.4" opacity={0.85} />
    </Svg>
  );
}
function Cruise() {
  // level flight over a still horizon
  return (
    <Svg>
      <path d="M3 7 L13 7 M8.2 7 L6 3.6 M8.2 7 L6.6 10 M12 7 L13.4 4.9" opacity={0.95} />
      <path d="M3.5 12.6 H12.5" opacity={0.5} />
    </Svg>
  );
}
function Wing() {
  // the view over a swept wing
  return (
    <Svg>
      <path d="M2.4 11.6 L12.8 4.4 L13.6 6.6 L5.4 12.8 Z" />
      <path d="M9.4 9.2 L12 10.8" opacity={0.7} />
    </Svg>
  );
}
function Chop() {
  // the same flight line, gone bumpy
  return (
    <Svg>
      <path d="M3 6.4 L13 6.4 M8.2 6.4 L6 3.2 M8.2 6.4 L6.6 9.2" opacity={0.95} />
      <path d="M2.6 12 q1.6 -1.6 3.2 0 t3.2 0 t3.2 0" opacity={0.75} />
    </Svg>
  );
}

// ── heartbeat (closeness) ────────────────────────────────────────────────────
const HEART =
  'M8 12.4 C 4.4 9.7, 3 6.9, 4.9 5.3 C 6.2 4.2, 7.6 4.9, 8 6 C 8.4 4.9, 9.8 4.2, 11.1 5.3 C 13 6.9, 11.6 9.7, 8 12.4 Z';
function HeartDrift() {
  // a heart drifting off
  return (
    <Svg>
      <path d={HEART} transform="translate(-1.2 1.4) scale(0.82)" />
      <path d="M10.6 3.2 h2.4 l-2.4 2.4 h2.4" opacity={0.8} />
    </Svg>
  );
}
function HeartRest() {
  return (
    <Svg>
      <path d={HEART} />
    </Svg>
  );
}
function HeartClose() {
  // pressed close — the heart, filled
  return (
    <Svg>
      <path d={HEART} {...fill} />
    </Svg>
  );
}
function Womb() {
  // a heart held inside
  return (
    <Svg>
      <circle cx="8" cy="8" r="6" />
      <path d={HEART} transform="translate(2.4 2.6) scale(0.7)" {...fill} opacity={0.9} />
    </Svg>
  );
}

// ── ticking clock (cases) ────────────────────────────────────────────────────
function Pendulum() {
  // the naked mechanism
  return (
    <Svg>
      <path d="M8 2.8 V9" />
      <circle cx="8" cy="10.8" r="1.9" {...fill} />
      <path d="M4.4 5.4 Q5 7.4 6.4 8.6 M11.6 5.4 Q11 7.4 9.6 8.6" opacity={0.45} />
    </Svg>
  );
}
function Escapement() {
  // the naked mechanism — an escape wheel
  return (
    <Svg>
      <circle cx="8" cy="8.6" r="3.4" />
      <circle cx="8" cy="8.6" r="0.8" {...fill} />
      <path d="M8 5.2 V3.4 M11.4 8.6 H13.2 M8 12 V13.8 M4.6 8.6 H2.8" opacity={0.85} />
    </Svg>
  );
}
function Metronome() {
  // one even beat
  return (
    <Svg>
      <path d="M5.6 13 L7.1 3.4 H8.9 L10.4 13 Z" />
      <path d="M8 11 L10.8 5.6" opacity={0.9} />
      <circle cx="10.8" cy="5.6" r="0.9" {...fill} />
    </Svg>
  );
}
function PocketWatch() {
  // a quick delicate tick on a chain
  return (
    <Svg>
      <circle cx="8" cy="9.2" r="3.9" />
      <path d="M8 5.3 V3.9 M6.8 3.9 H9.2" />
      <path d="M8 9.2 V7.2 M8 9.2 L9.5 10" opacity={0.9} />
    </Svg>
  );
}

// ── wind chimes (sets) ───────────────────────────────────────────────────────
function chimeBar() {
  return <path d="M4 3.4 H12" />;
}
function ChimesStill() {
  // tubes hanging dead straight under a star
  return (
    <Svg>
      {chimeBar()}
      <path d="M5.4 3.4 V9 M8 3.4 V10.6 M10.6 3.4 V8.2" />
      <circle cx="13.2" cy="5.6" r="0.75" {...fill} opacity={0.8} />
    </Svg>
  );
}
function ChimesDeep() {
  // long tubes, tolling low
  return (
    <Svg>
      {chimeBar()}
      <path d="M5.2 3.4 V13.2 M8 3.4 V12 M10.8 3.4 V13.6" strokeWidth={1.9} />
    </Svg>
  );
}
function ChimesBreeze() {
  // tubes leaning together on a breath of air
  return (
    <Svg>
      {chimeBar()}
      <path d="M5.4 3.4 L6.4 9.4 M8 3.4 L9 10.8 M10.6 3.4 L11.4 8.6" />
      <path d="M2.2 11.8 q2.6 -1.2 5.2 0" opacity={0.6} />
    </Svg>
  );
}
function ChimesDance() {
  // tubes thrown wide, ringing
  return (
    <Svg>
      {chimeBar()}
      <path d="M5.4 3.4 L3.6 9.6 M8 3.4 L9.8 10.4 M10.6 3.4 L13 8.4" />
      <path d="M3.2 12.4 q1.2 -0.9 2.4 0 M9.8 12.6 q1.2 -0.9 2.4 0" opacity={0.6} />
    </Svg>
  );
}

// ── cat purr (moods) ─────────────────────────────────────────────────────────
function catFace(children: ReactNode) {
  return (
    <Svg>
      <path d="M4.4 6.2 L4.6 3.4 L6.8 5.2 M11.6 6.2 L11.4 3.4 L9.2 5.2" />
      <circle cx="8" cy="8.6" r="4.3" />
      {children}
    </Svg>
  );
}
function CatDozing() {
  // eyes closed
  return catFace(
    <>
      <path d="M5.7 8.4 q0.9 0.9 1.8 0 M8.5 8.4 q0.9 0.9 1.8 0" opacity={0.9} />
    </>,
  );
}
function CatContent() {
  // eyes half open, settled
  return catFace(
    <>
      <circle cx="6.5" cy="8.3" r="0.65" {...fill} />
      <circle cx="9.5" cy="8.3" r="0.65" {...fill} />
      <path d="M7.3 10.4 q0.7 0.7 1.4 0" opacity={0.9} />
    </>,
  );
}
function CatDeep() {
  // the rumble radiating
  return catFace(
    <>
      <path d="M5.7 8.4 q0.9 0.9 1.8 0 M8.5 8.4 q0.9 0.9 1.8 0" opacity={0.9} />
      <path d="M1.6 10.6 q0.8 -1 0 -2 M14.4 10.6 q-0.8 -1 0 -2" opacity={0.6} />
    </>,
  );
}

// ── birdsong (distance / scene) ──────────────────────────────────────────────
function BirdFar() {
  // two far gull-curves near the horizon, one fainter — song from a distance
  return (
    <Svg>
      <path d="M2 11.5 H14" opacity={0.5} />
      <path d="M5 6.2 q1.1 -1.1 2.2 0 M7.2 6.2 q1.1 -1.1 2.2 0" />
      <path d="M9.8 4 q0.8 -0.8 1.6 0 M11.4 4 q0.8 -0.8 1.6 0" opacity={0.55} />
    </Svg>
  );
}
function BirdGarden() {
  // a bird perched on a branch, one note in the air
  return (
    <Svg>
      <path d="M2 11.6 H14" />
      <circle cx="6.4" cy="8.6" r="1.7" />
      <path d="M7.8 9.4 L10 10.6" />
      <path d="M4.9 8.2 L3.7 7.4" opacity={0.85} />
      <circle cx="11.6" cy="4.4" r="0.9" {...fill} opacity={0.8} />
      <path d="M12.5 4.4 V1.9" opacity={0.8} />
    </Svg>
  );
}
function BirdDawn() {
  // the sun coming up over the horizon, song rising with it
  return (
    <Svg>
      <path d="M2 11.5 H14" />
      <path d="M4.8 11.5 a3.2 3.2 0 0 1 6.4 0" />
      <path d="M8 5.6 V3.8 M4 7 L2.9 5.9 M12 7 L13.1 5.9" opacity={0.75} />
      <path d="M11.6 2.6 q0.8 -0.8 1.6 0" opacity={0.85} />
    </Svg>
  );
}

// ── stream (flow) ────────────────────────────────────────────────────────────
function Trickle() {
  // a thin rivulet finding its way down, one drop
  return (
    <Svg>
      <path d="M8.8 2.5 q-2.2 2 -0.6 4 q1.6 2 -0.6 4" />
      <path d={teardrop(7.1, 12.1, 0.5)} {...fill} opacity={0.9} />
    </Svg>
  );
}
function Brook() {
  // water babbling over two stones
  return (
    <Svg>
      <path d="M4.2 11.8 a1.9 1.9 0 0 1 3.8 0 M9.4 11.8 a1.6 1.6 0 0 1 3.2 0" />
      <path d="M2.5 6.5 q1.8 -1.4 3.6 0 t3.6 0 t3.6 0" />
      <path d="M5.2 9.1 q1.4 -1 2.8 0" opacity={0.55} />
    </Svg>
  );
}
function Creek() {
  // fast water: three swift streamlines with a kicked-up crest
  return (
    <Svg>
      <path d="M2 5.4 q3.4 -1.6 6.8 0 q2 0.9 4.4 0.2" />
      <path d="M2.4 8.6 q3.2 -1.4 6.4 0 q2 0.9 4.4 0.2" opacity={0.8} />
      <path d="M3 11.8 q3 -1.3 6 0 q1.9 0.8 4.1 0.2" opacity={0.55} />
    </Svg>
  );
}

// ── thunder (distance / build) ───────────────────────────────────────────────
function cloud(dy = 0, opacity = 1) {
  return <path d={`M3.4 ${8.2 + dy} a2.6 2.6 0 0 1 2.5 -3.3 a3 3 0 0 1 5.6 0.9 a2.1 2.1 0 0 1 -0.4 4.2 H5.6 a2.3 2.3 0 0 1 -2.2 -1.8`} opacity={opacity} />;
}
function ThunderFar() {
  // the storm still beyond the horizon: a low flat line, a faint flicker under it
  return (
    <Svg>
      <path d="M2 6.5 H14" />
      <path d="M8.6 9 L7.4 11.2 h1.6 L7.8 13.4" opacity={0.55} />
    </Svg>
  );
}
function ThunderRoll() {
  // one cloud with rumble arcs rolling out beneath
  return (
    <Svg>
      {cloud(-1.2)}
      <path d="M4.6 12 q1.5 -1 3 0 M9 12.6 q1.4 -0.9 2.8 0" opacity={0.6} />
    </Svg>
  );
}
function ThunderGather() {
  // a second cell stacking up behind the first
  return (
    <Svg>
      <path d="M6 4.4 a2.4 2.4 0 0 1 4.4 -0.6 a1.8 1.8 0 0 1 1.6 2.6" opacity={0.5} />
      {cloud(0.6)}
    </Svg>
  );
}
function ThunderHeavy() {
  // the bolt lands: filled strike out of the cloud with rain beside it
  return (
    <Svg>
      {cloud(-1.6)}
      <path d="M8.7 8.6 L6.9 11.4 h1.9 L7.4 14.2 L10.6 10.9 H8.8 L10 8.6 Z" {...fill} />
      <line x1={4.6} y1={9.4} x2={3.9} y2={11.4} opacity={0.6} />
      <line x1={12} y1={9.4} x2={11.3} y2={11.4} opacity={0.6} />
    </Svg>
  );
}

// ── night insects (depth of night) ───────────────────────────────────────────
function grassBlades(opacity = 1) {
  return <path d="M3.4 13.5 q-0.3 -2.6 1 -4.4 M6 13.5 q0.1 -2.2 -0.9 -3.6 M12 13.5 q0.3 -2.4 -0.9 -4" opacity={opacity} />;
}
function NightStill() {
  // grass at dusk, a single chirp
  return (
    <Svg>
      {grassBlades()}
      <circle cx="9" cy="7" r="0.8" {...fill} opacity={0.6} />
    </Svg>
  );
}
function NightSummer() {
  // the moon up over the meadow, the field singing
  return (
    <Svg>
      {grassBlades()}
      <path d="M9.8 2.6 a3 3 0 1 0 3.4 3.4 a2.5 2.5 0 0 1 -3.4 -3.4" />
    </Svg>
  );
}
function NightDeep() {
  // deep night: the meadow fades, moon and stars carry it
  return (
    <Svg>
      {grassBlades(0.45)}
      <path d="M8.6 2.4 a2.7 2.7 0 1 0 3.1 3.1 a2.3 2.3 0 0 1 -3.1 -3.1" />
      <circle cx="3.6" cy="4" r="0.7" {...fill} opacity={0.8} />
      <circle cx="13.4" cy="8.2" r="0.55" {...fill} opacity={0.6} />
    </Svg>
  );
}

// ── underwater (depth / motion) ──────────────────────────────────────────────
function DepthStill() {
  // still water: a surface line, two slow bubbles hanging deep
  return (
    <Svg>
      <path d="M2 3.5 q1.8 -1.2 3.6 0 t3.6 0 t3.6 0" opacity={0.6} />
      <circle cx="7" cy="9.4" r="1.15" />
      <circle cx="9.8" cy="12" r="0.75" opacity={0.7} />
    </Svg>
  );
}
function Current() {
  // a gentle current carrying a bubble along
  return (
    <Svg>
      <path d="M2 6.4 q3.2 -1.5 6.4 0 q2 0.9 5.6 0.1" />
      <path d="M2.6 10 q3 -1.3 6 0 q1.9 0.8 4.8 0.1" opacity={0.6} />
      <circle cx="11.6" cy="3.6" r="1" />
    </Svg>
  );
}
function DeepSea() {
  // bubbles shrinking away toward the surface, the floor far below
  return (
    <Svg>
      <circle cx="6.6" cy="10.2" r="1.35" />
      <circle cx="8.6" cy="6.6" r="0.95" opacity={0.75} />
      <circle cx="10" cy="3.6" r="0.6" opacity={0.5} />
      <path d="M2.5 13.5 H13.5" opacity={0.55} />
    </Svg>
  );
}

// ── shower (pressure) ────────────────────────────────────────────────────────
function showerHead() {
  return <path d="M5 3.2 a3 3 0 0 1 6 0 v1 H5 Z" />;
}
function ShowerGentle() {
  // a soft sprinkle: short, sparse streams
  return (
    <Svg>
      {showerHead()}
      <line x1={6} y1={6.6} x2={5.7} y2={8.4} opacity={0.8} />
      <line x1={8} y1={7.6} x2={7.9} y2={9.6} opacity={0.55} />
      <line x1={10} y1={6.6} x2={9.9} y2={8.4} opacity={0.8} />
    </Svg>
  );
}
function ShowerSteady() {
  // an even fall
  return (
    <Svg>
      {showerHead()}
      <line x1={5.8} y1={6.6} x2={5.5} y2={10.6} />
      <line x1={8} y1={6.6} x2={7.9} y2={10.6} />
      <line x1={10.2} y1={6.6} x2={10.1} y2={10.6} />
    </Svg>
  );
}
function ShowerPower() {
  // full pressure: dense, long jets
  return (
    <Svg>
      {showerHead()}
      <line x1={5.4} y1={6.6} x2={4.9} y2={12.6} />
      <line x1={7.1} y1={6.6} x2={6.9} y2={13.2} />
      <line x1={8.9} y1={6.6} x2={9.1} y2={13.2} />
      <line x1={10.6} y1={6.6} x2={11.1} y2={12.6} />
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
  // ocean
  lap: () => <Lap />,
  farsurf: () => <FarSurf />,
  roller: () => <Roller />,
  stormsurf: () => <StormSurf />,
  // wind
  nightbreeze: () => <NightBreeze />,
  hillside: () => <Hillside />,
  eaves: () => <Eaves />,
  gale: () => <Gale />,
  // fan
  purifier: () => <Purifier />,
  roundfan: () => <RoundFan />,
  boxfan: () => <BoxFan />,
  shopfan: () => <ShopFan />,
  // windy forest
  aspen: () => <Aspen />,
  canopy: () => <Canopy />,
  deepwoods: () => <DeepWoods />,
  stormtrees: () => <StormTrees />,
  // train
  farrails: () => <FarRails />,
  sleepercar: () => <SleeperCar />,
  jointedrail: () => <JointedRail />,
  express: () => <Express />,
  // airplane
  nightflight: () => <NightFlight />,
  cruise: () => <Cruise />,
  wing: () => <Wing />,
  chop: () => <Chop />,
  // heartbeat
  heartdrift: () => <HeartDrift />,
  heartrest: () => <HeartRest />,
  heartclose: () => <HeartClose />,
  womb: () => <Womb />,
  // ticking clock
  pendulum: () => <Pendulum />,
  escapement: () => <Escapement />,
  metronome: () => <Metronome />,
  pocketwatch: () => <PocketWatch />,
  // wind chimes
  chimestill: () => <ChimesStill />,
  chimedeep: () => <ChimesDeep />,
  chimebreeze: () => <ChimesBreeze />,
  chimedance: () => <ChimesDance />,
  // cat purr
  catdozing: () => <CatDozing />,
  catcontent: () => <CatContent />,
  catdeep: () => <CatDeep />,
  // birdsong
  birdfar: () => <BirdFar />,
  birdgarden: () => <BirdGarden />,
  birddawn: () => <BirdDawn />,
  // stream
  trickle: () => <Trickle />,
  brook: () => <Brook />,
  creek: () => <Creek />,
  // thunder
  thunderfar: () => <ThunderFar />,
  thunderroll: () => <ThunderRoll />,
  thundergather: () => <ThunderGather />,
  thunderheavy: () => <ThunderHeavy />,
  // night insects
  nightstill: () => <NightStill />,
  nightsummer: () => <NightSummer />,
  nightdeep: () => <NightDeep />,
  // underwater
  depthstill: () => <DepthStill />,
  current: () => <Current />,
  deepsea: () => <DeepSea />,
  // shower
  showergentle: () => <ShowerGentle />,
  showersteady: () => <ShowerSteady />,
  showerpower: () => <ShowerPower />,
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
