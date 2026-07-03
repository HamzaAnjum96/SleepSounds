// drift away — procedural sound generators. Each builds a loop-conditioned
// 32s WAV from the shared DSP helpers; regenerateSound() re-renders a sound
// with new tuning params (used by the editor's WAV-backed sounds).

import {
  SR, N, gen, genStereo, decorrelateMono, lp1, hp1, bp2, smoothRandomLfo, rand, lockFreq, chance,
  whiteNoise, brownNoise, pinkNoise, random, seedRandom, hashSeed,
} from './dsp';

function genForest(params?: Record<string, number>): string {
  const { leaves = 0.7, twigs: twigsParam = 0.35, breeze = 0.5 } = params ?? {};
  const leavesMix = 0.5 + leaves * 0.5;
  const twigAmpScale = twigsParam * 2.0;
  const twigGapScale = 1.5 - twigsParam;
  const breezeFreq = 0.024 + breeze * 0.04;
  // Forest canopy: leafy broadband bed + twig flicks + distant bird-like highs
  const buf = pinkNoise();
  hp1(buf, 120);
  lp1(buf, 2200);
  for (let i = 0; i < N; i++) {
    const breezeEnv = 0.70 + 0.30 * Math.abs(Math.sin((2 * Math.PI * breezeFreq * i) / SR + 0.4));
    buf[i] *= breezeEnv;
  }
  const twigsBuf = new Float32Array(N);
  let twigPos = Math.floor(SR * 0.2);
  while (twigPos < N) {
    const len = Math.floor(SR * rand(0.004, 0.018));
    for (let i = 0; i < len && twigPos + i < N; i++) {
      const env = Math.exp(-7.5 * (i / len));
      twigsBuf[twigPos + i] += (random() * 2 - 1) * env * rand(0.04, 0.14) * twigAmpScale;
    }
    twigPos += Math.floor(SR * rand(0.11 * twigGapScale, 0.55 * twigGapScale));
  }
  hp1(twigsBuf, 1400);
  lp1(twigsBuf, 5400);

  const canopy = new Float32Array(N);
  for (let i = 0; i < N; i++) canopy[i] = buf[i] * leavesMix + twigsBuf[i] * (1 - leavesMix);
  return gen(canopy, 0.58);
}

function genWhite(params?: Record<string, number>): string {
  const { brightness = 0.55, depth = 0.5, texture = 0.4 } = params ?? {};
  const bodyLp = 4000 + brightness * 9200;
  const bodyHp = 30 + (1 - depth) * 120;
  const airMix = 0.08 + texture * 0.2;
  const shimmerDepth = 0.06 + texture * 0.16;
  // Softer white noise: band-limited and gently animated to reduce hiss fatigue.
  const body = whiteNoise();
  hp1(body, bodyHp);
  lp1(body, bodyLp);
  // A second, darker copy of the body crossfades in and out on a loop-closed
  // walk: the spectrum itself breathes a little (never the level alone), so
  // hours of it stay uneventful without going frozen.
  const dark = new Float32Array(body);
  lp1(dark, bodyLp * 0.45);
  const tilt = smoothRandomLfo(0, 0.35, 4.0, 9.0);
  for (let i = 0; i < N; i++) body[i] = body[i] * (1 - tilt[i]) + dark[i] * tilt[i];

  const air = whiteNoise();
  hp1(air, 2400);
  lp1(air, 10800);

  const drift = smoothRandomLfo(0.9, 1.1, 1.2, 3.8);
  // The air band's movement is a loop-closed random walk — the previous fixed
  // 0.065 Hz sine cycled audibly every ~15 s.
  const shimmer = smoothRandomLfo(Math.max(0, 1 - shimmerDepth * 2), 1, 2.0, 6.0);
  const mix = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    mix[i] = body[i] * (1 - airMix) * drift[i] + air[i] * airMix * shimmer[i];
  }
  const st = decorrelateMono(mix, 13);
  return genStereo(st.left, st.right, 0.62);
}

function genBrown(params?: Record<string, number>): string {
  const { depth = 0.7, rumble = 0.4, smoothness = 0.5 } = params ?? {};
  const alpha = 0.994 + depth * 0.005;
  const rumbleLpCut = 80 + rumble * 400;
  const rumbleMix = rumble * 0.3;
  const smoothLp = 200 + (1 - smoothness) * 2000;
  const buf = new Float32Array(N);
  let last = 0;
  for (let i = 0; i < N; i++) {
    last = alpha * last + (1 - alpha) * (random() * 2 - 1);
    buf[i] = last;
  }
  // Second LP pass for rumble emphasis
  const rumbleBuf = new Float32Array(buf);
  lp1(rumbleBuf, rumbleLpCut);
  for (let i = 0; i < N; i++) buf[i] = buf[i] * (1 - rumbleMix) + rumbleBuf[i] * rumbleMix;
  // Smoothness LP
  lp1(buf, smoothLp);
  // Brown noise is almost all low end, which is non-directional — keep it mono
  // (centred). Stereo width here only invites comb/phase artefacts.
  return gen(buf, 0.65);
}

function genFan(params?: Record<string, number>): string {
  const { speed = 0.1, hum: humParam = 0.4, airflow: airflowParam = 0.6, size = 0.2 } = params ?? {};

  // size=0: small bedroom fan (soft, warm, muffled)
  // size=1: large industrial fan (bright, buzzy, prominent tones)

  // Blade-pass frequency
  const bpfBase = 50 + speed * 70 + size * 110;
  const bpf  = lockFreq(bpfBase);
  const bpf2 = lockFreq(bpfBase * 2);
  const bpf3 = lockFreq(bpfBase * 3);

  const motorF  = lockFreq(60);
  const motorF2 = lockFreq(120);

  // Dual airflow model (per research): warm body layer + surface turbulence layer,
  // each with its own LFO so they breathe independently — closer to real fan acoustics
  // than a single pink-noise band.
  const bodyBuf = pinkNoise();               // 180–1800 Hz: the main "whoosh"
  hp1(bodyBuf, 180 + speed * 60);
  lp1(bodyBuf, 1500 + speed * 300 + size * 200);

  const surfaceBuf = pinkNoise();            // 500–3200 Hz: vortex / turbulent eddies
  hp1(surfaceBuf, 480 + speed * 180 + size * 80);
  lp1(surfaceBuf, 2600 + speed * 400 + size * 500);

  // Two narrow casing resonance peaks (higher Q than before for more defined character)
  const casing1 = whiteNoise();
  bp2(casing1, 420 + size * 180, 5.0 + size * 2.0);  // ~420–600 Hz
  const casing2 = whiteNoise();
  bp2(casing2, 700 + size * 220, 5.5 + size * 2.5);  // ~700–920 Hz

  // Motor-mount sub-warmth
  const bearingBuf = brownNoise();
  lp1(bearingBuf, 70 + size * 40);

  // Grill/edge hiss: barely audible on home fans
  const hissBuf = whiteNoise();
  hp1(hissBuf, 3000 + size * 800);
  lp1(hissBuf, 6000);

  const bodyLfo    = smoothRandomLfo(0.90, 1.0, 2.5, 7.0);
  const surfaceLfo = smoothRandomLfo(0.84, 1.0, 3.5, 9.0);   // slower, deeper variation
  // Blade amplitude drift: simulates subtle motor speed variation (tones swell/recede)
  const bladeAmp   = smoothRandomLfo(0.72, 1.0, 1.8, 5.5);
  const phaseJitter = smoothRandomLfo(-0.022, 0.022, 0.5, 2.0);

  const h2amp = 0.10 + size * 0.28;
  const h3amp = 0.02 + size * 0.13;

  const bodyW    = 0.40 + airflowParam * 0.28;
  const surfaceW = (0.16 + airflowParam * 0.12) * (0.5 + speed * 0.5);
  const casing1W = 0.016 + humParam * 0.014;
  const casing2W = 0.010 + humParam * 0.010;
  const bearingW = 0.022 + humParam * 0.024;
  const hissW    = (0.003 + size * 0.022) * (0.4 + speed * 0.6);
  const bladeW   = humParam * (0.012 + size * 0.042);
  const motorW   = humParam * (0.009 + size * 0.007);

  const mix = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const t      = (2 * Math.PI * i) / SR;
    const jitter = phaseJitter[i];

    // Asymmetric half-wave blade pulse, now with amplitude drift for motor variation
    const bladeRaw = Math.sin(bpf * t + jitter);
    const blade = ((bladeRaw > 0 ? bladeRaw * 0.85 : bladeRaw * 0.15)
                + Math.sin(bpf2 * t + jitter * 1.5) * h2amp
                + Math.sin(bpf3 * t + jitter * 2.2) * h3amp) * bladeAmp[i];

    const motor = Math.sin(motorF * t) * 0.65 + Math.sin(motorF2 * t + 1.1) * 0.28;

    mix[i] = bodyBuf[i]    * bodyW    * bodyLfo[i]
           + surfaceBuf[i] * surfaceW * surfaceLfo[i]
           + casing1[i]    * casing1W
           + casing2[i]    * casing2W
           + bearingBuf[i] * bearingW
           + hissBuf[i]    * hissW
           + blade * bladeW
           + motor * motorW;
  }

  // Final roll-off: removes top-end harshness, softer for small fans
  lp1(mix, 2800 + size * 4000);

  // A fan is a compact source with strong tonal blade/motor components; widening
  // those combs them. Keep it mono (centred) — stereo placement is the mixer's job.
  return gen(mix, 0.65);
}

function genPink(params?: Record<string, number>): string {
  const { warmth: warmthParam = 0.6, focus = 0.45, air = 0.4 } = params ?? {};
  const warmthMix = 0.05 + warmthParam * 0.16;
  const pinkHp = 20 + (1 - warmthParam) * 36;
  const textureBpCenter = 1600 + focus * 1200;
  const textureMix = 0.02 + focus * 0.06;
  const pinkLp = 4000 + air * 4400;
  // Smoother pink profile: trim subsonic rumble + tame top edge + add warm bed.
  const pink = pinkNoise();
  hp1(pink, pinkHp);
  lp1(pink, pinkLp);
  // The spectrum breathes slightly (loop-closed walk toward a darker copy) —
  // stationary-forever noise reads as synthetic; this stays uneventful
  // without freezing.
  const darker = new Float32Array(pink);
  lp1(darker, pinkLp * 0.4);
  const tilt = smoothRandomLfo(0, 0.3, 4.5, 10.0);
  for (let i = 0; i < N; i++) pink[i] = pink[i] * (1 - tilt[i]) + darker[i] * tilt[i];

  const warmthBuf = brownNoise();
  hp1(warmthBuf, 24);
  lp1(warmthBuf, 420);

  const texture = whiteNoise();
  bp2(texture, textureBpCenter, 0.9);
  lp1(texture, 4200);

  const mix = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    mix[i] = pink[i] * (1 - warmthMix - textureMix) + warmthBuf[i] * warmthMix + texture[i] * textureMix;
  }
  const st = decorrelateMono(mix, 12);
  return genStereo(st.left, st.right, 0.64);
}

function genRain(params?: Record<string, number>): string {
  const { intensity = 0.65, heaviness = 0.5, surface = 0.5, drops = 0.25, bed: bedLevel = 1, movement = 0.4, space = 0.18 } = params ?? {};
  // Folded controls (mirror the worklet): movement drives the swell, surface
  // colours the bed.
  const swell = movement * 0.4;
  const tone = Math.max(0, 0.75 - surface * 0.6);
  const gapScale = 0.3 + (1 - intensity) * 1.4;
  const bedHp = 120 + (1 - heaviness) * 120;
  // tone opens or closes the bed's top end (darker = less metallic).
  const bedLp = 1800 + tone * 6000 + (1 - heaviness) * 1800;
  // metallic (opt-in) drives the tonal, bright "tin/window" character. At 0 the
  // fallback loop stays dark and soft like the worklet's default; raising it
  // brings the pings and bright bubbles back. Keeps the WAV fallback aligned
  // with the live path so neither reads as rain on tin by default.
  const metallic = params?.metallic ?? 0;
  const bubbleChance = (0.10 + surface * 0.2) * (0.4 + metallic * 1.4);
  const pingChance = (0.04 + surface * 0.12) * (0.3 + metallic * 2.0);
  // Rain: diffuse bed + clustered impacts + tonal bubble-like micro-events
  const bed = pinkNoise();
  hp1(bed, bedHp);
  lp1(bed, bedLp);
  const density = smoothRandomLfo(0.65, 1.35, 0.8, 3.2);
  for (let i = 0; i < N; i++) bed[i] *= (0.76 + 0.24 * density[i]);

  const impacts = new Float32Array(N);
  const bubbles = new Float32Array(N);
  let pos = Math.floor(SR * 0.02);
  while (pos < N) {
    const clusterDur = Math.floor(SR * rand(0.08, 0.45));
    const clusterEnd = Math.min(N, pos + clusterDur);
    while (pos < clusterEnd) {
      const len = Math.floor(SR * rand(0.002, 0.009));
      const amp = Math.exp(rand(-4.8, -1.6));
      const riseN = Math.max(2, Math.floor(SR * 0.001));
      for (let i = 0; i < len && pos + i < N; i++) {
        const riseGain = Math.min(1, i / riseN);
        const env = Math.exp(-8 * (i / Math.max(1, len))) * riseGain;
        impacts[pos + i] += (random() * 2 - 1) * amp * env;
      }
      if (chance(pingChance)) {
        const pingF  = rand(600, 1400);
        const pingLen = Math.floor(SR * rand(0.003, 0.008));
        const pingAmp = amp * rand(0.14, 0.28);
        for (let i = 0; i < pingLen && pos + i < N; i++) {
          const riseGain = Math.min(1, i / 2);
          impacts[pos + i] += Math.sin(2 * Math.PI * pingF * (i / SR))
            * Math.exp(-14 * (i / pingLen)) * pingAmp * riseGain;
        }
      }
      if (chance(bubbleChance)) {
        const bLen = Math.floor(SR * rand(0.01, 0.022));
        const f0 = rand(650, 1700);
        const f1 = f0 * rand(0.75, 0.92);
        const bAmp = rand(0.015, 0.055);
        let bPh = 0;
        for (let i = 0; i < bLen && pos + i < N; i++) {
          const p = i / Math.max(1, bLen - 1);
          const env = Math.exp(-5.5 * p);
          const f = f0 + (f1 - f0) * p;
          bPh += (2 * Math.PI * f) / SR;
          bubbles[pos + i] += Math.sin(bPh) * env * bAmp;
        }
      }
      pos += Math.floor(SR * rand(0.004, 0.03));
    }
    pos += Math.floor(SR * rand(0.03 * gapScale, 0.25 * gapScale));
  }
  // Keep more low-mid body in the impacts (a soft pock, not a bright tick) and
  // cap their top low unless metallic opens it — the high-passed-at-1400 +
  // 9 kHz ceiling of before is exactly what read as rain on tin.
  // space (room/diffusion): a roomier field softens the transient bite a touch.
  hp1(impacts, 700); lp1(impacts, 2600 + metallic * 6000 - space * 700);
  hp1(bubbles, 420); lp1(bubbles, 2600 + metallic * 3000);
  const mix = new Float32Array(N);
  // One full swell cycle per loop, so the shower rises and eases without a
  // seam (sin is 0 at both ends). Mild by default, deeper as swell climbs.
  const swellDepth = swell * 0.6;
  // drops pushes the surface hits (and their bubble tails) forward against the
  // bed, matching the live worklet's drop-prominence control. Low floor so the
  // open-air variants read as a soft muted patter under the wash, while the
  // surface variants (high drops) push their hits forward.
  const impGain = 0.05 + drops * 0.22;
  const bubGain = 0.03 + drops * 0.09;
  // bed trims the continuous curtain (matches the live worklet's bed control);
  // space fills the room a little more, so the wash sits fuller behind the hits.
  const bedGain = 0.78 * bedLevel * (1 + space * 0.18);
  for (let i = 0; i < N; i++) {
    const s = 1 + swellDepth * Math.sin((2 * Math.PI * i) / N);
    mix[i] = (bed[i] * bedGain + impacts[i] * impGain + bubbles[i] * bubGain) * s;
  }
  return gen(mix, 0.7);
}

function genOcean(params?: Record<string, number>): string {
  const { waveSize = 0.55, foam = 0.5, depth = 0.5 } = params ?? {};
  const waveMin = 5 + waveSize * 5;
  const waveMax = 10 + waveSize * 10;
  const surfLp = 1200 + foam * 1600;
  // Surf follows the wave size too: small waves shouldn't wash as loud as
  // rollers just because the foam knob matches.
  const surfMix = (0.14 + foam * 0.32) * (0.6 + 0.4 * waveSize);
  const baseLp = 240 + depth * 240;
  const baseMix = 0.4 + depth * 0.44;
  // Ocean shoreline with the full anatomy of a breaking wave: the undertow
  // body swells, the crest *breaks* (a brighter burst as it folds over), the
  // wash spreads, and a lower backwash rakes back down the shore before the
  // next wave. Each wave pans to its own spot so the shore rolls left↔right.
  const base = brownNoise();
  lp1(base, baseLp); lp1(base, baseLp * 0.75);
  const bed = decorrelateMono(base, 16);

  const surf = pinkNoise();
  hp1(surf, 220);
  lp1(surf, surfLp);

  // The break: brighter, foamier than the wash — only opens as the crest folds.
  const crash = pinkNoise();
  hp1(crash, 650);
  lp1(crash, 1400 + foam * 2200);

  // The backwash: low, granular water raking back down the slope.
  const wash = pinkNoise();
  hp1(wash, 130);
  lp1(wash, 650);

  // Waves are fitted to the loop: pick whole periods, then scale them so the
  // final wave completes exactly at the buffer edge (no mid-crest seam lurch).
  // Each wave also gets a pan; the envelope dips to ~0 between waves, so the
  // pan change is masked at the boundary.
  const periods: number[] = [];
  let totalLen = 0;
  while (totalLen < N) {
    const p = Math.floor(SR * rand(waveMin, waveMax));
    periods.push(p);
    totalLen += p;
  }
  const fit = N / totalLen;
  const waveEnvBuf = new Float32Array(N);
  const crashEnvBuf = new Float32Array(N);
  const washEnvBuf = new Float32Array(N);
  const panBuf = new Float32Array(N);
  let wPos = 0;
  for (const raw of periods) {
    const period = Math.max(1, Math.round(raw * fit));
    const wAmp = rand(0.45, 1.0);
    const pan = rand(-0.5, 0.5);
    // The break rises fast in real time (~120 ms), not as a share of the
    // period, then dies across the wash.
    const crashStart = Math.floor(period * 0.34);
    const crashAttack = Math.floor(SR * 0.2); // eased fold-over, not a slap
    const crashDecay = Math.max(1, Math.floor(period * 0.30));
    const crashAmp = wAmp * rand(0.55, 1.0);
    for (let i = 0; i < period && wPos + i < N; i++) {
      const p = i / period;
      let env: number;
      if (p < 0.38) env = Math.pow(p / 0.38, 1.6) * wAmp;
      else if (p < 0.52) env = wAmp;
      else env = Math.pow((1 - p) / 0.48, 0.75) * wAmp;
      waveEnvBuf[wPos + i] += env;
      panBuf[wPos + i] = pan;
      const ci = i - crashStart;
      if (ci >= 0) {
        crashEnvBuf[wPos + i] += crashAmp * (ci < crashAttack
          ? 0.5 - 0.5 * Math.cos(Math.PI * (ci / crashAttack))
          : Math.exp(-3 * ((ci - crashAttack) / crashDecay)));
      }
      if (p >= 0.60) {
        washEnvBuf[wPos + i] += wAmp * Math.pow(Math.sin(Math.PI * ((p - 0.60) / 0.40)), 1.3);
      }
    }
    wPos += period;
  }

  const left = new Float32Array(N);
  const right = new Float32Array(N);
  // The break rides foam *squared*: at low foam the crest folds almost
  // soundlessly, so the calm shore scenes stay genuinely calm.
  const crashMix = 0.05 + foam * foam * 0.6;
  const washMix = 0.10 + depth * 0.10;
  for (let i = 0; i < N; i++) {
    const wEnv = Math.min(1, waveEnvBuf[i]);
    const wBase = (0.24 + 0.76 * wEnv) * baseMix;
    const pan = panBuf[i];
    const pl = Math.cos((pan + 1) * Math.PI / 4);
    const pr = Math.sin((pan + 1) * Math.PI / 4);
    const surfS = surf[i] * (0.08 + 0.92 * Math.pow(wEnv, 1.8)) * surfMix
      + crash[i] * Math.min(1.2, crashEnvBuf[i]) * crashMix
      + wash[i] * Math.min(1, washEnvBuf[i]) * washMix;
    left[i] = bed.left[i] * wBase + surfS * pl;
    right[i] = bed.right[i] * wBase + surfS * pr;
  }
  // Encoding is peak-normalised, which would boost a calm render right back
  // up — so the output gain itself follows the scene's intensity, and the
  // gentle shores actually play quieter than the storm.
  const intensity = 0.4 * waveSize + 0.6 * foam;
  return genStereo(left, right, 0.72 * (0.55 + 0.45 * intensity));
}

function genWind(params?: Record<string, number>): string {
  const { gusts = 0.5, whistle = 0.3, tone = 0.5 } = params ?? {};
  const gustDepth = 0.2 + gusts * 0.6;
  const whistleMixLevel = whistle * 0.28;
  const bodyLp = 600 + tone * 800;
  // Wind: gust-driven turbulence with drifting resonant edge tones. Gusts
  // arrive irregularly (loop-closed random walks) — the previous triple-sine
  // pattern repeated audibly every ~26 s, which is exactly the kind of cycle
  // the half-asleep ear latches onto.
  const buf = pinkNoise();
  hp1(buf, 90);
  lp1(buf, bodyLp + 400); lp1(buf, bodyLp);
  const gust = smoothRandomLfo(0, 1, 2.4, 7.0);       // where the gusts live
  const flutter = smoothRandomLfo(0.82, 1.12, 0.22, 0.8); // fast micro-turbulence
  const drift = smoothRandomLfo(0.9, 1.1, 1.8, 5.2);
  for (let i = 0; i < N; i++) {
    const g = (1 - gustDepth) + gustDepth * (0.18 + 0.82 * gust[i] * gust[i]);
    buf[i] *= g * flutter[i] * drift[i];
  }
  // Gust bed: wind's whoosh is low/mid-band (rolled off ~1–1.4 kHz), so the
  // default 800 Hz crossover would spread the body itself and the gust reads as
  // two separate fans left/right. Keep the whole whoosh shared (centred) with a
  // crossover above its content; width comes from the panned edge tones below.
  const bed = decorrelateMono(buf, 13, 1600);
  // Edge tones each sit at their own place across the stereo field, so the
  // whistles read as located resonances rather than a centred chorus. Their
  // pitch follows the brightness control, and they only really sing when the
  // wind is actually up — an edge tone in a lull is wrong.
  const whistleShift = 0.72 + tone * 0.56;
  const whistleStrips = [
    { fc: 360 * whistleShift,  q: 4.0, pan: -0.55 },
    { fc: 620 * whistleShift,  q: 4.5, pan:  0.40 },
    { fc: 960 * whistleShift,  q: 4.2, pan: -0.30 },
    { fc: 1380 * whistleShift, q: 5.0, pan:  0.62 },
  ];
  const whistleL = new Float32Array(N);
  const whistleR = new Float32Array(N);
  for (const s of whistleStrips) {
    const stripNoise = whiteNoise();
    bp2(stripNoise, s.fc, s.q);
    const stripLfo = smoothRandomLfo(0.0, 1.0, 1.4, 5.5);
    const pl = Math.cos((s.pan + 1) * Math.PI / 4);
    const pr = Math.sin((s.pan + 1) * Math.PI / 4);
    for (let i = 0; i < N; i++) {
      const v = stripNoise[i] * stripLfo[i] * (0.30 + 0.70 * gust[i]) * 0.25;
      whistleL[i] += v * pl; whistleR[i] += v * pr;
    }
  }
  const left = new Float32Array(N);
  const right = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    left[i]  = bed.left[i]  * (1 - whistleMixLevel) + whistleL[i] * whistleMixLevel;
    right[i] = bed.right[i] * (1 - whistleMixLevel) + whistleR[i] * whistleMixLevel;
  }
  return genStereo(left, right, 0.68);
}

function genFire(params?: Record<string, number>): string {
  // Fire: deep turbulent roar + flame body + hiss + ember + whoosh +
  //       crackle bursts + spit crackles + pops + log shifts.
  // Honors the editor's fire params so the fallback's variants differ the same
  // way the live worklet's do. Note gen() peak-normalizes, so only the *relative*
  // balance / density / brightness survive — global levels are renormalized away.
  const {
    intensity = 0.30, dryness = 0.38, crackleBias = 0.65, size = 0.65,
    distance = 0.58, wind = 0.22, bodyVol = 0.52, roarMean = 0.81,
    crackleBase = 9, crackleVol = 3.1, popVol = 0.55, hiss: hissParam = 0.18,
  } = params ?? {};
  // Roar is deliberately held back (matches the worklet's lowered bodyVol): the
  // crackle/pop character should lead, not the rush. roarLevel folds in bodyVol
  // and roarMean; bigger fires keep a touch more body and low end.
  const roarLevel = 0.16 * bodyVol * (0.45 + roarMean * 0.6);
  const bodyLevel = 0.15 * bodyVol * (0.5 + intensity * 0.8);
  const roarTop = 420 + size * 380;
  const bodyTop = 900 + size * 650;
  // Crackle density (crackleBase 0–15), loudness (crackleVol 0–6) and brightness
  // (dryness) all scale; distance darkens the whole image and recedes the highs.
  const crackDensity = 0.4 + (crackleBase / 15) * 1.5;
  const crackAmpScale = 0.55 + (crackleVol / 6) * 1.4;
  const popAmpScale = 0.4 + (popVol / 3) * 2.2;
  const crackLp = 4200 + dryness * 4200 - distance * 1800;
  const crackHp = 600 + dryness * 350;
  const whooshLevel = 0.02 + wind * 0.05;
  const hissLevel = 0.018 + hissParam * 0.06;
  const emberLevel = 0.008 + hissParam * 0.03;
  const masterLp = 8800 - distance * 5600;
  const crackleMixW = 0.30 * (0.6 + crackleBias * 0.85);

  // ── 1. Deep roar body: brown rumble + pink mid-roar, independently modulated ──
  const roar = brownNoise();
  hp1(roar, 40);
  lp1(roar, roarTop);

  const body = pinkNoise();
  hp1(body, 100);
  lp1(body, bodyTop);

  // Irregular "breathing" — two uncorrelated slow LFOs compound-modulate the flame.
  const breathA = smoothRandomLfo(0.55, 1.0, 2.0, 6.0);
  const breathB = smoothRandomLfo(0.60, 1.0, 1.5, 4.5);

  // ── 2. Flame hiss: high-pass sizzle that rises with flame intensity.
  // LP at 6000 Hz (not 9000) keeps the sizzle warm rather than sharp white. ──
  const hiss = whiteNoise();
  hp1(hiss, 2000);
  lp1(hiss, 4500);

  // ── 3. Ember sizzle: warm high-freq texture, fading in/out independently.
  // HP lowered to 3500 Hz and LP to 7500 Hz so it blends as a sizzle rather
  // than adding harsh white noise energy near Nyquist. ──
  const ember = whiteNoise();
  hp1(ember, 3500);
  lp1(ember, 7500);
  const emberLfo = smoothRandomLfo(0.0, 1.0, 2.0, 7.0);

  // ── 4. Whoosh: mid-freq air-rush that swells with each breath peak.
  // When the flame flares, air is drawn in and creates a soft roaring rush
  // in the 300–1200 Hz band — distinct from the tonal body and high hiss.
  const whoosh = pinkNoise();
  hp1(whoosh, 320);
  lp1(whoosh, 1200);
  lp1(whoosh, 900); // double-pole for steeper roll-off above 1 kHz

  // ── 5. Clustered crackle bursts ──
  const crackles = new Float32Array(N);
  let pos = Math.floor(SR * 0.15);
  while (pos < N) {
    const burstDur = Math.floor(SR * rand(0.05, 0.30));
    const burstEnd = Math.min(N, pos + burstDur);
    const burstIntensity = rand(0.08, 0.28) * crackAmpScale;
    let cPos = pos;
    while (cPos < burstEnd) {
      const len = Math.floor(SR * rand(0.001, 0.008));
      const amp = burstIntensity * rand(0.3, 1.0);
      for (let i = 0; i < len && cPos + i < N; i++) {
        const env = Math.exp(-12 * (i / Math.max(1, len)));
        crackles[cPos + i] += (random() * 2 - 1) * amp * env;
      }
      // Resin ping: ~30% of crackles get a brief tonal ring (wood-fiber snap).
      // 180–520 Hz matches the resonant range of burning wood and dry bark.
      if (chance(0.30)) {
        const pingF   = rand(180, 520);
        const pingLen = Math.floor(SR * rand(0.004, 0.014));
        const pingAmp = amp * rand(0.20, 0.40);
        let ph = 0;
        for (let i = 0; i < pingLen && cPos + i < N; i++) {
          ph += (2 * Math.PI * pingF) / SR;
          crackles[cPos + i] += Math.sin(ph)
            * Math.exp(-9 * (i / Math.max(1, pingLen))) * pingAmp;
        }
      }
      cPos += Math.floor(SR * rand(0.003, 0.04) / crackDensity);
    }
    pos = burstEnd + Math.floor(SR * rand(0.3, 1.8) / crackDensity);
  }
  hp1(crackles, crackHp);
  lp1(crackles, crackLp);

  // ── 6. Spit crackles: sparse individual snaps scattered between bursts.
  // Fire never fully stops crackling — these fill the gaps between burst clusters
  // so the texture remains alive even during quiet moments.
  const spits = new Float32Array(N);
  let spitPos = Math.floor(SR * rand(0.1, 0.4));
  while (spitPos < N) {
    const len = Math.floor(SR * rand(0.0008, 0.004));
    const amp = rand(0.04, 0.18);
    for (let i = 0; i < len && spitPos + i < N; i++) {
      spits[spitPos + i] += (random() * 2 - 1)
        * amp * Math.exp(-15 * (i / Math.max(1, len)));
    }
    spitPos += Math.floor(SR * rand(0.08, 0.6));
  }
  hp1(spits, 1200);
  lp1(spits, 8000);

  // ── 7. Pops: infrequent, louder, low-frequency thuds ──
  const pops = new Float32Array(N);
  let popPos = Math.floor(SR * rand(1.0, 3.0));
  while (popPos < N) {
    const len = Math.floor(SR * rand(0.008, 0.025));
    const amp = rand(0.15, 0.40) * popAmpScale;
    const f0 = rand(80, 250);
    let ph = 0;
    for (let i = 0; i < len && popPos + i < N; i++) {
      const env = Math.exp(-6 * (i / Math.max(1, len)));
      ph += (2 * Math.PI * f0) / SR;
      pops[popPos + i] += (Math.sin(ph) * 0.6 + (random() * 2 - 1) * 0.4)
                          * env * amp;
    }
    popPos += Math.floor(SR * rand(1.5, 6.0));
  }
  // 2400 Hz ceiling keeps pop presence without sounding tinny
  lp1(pops, 2400);

  // ── 8. Log shifts: 3–6 deep low-frequency rumble events per loop.
  // Occasional settling of logs — single slow-attack impulses in the 40–90 Hz
  // range, much lower and longer than pops, giving the fire physical weight.
  const logShifts = new Float32Array(N);
  const numShifts = Math.floor(rand(3, 7));
  for (let k = 0; k < numShifts; k++) {
    const shiftPos = Math.floor(rand(SR * 1.0, N - SR * 2.0));
    const len      = Math.floor(SR * rand(0.15, 0.50));
    const amp      = rand(0.12, 0.35);
    const f0       = rand(40, 90);
    let ph = 0;
    for (let i = 0; i < len && shiftPos + i < N; i++) {
      const p   = i / len;
      // Slow attack, long tail — sounds like a log settling rather than a pop
      const env = Math.pow(p < 0.1 ? p / 0.1 : (1 - p) / 0.9, 0.6);
      ph += (2 * Math.PI * f0) / SR;
      logShifts[shiftPos + i] +=
        (Math.sin(ph) * 0.5 + (random() * 2 - 1) * 0.5) * env * amp;
    }
  }
  hp1(logShifts, 25);
  lp1(logShifts, 280);

  // ── Mix ──
  // Crackles and pops lead; the roar/body bed is held well back (low bodyVol).
  const mix = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const breath = breathA[i] * breathB[i]; // compound modulation
    mix[i] =
      roar[i]       * roarLevel * breathA[i] +
      body[i]       * bodyLevel * breath +
      hiss[i]       * hissLevel * breath +
      ember[i]      * emberLevel * emberLfo[i] +
      whoosh[i]     * whooshLevel * breath +
      crackles[i]   * crackleMixW +
      spits[i]      * 0.12 * crackAmpScale +
      pops[i]       * 0.14 +
      logShifts[i]  * 0.04;
  }
  // Distance darkens the whole image (a far fire loses its top end).
  lp1(mix, masterLp);
  return gen(mix, 0.96);  // +1.5x headroom (default volume lowered to match)
}

function genBirdsong(params?: Record<string, number>): string {
  // Birdsong: varied bird calls without ambience bed. Honors the editor's
  // birdsong params so the fallback's variants (Distant / Garden / Dawn Chorus)
  // differ like the live worklet's. gen() peak-normalizes, so the per-element
  // *relative* volumes, call/trill/peep densities and pitches carry the variant
  // character; the global `gain` is renormalized away and so is unused here.
  const {
    callRate = 2.0, callPitch = 0.5, callVol = 1.0, callVariety = 0.5,
    trillRate = 0.30, trillPitch = 0.5, trillVol = 1.0, trillSpeed = 0.5,
    peepRate = 0.50, peepVol = 0.5,
  } = params ?? {};
  // Densities are normalized so the defaults reproduce the original loop; a chip
  // that raises callRate/trillRate/peepRate packs the events tighter.
  const callDensity = Math.max(0.3, callRate / 2);
  const trillDensity = 0.3 + trillRate * 2.33;
  const peepDensity = 0.3 + peepRate * 1.4;
  // callPitch sets the band centre; callVariety widens both the band and the
  // per-chirp glide so a varied chorus spreads across more notes.
  const callLo = 1500 + callPitch * 1800;
  const callSpan = 600 + callVariety * 2400;

  // ── 1. Bird calls: short melodic chirps at varied pitches ──
  const calls = new Float32Array(N);
  let callPos = Math.floor(SR * rand(0.3, 1.2));
  while (callPos < N) {
    // Each bird call is a series of 2–6 chirps
    const numChirps = Math.floor(rand(2, 7));
    const baseFreq = rand(callLo, callLo + callSpan);
    const chirpGap = rand(0.06, 0.14);
    const callAmp = rand(0.08, 0.25) * callVol;

    let chirpPos = callPos;
    for (let c = 0; c < numChirps && chirpPos < N; c++) {
      const chirpLen = Math.floor(SR * rand(0.03, 0.09));
      const freq = baseFreq * rand(1 - callVariety * 0.25, 1 + callVariety * 0.3);
      const freqEnd = freq * rand(0.7 - callVariety * 0.2, 1.3 + callVariety * 0.2); // pitch glide
      let ph = 0;
      for (let i = 0; i < chirpLen && chirpPos + i < N; i++) {
        const p = i / chirpLen;
        // Bell-shaped envelope: smooth attack and decay
        const env = Math.sin(Math.PI * p) * callAmp;
        const f = freq + (freqEnd - freq) * p;
        ph += (2 * Math.PI * f) / SR;
        calls[chirpPos + i] += Math.sin(ph) * env;
      }
      chirpPos += Math.floor(SR * (chirpLen / SR + chirpGap));
    }

    // Gap between bird calls, tighter as call density climbs.
    callPos = chirpPos + Math.floor(SR * rand(0.8, 4.0) / callDensity);
  }
  hp1(calls, 1200);
  lp1(calls, 8000);

  // ── 2. Trills: rapid warbling sequences ──
  const trills = new Float32Array(N);
  let trillPos = Math.floor(SR * rand(1.5, 4.0));
  const trillLo = 2000 + trillPitch * 2000;
  const warbleRate = 12 + trillSpeed * 30;
  while (trillPos < N) {
    const trillLen = Math.floor(SR * rand(0.3, 0.8));
    const trillFreq = rand(trillLo, trillLo + 1600);
    const trillAmp = rand(0.06, 0.16) * trillVol;
    let ph = 0;
    for (let i = 0; i < trillLen && trillPos + i < N; i++) {
      const p = i / trillLen;
      // Fade in/out envelope
      const env = Math.sin(Math.PI * p) * trillAmp;
      // Frequency modulation for warble effect
      const fMod = trillFreq + Math.sin(2 * Math.PI * warbleRate * (i / SR)) * trillFreq * 0.15;
      ph += (2 * Math.PI * fMod) / SR;
      trills[trillPos + i] += Math.sin(ph) * env;
    }
    trillPos += trillLen + Math.floor(SR * rand(2.5, 8.0) / trillDensity);
  }
  hp1(trills, 1800);
  lp1(trills, 9000);

  // ── 3. Distant soft peeps: very quiet background birds ──
  const peeps = new Float32Array(N);
  let peepPos = Math.floor(SR * rand(0.5, 2.0));
  const peepAmpScale = peepVol * 2;
  while (peepPos < N) {
    const peepLen = Math.floor(SR * rand(0.015, 0.04));
    const peepFreq = rand(3000, 6000);
    const peepAmp = rand(0.02, 0.06) * peepAmpScale;
    let ph = 0;
    for (let i = 0; i < peepLen && peepPos + i < N; i++) {
      const p = i / peepLen;
      const env = Math.sin(Math.PI * p) * peepAmp;
      ph += (2 * Math.PI * peepFreq) / SR;
      peeps[peepPos + i] += Math.sin(ph) * env;
    }
    peepPos += Math.floor(SR * rand(0.3, 1.8) / peepDensity);
  }
  lp1(peeps, 7000);

  // ── Mix ──
  const mix = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    mix[i] = calls[i] * 0.55 + trills[i] * 0.30 + peeps[i] * 0.15;
  }
  return gen(mix, 0.93);  // +1.5x headroom (default volume lowered to match)
}

function genStream(params?: Record<string, number>): string {
  const { flow: flowParam = 0.6, sparkle = 0.45, depth = 0.5 } = params ?? {};
  const lfoMin = 0.5 + flowParam * 0.4;
  const lfoMax = 1.0 + flowParam * 0.5;
  const rippleHp = 800 + sparkle * 800;
  const rippleMix = 0.12 + sparkle * 0.2;
  const bedHp = 100 + (1 - depth) * 160;
  // Gentle stream: broad watery bed with bright ripples.
  const bed = pinkNoise();
  hp1(bed, bedHp);
  lp1(bed, 2600);

  const ripples = whiteNoise();
  hp1(ripples, rippleHp);
  lp1(ripples, 7600);

  const flowLfo = smoothRandomLfo(lfoMin, lfoMax, 0.5, 2.4);

  // The babble: a population of real bubble events over the flow wash (see
  // docs/research/water-family-synthesis.md) — damped sinusoids with the
  // up-chirp, individually panned. This is what separates a brook from
  // filtered noise: the wash carries the water, the bubbles carry the voice.
  const babbleL = new Float32Array(N);
  const babbleR = new Float32Array(N);
  const babbleRate = 6 + flowParam * 16; // events/sec, surging with the flow
  let bPos = Math.floor(SR * 0.03);
  while (bPos < N) {
    const bright = chance(0.22 + sparkle * 0.38);
    const f0 = bright ? rand(1100, 2400) : rand(420, 1100);
    const tau = (0.018 + 9 / f0) * rand(0.75, 1.3);
    const len = Math.min(Math.floor(SR * tau * 4), N - bPos);
    const amp = bright ? rand(0.012, 0.035) : rand(0.02, 0.055);
    const pan = rand(-0.8, 0.8);
    const pl = Math.cos((pan + 1) * Math.PI / 4);
    const pr = Math.sin((pan + 1) * Math.PI / 4);
    const attack = Math.floor(SR * 0.0015);
    let ph = random() * 2 * Math.PI;
    for (let i = 0; i < len; i++) {
      const ts = i / SR;
      const env = (i < attack ? i / attack : 1) * Math.exp(-ts / tau);
      ph += (2 * Math.PI * f0 * (1 + 0.4 * (ts / tau))) / SR; // the up-chirp
      const s = Math.sin(ph) * env * amp;
      babbleL[bPos + i] += s * pl;
      babbleR[bPos + i] += s * pr;
    }
    bPos += Math.max(60, Math.floor(SR / (babbleRate * (0.4 + flowLfo[Math.min(N - 1, bPos)]))));
  }

  // Collective low band: a bubble cloud also hums together below its
  // individual voices (the coupled-bubble emission) — depth sets how much.
  const collective = brownNoise();
  lp1(collective, 170);

  // Modulate the bed and ripples in mono, then decorrelate each separately:
  // the bright ripples spread wider than the body, so the stream glitters
  // across the image instead of trickling down the centre.
  const bedMod = new Float32Array(N);
  const ripMod = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    bedMod[i] = bed[i] * flowLfo[i];
    ripMod[i] = ripples[i] * Math.pow(Math.max(0, flowLfo[i]), 1.8);
  }
  const bedSt = decorrelateMono(bedMod, 15);
  const ripSt = decorrelateMono(ripMod, 9);
  const left = new Float32Array(N);
  const right = new Float32Array(N);
  const collW = 0.04 + depth * 0.09;
  for (let i = 0; i < N; i++) {
    const wash = 1 - rippleMix;
    left[i]  = bedSt.left[i]  * wash + ripSt.left[i]  * rippleMix + babbleL[i] * 0.6 + collective[i] * collW;
    right[i] = bedSt.right[i] * wash + ripSt.right[i] * rippleMix + babbleR[i] * 0.6 + collective[i] * collW;
  }
  return genStereo(left, right, 0.66);
}

function genThunder(params?: Record<string, number>): string {
  const { stormIntensity = 0.5, rumble = 0.6, distance = 0.4 } = params ?? {};
  const boomGapMin = 2 + (1 - stormIntensity) * 4;
  const boomGapMax = 6 + (1 - stormIntensity) * 8;
  const rollMix = 0.5 + rumble * 0.48;
  const masterLp = 1200 + (1 - distance) * 6000;
  const hissMix = 0.06 + (1 - distance) * 0.08;
  // Distant thunder roll with occasional low booms.
  const roll = brownNoise();
  hp1(roll, 24);
  lp1(roll, 420);

  const hiss = pinkNoise();
  hp1(hiss, 1800);
  lp1(hiss, 5200);

  const booms = new Float32Array(N);
  let pos = Math.floor(SR * rand(1.5, 4.5));
  while (pos < N) {
    const len = Math.floor(SR * rand(0.7, 2.2));
    const amp = rand(0.12, 0.34);
    const f0 = rand(36, 95);
    let ph = 0;
    for (let i = 0; i < len && pos + i < N; i++) {
      const p = i / Math.max(1, len - 1);
      const env = Math.exp(-4.6 * p);
      const f = f0 * (1 - p * 0.35);
      ph += (2 * Math.PI * f) / SR;
      booms[pos + i] += Math.sin(ph) * env * amp;
    }
    pos += Math.floor(SR * rand(boomGapMin, boomGapMax));
  }
  hp1(booms, 24);
  lp1(booms, 240);

  const swell = smoothRandomLfo(0.64, 1.26, 1.4, 6.2);
  const mix = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    mix[i] = roll[i] * rollMix * swell[i] + hiss[i] * hissMix + booms[i] * 0.16;
  }
  lp1(mix, masterLp);
  return gen(mix, 0.7);
}

function genTrain(params?: Record<string, number>): string {
  const { speed = 0.5, rumble: rumbleParam = 0.5, clatter = 0.35 } = params ?? {};
  // A train carriage carries two time structures at once: a continuous,
  // speed-dependent floor (body boom, rolling band, rail mid, wheel top,
  // traction at low speed, aero hiss at high), and an event layer of joint
  // clacks that arrive in axle pairs at rail-length intervals — never as a
  // metronome of single clicks.

  // ── Continuous floor ──────────────────────────────────────────────
  // Body / bogie boom: the deep underfloor weight (sub-220 Hz).
  const body = brownNoise();
  hp1(body, 26);
  lp1(body, 90 + rumbleParam * 130);
  const sway = smoothRandomLfo(0.8, 1.15, 1.2, 4.5);

  // Rolling noise: the broadband wheel-on-rail band, with roughness
  // micro-flutter so it never reads as static hiss.
  const rolling = pinkNoise();
  hp1(rolling, 240);
  lp1(rolling, 800 + speed * 1000);
  lp1(rolling, 2600); // second pole: the band must never read as open hiss
  const roughness = smoothRandomLfo(0.72, 1.28, 0.08, 0.3);

  // Rail-dominant middle band (~1 kHz) and wheel brightness (2–5 kHz),
  // split so the texture changes believably with speed.
  const railMid = whiteNoise();
  bp2(railMid, 850 + speed * 350, 1.6);
  const wheelTop = whiteNoise();
  hp1(wheelTop, 2300);
  lp1(wheelTop, 5200);
  const wheelDrift = smoothRandomLfo(0.6, 1.1, 0.5, 2.0);

  // Traction / auxiliaries: motors, compressors, fans. Dominant at low
  // speed, receding as rolling noise takes over.
  const traction = pinkNoise();
  hp1(traction, 85);
  lp1(traction, 520);
  const humF = lockFreq(46 + speed * 28);

  // Aerodynamic hiss: only blooms toward the top of the speed range.
  const aero = whiteNoise();
  hp1(aero, 1500);
  lp1(aero, 6400);

  // ── Event layer: joints under axle pairs ──────────────────────────
  const mps = (40 + speed * 180) / 3.6;     // 40–220 km/h
  const jointGapS = 19 / mps;               // ~19 m rail lengths
  const axleGapS = 2.6 / mps;               // bogie axle spacing
  const clacks = new Float32Array(N);
  const thumps = new Float32Array(N);
  let jPos = SR * rand(0.2, 1.0);
  while (jPos < N) {
    // Some joints are welded out, so the rhythm breathes instead of ticking.
    if (chance(0.85)) {
      const strength = rand(0.5, 1.0) * (0.45 + clatter * 0.9);
      for (const axle of [0, 1] as const) {
        const aPos = Math.floor(jPos + axle * axleGapS * SR * rand(0.92, 1.08));
        const len = Math.floor(SR * rand(0.003, 0.009));
        const amp = strength * rand(0.6, 1.0) * (axle === 0 ? 1 : rand(0.55, 0.85));
        for (let i = 0; i < len && aPos + i < N; i++) {
          clacks[aPos + i] += (random() * 2 - 1) * amp * Math.exp(-9 * (i / len));
        }
        // The heavier hits put a soft thump into the floor as well.
        if (chance(0.4)) {
          const thLen = Math.floor(SR * rand(0.05, 0.09));
          const f0 = rand(46, 64);
          let ph = 0;
          for (let i = 0; i < thLen && aPos + i < N; i++) {
            ph += (2 * Math.PI * f0) / SR;
            thumps[aPos + i] += Math.sin(ph) * Math.exp(-5.5 * (i / thLen)) * amp * 0.5;
          }
        }
      }
    }
    jPos += jointGapS * SR * rand(0.85, 1.15);
  }
  hp1(clacks, 1100);
  lp1(clacks, 2400 + clatter * 3800);
  lp1(thumps, 160);

  // The floor is rumble-led: the broadband bands sit *under* the body, or the
  // whole carriage reads as static instead of a rolling machine.
  const tractionW = 0.12 * (1 - speed * 0.75);
  const aeroW = 0.03 * speed * speed;
  const wheelW = (0.007 + speed * 0.028) * (0.5 + clatter * 0.8);
  // Build the continuous rolling floor in mono, then widen it; the joint
  // clatter spreads on its own (wider) so the carriage rolls around you, while
  // the underfloor thumps stay centred (low end is non-directional).
  const floor = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const humPh = (2 * Math.PI * humF * i) / SR;
    const hum = Math.sin(humPh) * 0.6 + Math.sin(2 * humPh + 0.8) * 0.3;
    floor[i] =
      body[i] * (0.36 + rumbleParam * 0.30) * sway[i] +
      rolling[i] * (0.05 + speed * 0.085) * roughness[i] +
      railMid[i] * (0.022 + speed * 0.03) +
      wheelTop[i] * wheelW * wheelDrift[i] +
      (traction[i] * 0.8 + hum * 0.18) * tractionW +
      aero[i] * aeroW;
  }
  const floorSt = decorrelateMono(floor, 13);
  const clackSt = decorrelateMono(clacks, 9);
  const left = new Float32Array(N);
  const right = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const thump = thumps[i] * (0.30 + rumbleParam * 0.25);
    left[i]  = floorSt.left[i]  + clackSt.left[i]  * 0.30 + thump;
    right[i] = floorSt.right[i] + clackSt.right[i] * 0.30 + thump;
  }
  return genStereo(left, right, 0.68);
}

// ── Sound regeneration ────────────────────────────────────────────────────

const generatorMap: Record<string, (params?: Record<string, number>) => string> = {
  rain: genRain,
  stream: genStream,
  ocean: genOcean,
  wind: genWind,
  thunder: genThunder,
  forest: genForest,
  fire: genFire,
  'white-noise': genWhite,
  'pink-noise': genPink,
  'brown-noise': genBrown,
  train: genTrain,
  fan: genFan,
  night: genSpace,
  underwater: genUnderwater,
  shower: genShower,
  airplane: genAirplane,
  birdsong: genBirdsong,
  heartbeat: genHeartbeat,
  purr: genPurr,
  chimes: genChimes,
  clock: genClock,
};

/** Regenerate a sound's WAV blob URL with the given tuning parameters. The PRNG
 *  is seeded from the sound id + params, so the same inputs always render the
 *  exact same loop (deterministic across reloads and in tests). */
export function regenerateSound(soundId: string, params: Record<string, number>): string | null {
  const generator = generatorMap[soundId];
  if (!generator) return null;
  seedRandom(hashSeed(`${soundId}:${JSON.stringify(params)}`));
  return generator(params);
}

function genUnderwater(params?: Record<string, number>): string {
  const { depth = 0.6, bubbles = 0.4, current = 0.5 } = params ?? {};
  const baseBuf = brownNoise();
  lp1(baseBuf, 180 + (1 - depth) * 320);
  lp1(baseBuf, 180 + (1 - depth) * 320);

  // "Current" is a slow swell of the deep rumble itself — not a midrange pink
  // wash, which read as static and doesn't belong underwater.
  const swellLfo = smoothRandomLfo(0.55, 1.25, 2.5, 7.0);
  const currentDepth = 0.25 + current * 0.5;

  // Bubbles rise at scattered positions across the field; pan each one.
  // Voiced per the bubble-acoustics model (docs/research/water-family-
  // synthesis.md): near-instant onset, exponential decay, and a pitch that
  // RISES through the decay — the up-chirp is what reads as water instead of
  // an electronic blip. Sizes follow a rough Minnaert spread: mostly small
  // and distant, with occasional low "glug" trains of 2–4 bubbles, each
  // smaller and higher than the last (air breaking up as it rises).
  const bubblesL = new Float32Array(N);
  const bubblesR = new Float32Array(N);
  const addBubble = (at: number, f0: number, amp: number, pan: number): void => {
    const tau = (0.045 + 28 / f0) * rand(0.8, 1.25);      // bigger rings longer
    const len = Math.min(Math.floor(SR * tau * 4), N - at);
    const attack = Math.floor(SR * 0.002);
    const pl = Math.cos((pan + 1) * Math.PI / 4);
    const pr = Math.sin((pan + 1) * Math.PI / 4);
    let ph = random() * 2 * Math.PI;
    for (let i = 0; i < len; i++) {
      const ts = i / SR;
      const env = (i < attack ? i / attack : 1) * Math.exp(-ts / tau);
      ph += (2 * Math.PI * f0 * (1 + 0.35 * (ts / tau))) / SR; // the up-chirp
      const s = Math.sin(ph) * env * amp;
      bubblesL[at + i] += s * pl;
      bubblesR[at + i] += s * pr;
    }
  };
  let pos = Math.floor(SR * 0.05);
  while (pos < N) {
    const pan = rand(-0.7, 0.7);
    if (chance(0.16)) {
      // A glug train: a large bubble breaking into smaller, higher ones.
      let f = rand(150, 260);
      let amp = rand(0.10, 0.17);
      let at = pos;
      const parts = 2 + Math.floor(random() * 3);
      for (let b = 0; b < parts && at < N; b++) {
        addBubble(at, f, amp, pan + rand(-0.1, 0.1));
        at += Math.floor(SR * rand(0.06, 0.16));
        f *= rand(1.25, 1.6);
        amp *= rand(0.55, 0.8);
      }
    } else {
      // A lone small bubble, heard through the water.
      addBubble(pos, rand(350, 1200), rand(0.02, 0.07), pan);
    }
    pos += Math.floor(SR * rand(0.08, 0.5) / (bubbles + 0.2));
  }
  hp1(bubblesL, 150); lp1(bubblesL, 1600);
  hp1(bubblesR, 150); lp1(bubblesR, 1600);

  // Deep body stays centred (low end is non-directional); the panned bubbles
  // carry the width. Dark final cutoff so no high-frequency hiss survives.
  const finalLp = 500 + (1 - depth) * 1400;
  const left = new Float32Array(N);
  const right = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const body = baseBuf[i] * 0.85 * (1 - currentDepth + currentDepth * swellLfo[i]);
    left[i]  = body + bubblesL[i] * 0.22;
    right[i] = body + bubblesR[i] * 0.22;
  }
  lp1(left, finalLp); lp1(right, finalLp);
  return genStereo(left, right, 0.6);
}

function genShower(params?: Record<string, number>): string {
  const { pressure = 0.6, steam = 0.3, room = 0.5 } = params ?? {};
  const spray = whiteNoise();
  hp1(spray, 200 + pressure * 200);
  lp1(spray, 6000 + pressure * 4000);
  const sprayLfo = smoothRandomLfo(0.85, 1.1, 0.8, 2.5);
  for (let i = 0; i < N; i++) spray[i] *= sprayLfo[i];

  const bodyBuf = pinkNoise();
  hp1(bodyBuf, 100);
  lp1(bodyBuf, 2000 + pressure * 1000);

  const steamBuf = whiteNoise();
  hp1(steamBuf, 4000 + steam * 2000);
  lp1(steamBuf, 12000);

  // Drop impacts: the patter of individual streams hitting the tub — the
  // "sound atoms" the rain research calls out (docs/research/
  // realistic-rain-design.md). A pure noise wash reads as a vent; the dense
  // but discrete impact layer is what says water striking a surface. Heavier
  // hits ring the basin faintly (a fast-damped low resonance).
  const patter = new Float32Array(N);
  const patterRate = 60 + pressure * 120; // impacts/sec
  let pPos = Math.floor(SR * 0.01);
  while (pPos < N) {
    const len = Math.floor(SR * rand(0.002, 0.006));
    const amp = rand(0.03, 0.12);
    for (let i = 0; i < len && pPos + i < N; i++) {
      patter[pPos + i] += (random() * 2 - 1) * amp * Math.exp(-6 * (i / len));
    }
    if (chance(0.05)) {
      // a heavier hit rings the tub
      const rf = rand(280, 520);
      const rl = Math.floor(SR * 0.03);
      let ph = random() * 2 * Math.PI;
      for (let i = 0; i < rl && pPos + i < N; i++) {
        ph += (2 * Math.PI * rf) / SR;
        patter[pPos + i] += Math.sin(ph) * Math.exp(-i / (SR * 0.008)) * amp * 0.8;
      }
    }
    pPos += Math.max(40, Math.floor(SR / patterRate * rand(0.5, 1.6)));
  }
  hp1(patter, 350);
  lp1(patter, 5200 + pressure * 2800);

  const preMix = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    preMix[i] = spray[i] * 0.42 + bodyBuf[i] * 0.33 + patter[i] * 0.5 + steamBuf[i] * (0.05 + steam * 0.1);
  }
  // Spray spreads wide; the room resonance gets a longer, roomier decorrelation
  // so the shower surrounds rather than sits in the centre.
  const roomRes = new Float32Array(preMix);
  bp2(roomRes, 400 + room * 400, 1 + room * 2);
  const spraySt = decorrelateMono(preMix, 11);
  const roomSt = decorrelateMono(roomRes, 19);
  const left = new Float32Array(N);
  const right = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    left[i]  = spraySt.left[i]  + roomSt.left[i]  * room * 0.15;
    right[i] = spraySt.right[i] + roomSt.right[i] * room * 0.15;
  }
  return genStereo(left, right, 0.65);
}

function genAirplane(params?: Record<string, number>): string {
  const { altitude = 0.5, cabin = 0.6, turbulence = 0.3 } = params ?? {};
  // Modeled on in-flight cabin measurements (DLR A320): a broadband engine
  // bed with a faint tonal scaffold underneath, the turbulent-boundary-layer
  // "airborne blanket" filling the 0.8–4 kHz mids, a secondary ventilation
  // bed, sub-80 Hz structural weight, and rough-air swells that arrive as
  // irregular events rather than a steady wobble.

  // 1. Engine bed: the broadband low-frequency body.
  const engine = brownNoise();
  hp1(engine, 28 + altitude * 14);
  lp1(engine, 230 + altitude * 110);
  lp1(engine, 420);
  const engDrift = smoothRandomLfo(0.88, 1.05, 3.0, 8.0);

  // 2. Faint engine orders, loop-locked, beating slowly under the bed.
  const f1 = lockFreq(88 + altitude * 38);
  const f2 = lockFreq(f1 * 2.02);
  const toneBeat = smoothRandomLfo(0.55, 1.0, 2.5, 7.0);

  // 3. Boundary-layer airflow: what makes a cabin feel airborne, not just
  //    mechanical. Rises and brightens with altitude (cruise speed).
  const airflow = pinkNoise();
  hp1(airflow, 550 + altitude * 450);
  lp1(airflow, 3200 + altitude * 1500);
  const airDrift = smoothRandomLfo(0.9, 1.06, 1.5, 5.0);

  // 4. Ventilation: secondary by design — measurements put HVAC well under
  //    the boundary-layer and jet contributions in cruise.
  const vents = pinkNoise();
  hp1(vents, 220);
  lp1(vents, 2600 + cabin * 1600);

  // 5. Structure: seat-rail and floor weight, felt more than heard.
  const structure = brownNoise();
  lp1(structure, 80);
  lp1(structure, 80);
  const structureSwell = smoothRandomLfo(0.7, 1.0, 4.0, 10.0);

  // 6. Rough air: shallow raised-cosine swells, seconds long and far apart,
  //    thickening the low end and slightly widening the mid-band hiss.
  const turbEnv = new Float32Array(N);
  let tPos = Math.floor(SR * rand(1, 6));
  while (tPos < N) {
    const dur = Math.floor(SR * rand(0.5, 2.8));
    const depth = rand(0.35, 1.0) * turbulence;
    for (let i = 0; i < dur && tPos + i < N; i++) {
      turbEnv[tPos + i] += depth * 0.5 * (1 - Math.cos(2 * Math.PI * (i / dur)));
    }
    tPos += dur + Math.floor(SR * rand(3, 6 + 20 * (1 - turbulence)));
  }

  const airW = 0.15 + altitude * 0.11;
  const ventW = 0.05 + cabin * 0.11;
  // The boundary-layer "airborne blanket" (airflow + vents) surrounds you, so it
  // widens; the engine body, structural weight, and engine-order tones are felt
  // in the body and stay centred.
  const centre = new Float32Array(N);
  const blanket = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const t = (2 * Math.PI * i) / SR;
    const tone = Math.sin(f1 * t) * 0.7 + Math.sin(f2 * t + 1.1) * 0.45;
    const turb = turbEnv[i];
    centre[i] =
      engine[i] * 0.30 * engDrift[i] * (1 + 0.7 * turb) +
      tone * 0.035 * toneBeat[i] +
      structure[i] * 0.16 * structureSwell[i] * (1 + 0.9 * turb);
    blanket[i] =
      airflow[i] * airW * airDrift[i] * (1 + 0.3 * turb) +
      vents[i] * ventW;
  }
  const wide = decorrelateMono(blanket, 12);
  const left = new Float32Array(N);
  const right = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    left[i]  = centre[i] + wide.left[i];
    right[i] = centre[i] + wide.right[i];
  }
  return genStereo(left, right, 0.66);
}

function genSpace(params?: Record<string, number>): string {
  // Night Insects: discrete tonal cricket/cicada bands that drift in and out.
  // High Q (15-28) keeps each band narrow and tonal — no broadband noise floor.
  const { void: voidParam = 0, cosmic = 0.4, pulse = 0.3 } = params ?? {};

  // Three insect-frequency bands: each independently gated so they feel like
  // distinct species rather than a single wash.
  const bandDefs = [
    { fc: 2600 + cosmic * 800,  q: 22 + cosmic * 8 },   // low cricket tone
    { fc: 4000 + cosmic * 1200, q: 18 + cosmic * 10 },  // mid chirp band
    { fc: 5800 + cosmic * 800,  q: 15 + cosmic * 8 },   // upper shimmer
  ];

  const depth = 0.12 + pulse * 0.20;
  // Each band gets its own slow gate so they fade independently
  const gate0 = smoothRandomLfo(0.0, 1.0, 1.6, 4.0);
  const gate1 = smoothRandomLfo(0.0, 1.0, 2.2, 5.5);
  const gate2 = smoothRandomLfo(0.0, 1.0, 1.8, 4.8);
  const gates = [gate0, gate1, gate2];

  const pulseLfo = smoothRandomLfo(1 - depth, 1.0, 1.2, 3.0);

  // Each insect band sits at its own place across the field, so the night
  // surrounds you rather than chirping from one point.
  const pans = [-0.55, 0.5, 0.1];
  const left = new Float32Array(N);
  const right = new Float32Array(N);
  for (let b = 0; b < bandDefs.length; b++) {
    const { fc, q } = bandDefs[b];
    const buf = whiteNoise();
    bp2(buf, fc, q);
    const g = gates[b];
    const gain = 0.10 * (0.5 + cosmic);
    const pl = Math.cos((pans[b] + 1) * Math.PI / 4);
    const pr = Math.sin((pans[b] + 1) * Math.PI / 4);
    for (let i = 0; i < N; i++) {
      const s = buf[i] * gain * g[i] * pulseLfo[i];
      left[i] += s * pl; right[i] += s * pr;
    }
  }

  if (voidParam > 0) {
    const voidBuf = brownNoise();
    lp1(voidBuf, 60 + voidParam * 40);
    lp1(voidBuf, 60 + voidParam * 40);
    for (let i = 0; i < N; i++) { left[i] += voidBuf[i] * voidParam * 0.6; right[i] += voidBuf[i] * voidParam * 0.6; }
  }
  return genStereo(left, right, 0.55);
}

function genHeartbeat(params?: Record<string, number>): string {
  // Heartbeat: the two heart sounds with real cardiac timing — S1 ("lub") at
  // the start of systole, a softer, slightly higher S2 ("dub") about a third
  // of the cycle later, then the long diastolic rest. Each sound is a soft
  // pressure thump whose pitch *falls* as it decays (a valve closing into
  // tissue, not a note), and no two beats land identically. `flow` gates a
  // circulatory rush to the cycle — raise it with the muffle and the beat
  // becomes the womb heard from inside.
  const { rate = 0.5, chest = 0.6, muffle = 0.5, flow = 0.15 } = params ?? {};
  const bpm = 50 + rate * 30;
  const interval = (SR * 60) / bpm;

  const buf = new Float32Array(N);
  const flowEnv = new Float32Array(N);

  const thump = (at: number, f0: number, durS: number, amp: number): void => {
    const len = Math.floor(SR * durS);
    let ph = random() * 2 * Math.PI;
    for (let i = 0; i < len && at + i < N; i++) {
      const p = i / len;
      // ~15 ms rise, then an exponential release.
      const env = p < 0.16 ? 0.5 - 0.5 * Math.cos(Math.PI * (p / 0.16)) : Math.exp(-3.2 * (p - 0.16));
      const f = f0 * (1.3 - 0.4 * Math.min(1, p * 1.2)); // pitch falls as it decays
      ph += (2 * Math.PI * f) / SR;
      const tissue = (random() * 2 - 1) * 0.22;
      buf[at + i] += (Math.sin(ph) + tissue) * env * amp;
    }
  };

  // Raised-cosine surge into the flow envelope.
  const surge = (at: number, durS: number, amp: number): void => {
    const len = Math.floor(SR * durS);
    for (let i = 0; i < len && at + i < N; i++) {
      flowEnv[at + i] += amp * 0.5 * (1 - Math.cos((2 * Math.PI * i) / len));
    }
  };

  const s1F = 36 + chest * 16;
  let beatAt = SR * 0.3;
  while (beatAt < N) {
    const s1 = Math.floor(beatAt);
    const s2 = Math.floor(beatAt + interval * 0.33 * rand(0.94, 1.06));
    const weight = 0.9 + random() * 0.2;
    thump(s1, s1F, 0.11, 0.30 * weight);
    thump(s2, s1F * 1.35, 0.075, 0.17 * weight);
    // Systolic ejection: the rush swells right after S1; a smaller return
    // follows S2.
    surge(s1 + Math.floor(SR * 0.02), (interval / SR) * 0.34, weight);
    surge(s2 + Math.floor(SR * 0.03), (interval / SR) * 0.22, 0.55 * weight);
    beatAt += interval * (1 + (random() - 0.5) * 0.045);
  }

  // The circulatory bed the beats sit in — silent-ish at low flow, the whole
  // point of the womb setting at high flow.
  const rush = brownNoise();
  hp1(rush, 40);
  lp1(rush, 330);
  const flowW = 0.04 + flow * 0.55;
  for (let i = 0; i < N; i++) buf[i] += rush[i] * (0.10 + flowEnv[i]) * flowW;

  // Chest floor, then the muffle: two poles — heard through a body, not
  // under a blanket.
  const bed = brownNoise();
  lp1(bed, 65);
  for (let i = 0; i < N; i++) buf[i] += bed[i] * 0.05;
  const cut = 900 - muffle * 620;
  lp1(buf, cut);
  lp1(buf, cut * 1.9);
  return gen(buf, 0.6);
}

function genPurr(params?: Record<string, number>): string {
  // Cat Purr: a ~25 Hz glottal pulse train that breathes. A real purr runs
  // through the whole respiratory cycle — a louder, slightly lower exhale, a
  // brief turnaround, then a softer, slightly higher inhale — and, crucially,
  // no two breaths are alike: the length, pitch, weight and exhale share all
  // wander a little, and the pitch settles as each exhale runs out. Breath
  // lengths are drawn per cycle and scaled to close the loop exactly.
  const { rate = 0.45, rumble = 0.6, softness = 0.55 } = params ?? {};

  // ~3.4 s per breath at the default (≈18 breaths/min — a settled, sleepy
  // cat). The first cut ran ~2.1 s (≈28/min), which reads as panting, and a
  // listener entrains to the breath rate — too fast is actively un-calming.
  const idealPeriod = 4.4 - 2.2 * rate;                    // seconds per breath
  const cycles = Math.max(1, Math.round(N / SR / idealPeriod));

  // Uneven breath lengths that sum exactly to the loop.
  const weights: number[] = [];
  let weightSum = 0;
  for (let c = 0; c < cycles; c++) { const w = 1 + (random() - 0.5) * 0.17; weights.push(w); weightSum += w; }
  const bounds: number[] = [0];
  let acc = 0;
  for (let c = 0; c < cycles; c++) { acc += (weights[c] / weightSum) * N; bounds.push(Math.min(N, Math.round(acc))); }
  bounds[cycles] = N;

  // Per-breath character.
  const f0Base = 21.5 + rumble * 4.5;
  const breathF0: number[] = [], breathLvl: number[] = [], exShare: number[] = [];
  for (let c = 0; c < cycles; c++) {
    breathF0.push(f0Base + (random() - 0.5) * 1.7);
    breathLvl.push(0.9 + random() * 0.16);
    exShare.push(0.52 + (random() - 0.5) * 0.07);
  }

  const GAP = 0.065, INHALE_END = 0.94;
  const ramp = (t: number, len: number, edge: number): number => {
    const w = Math.min(1, Math.min(t / edge, (len - t) / edge));
    return w <= 0 ? 0 : 0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, w));
  };

  // Per-sample envelope, pulse rate and breath-noise weight for the whole
  // loop, from the per-breath parameters.
  const envAmp = new Float32Array(N);
  const envF0 = new Float32Array(N);
  const envAir = new Float32Array(N);
  for (let c = 0; c < cycles; c++) {
    const b0 = bounds[c], len = bounds[c + 1] - b0;
    const ex = exShare[c], f0 = breathF0[c], lvl = breathLvl[c];
    for (let i = 0; i < len; i++) {
      const u = i / len;
      let amp = 0, f = f0, air = 1;
      if (u < ex) {
        amp = lvl * ramp(u, ex, 0.10);
        f = f0 * (1.035 - 0.055 * (u / ex));   // settles as the exhale empties
      } else if (u >= ex + GAP && u < INHALE_END) {
        amp = 0.62 * lvl * ramp(u - ex - GAP, INHALE_END - ex - GAP, 0.11);
        f = f0 + 3.5;
        air = 1.5;                              // breath reads on the intake
      }
      envAmp[b0 + i] = amp;
      envF0[b0 + i] = f;
      envAir[b0 + i] = amp * air;
    }
  }

  // A slow, unsynchronised sway under everything — the cat shifting its
  // weight, not a machine holding a level.
  const sway = smoothRandomLfo(0.93, 1.07, 0.9, 2.8);

  const buf = new Float32Array(N);
  // Body resonances the pulses ring: chest (~85–145 Hz) plus a softer throat
  // partial. Each glottal pulse drops one short damped grain into the buffer.
  const bodyF = 82 + rumble * 62;
  const throatF = bodyF * 2.3;
  const grainLen = Math.floor(SR * 0.032);
  const attack = Math.floor(SR * 0.0025);      // eased onset — no broadband click
  let t = 0;
  while (t < N) {
    const amp = envAmp[t];
    if (amp <= 0.001) { t += Math.floor(SR * 0.004); continue; }
    const jitter = 1 + (random() - 0.5) * 0.09;
    const level = amp * (0.82 + random() * 0.36) * sway[t];
    for (let i = 0; i < grainLen && t + i < N; i++) {
      const ts = i / SR;
      const body = Math.sin(2 * Math.PI * bodyF * ts) * Math.exp(-ts / 0.009);
      const throat = Math.sin(2 * Math.PI * throatF * ts) * Math.exp(-ts / 0.0042) * 0.38;
      const on = i < attack ? 0.5 - 0.5 * Math.cos(Math.PI * (i / attack)) : 1;
      buf[t + i] += (body + throat) * level * on * 0.5;
    }
    t += Math.max(8, Math.floor((SR / envF0[t]) * jitter));
  }

  // Breath noise: a faint band of air that follows the envelope (a touch more
  // on the inhale), so the purr sits inside breathing rather than a dry buzz.
  const breath = pinkNoise();
  hp1(breath, 280);
  lp1(breath, 1100);
  for (let i = 0; i < N; i++) buf[i] += breath[i] * envAir[i] * sway[i] * 0.055;

  // Chest warmth under it all, then the muffle: softness closes the top like
  // a cat settled against you rather than mic'd up close.
  const bed = brownNoise();
  lp1(bed, 55);
  for (let i = 0; i < N; i++) buf[i] += bed[i] * 0.05;
  // Two passes (12 dB/oct): one pole leaves enough pulse edge to rasp.
  const muffle = 980 - softness * 620;
  lp1(buf, muffle);
  lp1(buf, muffle * 1.8);
  return gen(buf, 0.62);
}

function genChimes(params?: Record<string, number>): string {
  // Wind Chimes: five low pentatonic tubes (A3–F#4 — deep porch chimes, not
  // bright bells) struck in gust-driven clusters. Each strike rings the first
  // four transverse modes of a free tube (1 : 2.76 : 5.40 : 8.93) with the
  // higher modes dying faster, and each tube hangs at its own point in the
  // stereo field. Between gusts the chimes genuinely rest — the silences are
  // as much the character as the notes: true quiet, no noise bed under them.
  const { activity = 0.42, tone = 0.45, sustain = 0.5 } = params ?? {};

  const notes = [220.0, 246.94, 277.18, 329.63, 369.99]; // A pentatonic
  const pans = [-0.6, -0.28, 0, 0.28, 0.6];
  const RATIOS = [1, 2.76, 5.40, 8.93];
  const modeAmps = [1, 0.22 + 0.38 * tone, 0.05 + 0.20 * tone, 0.02 + 0.09 * tone];

  const left = new Float32Array(N);
  const right = new Float32Array(N);
  const gust = smoothRandomLfo(0, 1, 2.8, 7.5);

  const strike = (pos: number, tube: number, amp: number): void => {
    const f = notes[tube] * (1 + (random() - 0.5) * 0.005);
    // Fundamental ring time; `sustain` swings it from damped (~½) to long (~1.45×).
    const tau1 = (2.6 * Math.pow(300 / f, 0.6) + 0.4) * (0.55 + sustain * 0.9);
    const taus = [tau1, tau1 * 0.32, tau1 * 0.14, tau1 * 0.07];
    const len = Math.min(Math.floor(SR * tau1 * 4), N - pos);
    const pl = Math.cos((pans[tube] + 1) * Math.PI / 4);
    const pr = Math.sin((pans[tube] + 1) * Math.PI / 4);
    const attack = Math.floor(SR * 0.004);
    // Each mode is a damped resonator run as a two-tap recurrence
    // (y[n] = 2r·cos(w)·y[n-1] − r²·y[n-2] ≡ rⁿ·sin(wn)) — the strikes are the
    // whole render cost, and sin·exp per sample per mode is ~10× slower.
    const co = new Float64Array(4), r2 = new Float64Array(4);
    const y1 = new Float64Array(4), y2 = new Float64Array(4);
    for (let m = 0; m < 4; m++) {
      const w = (2 * Math.PI * f * RATIOS[m]) / SR;
      const r = Math.exp(-1 / (taus[m] * SR));
      co[m] = 2 * r * Math.cos(w);
      r2[m] = r * r;
      y1[m] = r * Math.sin(w); // y[1]; y[0] = 0 keeps the onset clickless
      y2[m] = 0;
    }
    for (let i = 1; i < len; i++) {
      let s = 0;
      for (let m = 0; m < 4; m++) {
        s += y1[m] * modeAmps[m];
        const nxt = co[m] * y1[m] - r2[m] * y2[m];
        y2[m] = y1[m];
        y1[m] = nxt;
      }
      if (i < attack) s *= 0.5 - 0.5 * Math.cos(Math.PI * (i / attack));
      s *= amp * 0.30;
      left[pos + i] += s * pl;
      right[pos + i] += s * pr;
    }
  };

  // Gust-driven scheduling: strike probability rides the square of the gust
  // level (calm air is truly quiet), and a strike often swings the clapper on
  // into a neighbouring tube — that little melodic stumble is what separates
  // chimes from a sequencer. Nothing new fires in the last beat of the loop,
  // so the seam only ever crossfades ring tails.
  const hop = Math.floor(SR * 0.02);
  const lastStart = N - Math.floor(SR * 0.7);
  const ratePerSec = 0.12 + activity * 1.45;
  // A lull is part of the character, but a loop can't go dead for ten straight
  // seconds — when the wind has been quiet too long, one soft lone strike
  // bridges it (a real set stirs eventually).
  let sinceStrike = 0;
  let maxLull = Math.floor(SR * rand(3.5, 6.5));
  for (let p = Math.floor(SR * 0.3); p < lastStart; p += hop) {
    const g = gust[p];
    const forced = sinceStrike > maxLull;
    if (!forced && !chance((hop / SR) * ratePerSec * g * g)) { sinceStrike += hop; continue; }
    sinceStrike = 0;
    maxLull = Math.floor(SR * rand(3.5, 6.5));
    let tube = Math.floor(random() * 5);
    let pos = p;
    let amp = forced ? rand(0.25, 0.45) : rand(0.35, 1.0) * (0.55 + 0.45 * g);
    strike(pos, tube, amp);
    if (forced) continue; // a lone stir, not a cluster
    let swings = 0;
    while (swings < 3 && chance(0.55)) {
      pos += Math.floor(SR * rand(0.07, 0.3));
      if (pos >= lastStart) break;
      tube = Math.max(0, Math.min(4, tube + (chance(0.5) ? -1 : 1)));
      amp *= rand(0.6, 0.9);
      strike(pos, tube, amp);
      swings++;
    }
  }

  return genStereo(left, right, 0.52);
}

function genClock(params?: Record<string, number>): string {
  // Ticking Clock: the bare mechanism IS the sound. The base render is the
  // naked escapement click — crisp ring + a breath of contact noise + the
  // tiny secondary contact, true silence between beats — which is the
  // character listeners actually pick when given the sliders. So the sliders
  // don't bury it under case knocks and room tone any more; they vary real
  // qualities of the mechanism instead:
  //   pace       — the beat, a slow 2 s pendulum through the 1 s default to a
  //                quick ½ s pocket-watch tick (snapped to an even count per
  //                loop so the tick/tock alternation survives the seam)
  //   contrast   — how differently the two escapement faces are voiced
  //                (0 = one even tick, 1 = strongly two-toned)
  //   brightness — the click's tone, darker to glassier
  const { pace = 0.5, contrast = 0.5, brightness = 0.5 } = params ?? {};

  const interval = 2.0 * Math.pow(4, -pace);   // seconds per beat
  const beats = Math.max(2, 2 * Math.round(N / SR / (2 * interval)));
  const step = N / beats;                       // samples per beat (even count)

  const tickF = 1400 + brightness * 1700;
  const tockF = tickF * (1 - 0.42 * contrast);
  const tockLevel = 1 - 0.30 * contrast;

  const buf = new Float32Array(N);
  for (let k = 0; k < beats; k++) {
    const isTick = k % 2 === 0;
    const at = Math.floor((k + 0.25) * step + rand(-0.002, 0.002) * SR);
    const f = isTick ? tickF : tockF;
    const level = (isTick ? 1 : tockLevel) * (0.92 + random() * 0.16);

    // The click: a short damped ring plus a breath of contact noise.
    const clickLen = Math.floor(SR * 0.012);
    for (let i = 0; i < clickLen && at + i < N; i++) {
      const ts = i / SR;
      const ring = Math.sin(2 * Math.PI * f * ts) * Math.exp(-ts / 0.0030);
      const noise = (random() * 2 - 1) * Math.exp(-ts / 0.0020) * 0.5;
      buf[at + i] += (ring + noise) * level * 0.5;
    }
    // The escapement's tiny secondary contact right behind the beat.
    const echoAt = at + Math.floor(SR * 0.011);
    const echoLen = Math.floor(SR * 0.006);
    for (let i = 0; i < echoLen && echoAt + i < N; i++) {
      const ts = i / SR;
      buf[echoAt + i] += (random() * 2 - 1) * Math.exp(-ts / 0.0016) * level * 0.14;
    }
  }

  // Only the gentle top-safety the bare voicing always had — no distance
  // muffle, no room-tone floor.
  lp1(buf, 5200);
  lp1(buf, 9000);
  return gen(buf, 0.5);
}
