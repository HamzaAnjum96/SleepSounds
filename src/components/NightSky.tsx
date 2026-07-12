import { memo, useEffect, useRef } from 'react';

/**
 * The drift night sky: a procedural canvas starfield that lives behind the app.
 *
 * - Seeded PRNG, so the constellation is identical on every visit: this is
 *   drift's own sky, not a random scatter.
 * - Stars twinkle on individual phases; overall brightness breathes up when
 *   the mix is playing and settles when idle.
 * - During the last five minutes of the sleep timer the sky gradually dims
 *   with the mix (the `dim` prop), reinforcing wind-down.
 * - A rare meteor crosses while playing. Never more than one at a time,
 *   never while idle.
 * - Renders at 30fps (twinkle is slow; battery matters at the bedside),
 *   pauses entirely on hidden tabs, and draws a single static frame under
 *   prefers-reduced-motion.
 */

interface NightSkyProps {
  playing: boolean;
  /** 0..1: how full the mix is (drives a slight brightness lift). */
  intensity: number;
  /** 0..1: sleep-timer wind-down dimming (0 = none, 1 = fully settled). */
  dim: number;
}

interface Star {
  x: number;        // 0..1 of width
  y: number;        // 0..1 of height
  r: number;        // radius in CSS px
  baseA: number;    // resting alpha
  twSpeed: number;  // twinkle speed, rad/s
  phase: number;
  tint: string;     // rgb triplet
}

interface Meteor {
  x: number; y: number;   // start, 0..1
  dx: number; dy: number; // direction, css px/ms
  born: number;           // timestamp
  life: number;           // ms
}

/** Deterministic PRNG so the sky is stable across sessions. */
function mulberry32(seed: number) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const STAR_COUNT = 140;
const SEED = 0xd21f7;

function makeStars(): Star[] {
  const rand = mulberry32(SEED);
  const stars: Star[] = [];
  for (let i = 0; i < STAR_COUNT; i++) {
    const roll = rand();
    stars.push({
      x: rand(),
      y: rand(),
      r: 0.4 + rand() * (roll > 0.92 ? 1.1 : 0.7),
      baseA: 0.18 + rand() * 0.5,
      twSpeed: 0.25 + rand() * 0.55,
      phase: rand() * Math.PI * 2,
      // Mostly white; a few warm and cool stars for depth.
      tint: roll < 0.12 ? '255,238,214' : roll > 0.88 ? '205,220,255' : '255,255,255',
    });
  }
  return stars;
}

const STARS = makeStars();
const FRAME_MS = 1000 / 30;

function NightSky({ playing, intensity, dim }: NightSkyProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  // Live prop mirror so the rAF loop never restarts on prop changes.
  const stateRef = useRef({ playing, intensity, dim });
  stateRef.current = { playing, intensity, dim };
  // Set by the mount effect; lets the props effect refresh the static frame
  // when animation is off (reduced motion).
  const redrawStaticRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let raf = 0;
    let running = false;
    let brightness = 0.72;            // smoothed global brightness
    let lastFrame = 0;
    let meteor: Meteor | null = null;
    let nextMeteorAt = performance.now() + 16000;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(canvas.clientWidth * dpr);
      canvas.height = Math.round(canvas.clientHeight * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const draw = (t: number, animate: boolean) => {
      const { playing: isPlaying, intensity: mix, dim: winddown } = stateRef.current;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      ctx.clearRect(0, 0, w, h);

      const target = (isPlaying ? 0.92 + 0.14 * mix : 0.72) * (1 - 0.65 * winddown);
      brightness += (target - brightness) * (animate ? 0.025 : 1);

      for (const s of STARS) {
        const tw = animate ? 0.72 + 0.28 * Math.sin((t / 1000) * s.twSpeed + s.phase) : 0.85;
        const a = Math.min(1, s.baseA * tw * brightness);
        if (a <= 0.01) continue;
        ctx.beginPath();
        ctx.fillStyle = `rgba(${s.tint},${a.toFixed(3)})`;
        ctx.arc(s.x * w, s.y * h, s.r, 0, Math.PI * 2);
        ctx.fill();
        if (s.r > 1.0) {
          // Soft halo on the brightest stars.
          ctx.beginPath();
          ctx.fillStyle = `rgba(${s.tint},${(a * 0.16).toFixed(3)})`;
          ctx.arc(s.x * w, s.y * h, s.r * 3.2, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Meteors: rare, only while playing, never during heavy wind-down.
      if (animate && isPlaying && winddown < 0.5) {
        if (!meteor && t >= nextMeteorAt) {
          meteor = {
            x: 0.25 + Math.random() * 0.55,
            y: 0.04 + Math.random() * 0.2,
            dx: -(0.04 + Math.random() * 0.03),
            dy: 0.018 + Math.random() * 0.012,
            born: t,
            life: 1100,
          };
          nextMeteorAt = t + 24000 + Math.random() * 26000;
        }
      }
      if (meteor) {
        const age = (t - meteor.born) / meteor.life;
        if (age >= 1 || !animate) {
          meteor = null;
        } else {
          const fade = Math.sin(Math.PI * age); // in and out
          const px = (meteor.x + meteor.dx * age) * w;
          const py = (meteor.y + meteor.dy * age * (w / h)) * h;
          const tail = 38 * fade;
          const grad = ctx.createLinearGradient(px, py, px - meteor.dx * 900 * (tail / 38), py - meteor.dy * 900 * (tail / 38));
          grad.addColorStop(0, `rgba(225,235,255,${(0.5 * fade * brightness).toFixed(3)})`);
          grad.addColorStop(1, 'rgba(225,235,255,0)');
          ctx.strokeStyle = grad;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(px, py);
          ctx.lineTo(px - meteor.dx * 900 * (tail / 38), py - meteor.dy * 900 * (tail / 38));
          ctx.stroke();
        }
      }
    };

    const loop = (t: number) => {
      if (!running) return;
      raf = requestAnimationFrame(loop);
      if (t - lastFrame < FRAME_MS) return; // 30fps cap
      lastFrame = t;
      draw(t, true);
    };

    const start = () => {
      if (running || reduceMotion.matches || document.hidden) return;
      running = true;
      raf = requestAnimationFrame(loop);
    };
    const stop = () => {
      running = false;
      cancelAnimationFrame(raf);
    };

    const renderStatic = () => {
      stop();
      brightness = (stateRef.current.playing ? 0.95 : 0.78) * (1 - 0.65 * stateRef.current.dim);
      draw(performance.now(), false);
    };

    const onVisibility = () => {
      if (document.hidden) stop();
      else if (reduceMotion.matches) renderStatic();
      else start();
    };
    const onMotionPref = () => {
      if (reduceMotion.matches) renderStatic();
      else start();
    };
    // Resizing clears the canvas. While the animation loop is running it
    // repaints next frame, but under reduced motion there is no loop — so
    // redraw the still frame, or the sky vanishes after a rotate/resize.
    const onResize = () => {
      resize();
      if (reduceMotion.matches && !document.hidden) renderStatic();
    };

    redrawStaticRef.current = () => {
      if (reduceMotion.matches && !document.hidden) renderStatic();
    };

    resize();
    if (reduceMotion.matches) renderStatic();
    else start();

    window.addEventListener('resize', onResize);
    document.addEventListener('visibilitychange', onVisibility);
    reduceMotion.addEventListener('change', onMotionPref);
    return () => {
      stop();
      window.removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onVisibility);
      reduceMotion.removeEventListener('change', onMotionPref);
      redrawStaticRef.current = null;
    };
  }, []);

  // Under reduced motion there is no loop, so refresh the still frame
  // whenever the scene state changes.
  useEffect(() => {
    redrawStaticRef.current?.();
  }, [playing, intensity, dim]);

  return <canvas ref={canvasRef} className="night-sky" aria-hidden="true" />;
}

// [v0.0.36 perf] memo: all three props are primitives, so the sky only
// re-renders when playing / intensity / dim actually change — not on every App
// render (volume drags, library filters). The animation itself lives in the
// mount effect and reads live props through stateRef, which the (now less
// frequent) renders keep current.
export default memo(NightSky);
