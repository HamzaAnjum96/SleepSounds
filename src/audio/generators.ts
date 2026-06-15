// drift away — procedural sound generators. Each builds a loop-conditioned
// 32s WAV from the shared DSP helpers; regenerateSound() re-renders a sound
// with new tuning params (used by the editor's WAV-backed sounds).

import {
  SR, N, gen, lp1, hp1, bp2, smoothRandomLfo, rand, lockFreq, chance, whiteNoise, brownNoise, pinkNoise,
  random, seedRandom, hashSeed,
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

  const air = whiteNoise();
  hp1(air, 2400);
  lp1(air, 10800);

  const drift = smoothRandomLfo(0.9, 1.1, 1.2, 3.8);
  const mix = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const shimmer = 1 - shimmerDepth + shimmerDepth * Math.sin((2 * Math.PI * 0.065 * i) / SR);
    mix[i] = body[i] * (1 - airMix) * drift[i] + air[i] * airMix * shimmer;
  }
  return gen(mix, 0.62);
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
  return gen(buf, 0.65);
}

function genFan(params?: Record<string, number>): string {
  const { speed = 0.1, hum: humParam = 0.4, airflow: airflowParam = 0.6, size = 0.2 } = params ?? {};

  // size=0: small bedroom fan (soft, warm, muffled)
  // size=1: large industrial fan (harsh, bright, buzzy)

  // Blade-pass frequency: home fans 800–2400 RPM × 3–5 blades → 40–200 Hz;
  // size pushes further into industrial territory.
  const bpfBase = 50 + speed * 70 + size * 110;  // 50–230 Hz
  const bpf  = lockFreq(bpfBase);
  const bpf2 = lockFreq(bpfBase * 2);
  const bpf3 = lockFreq(bpfBase * 3);

  // Motor hum: AC mains (60 Hz) + second harmonic
  const motorF  = lockFreq(60);
  const motorF2 = lockFreq(120);

  // Airflow: home fans are warm and muffled; size brightens the band
  const airLp = 2200 + size * 1800 + speed * 500;  // 2200–4500 Hz
  const airflowBuf = pinkNoise();
  hp1(airflowBuf, 100 + speed * 80);
  lp1(airflowBuf, airLp);

  // Grill/edge hiss: barely audible on a home fan, grows with size
  const hissBuf = whiteNoise();
  hp1(hissBuf, 2400 + size * 1200);
  lp1(hissBuf, 7000);

  // Slow breathing LFO + subtle phase jitter on blade tones
  const breathLfo   = smoothRandomLfo(0.90, 1.0, 2.0, 6.0);
  const phaseJitter = smoothRandomLfo(-0.04, 0.04, 0.4, 1.8);

  // Harmonic richness scales with size: home fans have soft, rolled-off partials
  const h2amp = 0.15 + size * 0.32;
  const h3amp = 0.05 + size * 0.18;

  const airW   = 0.55 + airflowParam * 0.35;
  const hissW  = (0.005 + size * 0.042) * (0.6 + speed * 0.4);
  const bladeW = humParam * (0.018 + size * 0.056);
  const motorW = humParam * (0.012 + size * 0.010);

  const mix = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const t      = (2 * Math.PI * i) / SR;
    const jitter = phaseJitter[i];

    const blade = Math.sin(bpf  * t + jitter)       * 1.00
                + Math.sin(bpf2 * t + jitter * 1.7) * h2amp
                + Math.sin(bpf3 * t + jitter * 2.4) * h3amp;

    const motor = Math.sin(motorF * t) * 0.70 + Math.sin(motorF2 * t + 1.1) * 0.30;

    mix[i] = airflowBuf[i] * airW * breathLfo[i]
           + hissBuf[i]    * hissW
           + blade * bladeW
           + motor * motorW;
  }

  // Soft final rolloff for home-fan character: large fans are naturally brighter
  lp1(mix, 2600 + size * 5000);

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
  return gen(mix, 0.64);
}

function genRain(params?: Record<string, number>): string {
  const { intensity = 0.65, heaviness = 0.5, surface = 0.5, swell = 0.15 } = params ?? {};
  const gapScale = 0.3 + (1 - intensity) * 1.4;
  const bedHp = 120 + (1 - heaviness) * 120;
  const bedLp = 2800 + (1 - heaviness) * 5600;
  const bubbleChance = 0.22 + surface * 0.4;
  const pingChance = 0.35 + surface * 0.4;
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
        const pingF  = rand(700, 1800);
        const pingLen = Math.floor(SR * rand(0.003, 0.008));
        const pingAmp = amp * rand(0.25, 0.45);
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
  hp1(impacts, 1400); lp1(impacts, 9000);
  hp1(bubbles, 420); lp1(bubbles, 4200);
  const mix = new Float32Array(N);
  // One full swell cycle per loop, so the shower rises and eases without a
  // seam (sin is 0 at both ends). Mild by default, deeper as swell climbs.
  const swellDepth = swell * 0.6;
  for (let i = 0; i < N; i++) {
    const s = 1 + swellDepth * Math.sin((2 * Math.PI * i) / N);
    mix[i] = (bed[i] * 0.80 + impacts[i] * 0.12 + bubbles[i] * 0.08) * s;
  }
  return gen(mix, 0.7);
}

function genOcean(params?: Record<string, number>): string {
  const { waveSize = 0.55, foam = 0.5, depth = 0.5 } = params ?? {};
  const waveMin = 5 + waveSize * 5;
  const waveMax = 10 + waveSize * 10;
  const surfLp = 1200 + foam * 1600;
  const surfMix = 0.2 + foam * 0.36;
  const baseLp = 240 + depth * 240;
  const baseMix = 0.4 + depth * 0.44;
  // Ocean shoreline: undertow body + cresting surf that blooms on each wave
  const base = brownNoise();
  lp1(base, baseLp); lp1(base, baseLp * 0.75);

  const surf = pinkNoise();
  hp1(surf, 220);
  lp1(surf, surfLp);

  // Waves are fitted to the loop: pick whole periods, then scale them so the
  // final wave completes exactly at the buffer edge. The old version truncated
  // the last wave mid-crest, which made the loop seam lurch (sharp stop/start)
  // before settling back into the rhythm.
  const periods: number[] = [];
  let totalLen = 0;
  while (totalLen < N) {
    const p = Math.floor(SR * rand(waveMin, waveMax));
    periods.push(p);
    totalLen += p;
  }
  const fit = N / totalLen;
  const waveEnvBuf = new Float32Array(N);
  let wPos = 0;
  for (const raw of periods) {
    const period = Math.max(1, Math.round(raw * fit));
    const wAmp   = rand(0.45, 1.0);
    for (let i = 0; i < period && wPos + i < N; i++) {
      const p = i / period;
      let env: number;
      if (p < 0.38) env = Math.pow(p / 0.38, 1.6) * wAmp;
      else if (p < 0.52) env = wAmp;
      else env = Math.pow((1 - p) / 0.48, 0.75) * wAmp;
      waveEnvBuf[wPos + i] += env;
    }
    wPos += period;
  }

  const mix = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const wEnv  = Math.min(1, waveEnvBuf[i]);
    const wBase = 0.24 + 0.76 * wEnv;
    const wSurf = 0.08 + 0.92 * Math.pow(wEnv, 1.8);
    mix[i] = base[i] * wBase * baseMix + surf[i] * wSurf * surfMix;
  }
  return gen(mix, 0.72);
}

function genWind(params?: Record<string, number>): string {
  const { gusts = 0.5, whistle = 0.3, tone = 0.5 } = params ?? {};
  const gustDepth = 0.2 + gusts * 0.6;
  const whistleMixLevel = whistle * 0.28;
  const bodyLp = 600 + tone * 800;
  // Wind: gust-driven turbulence with drifting resonant edge tones
  const buf = pinkNoise();
  hp1(buf, 90);
  lp1(buf, bodyLp + 400); lp1(buf, bodyLp);
  const drift = smoothRandomLfo(0.84, 1.14, 1.8, 5.2);
  for (let i = 0; i < N; i++) {
    const g1 = (1 - gustDepth) + gustDepth * Math.abs(Math.sin((2 * Math.PI * 0.038 * i) / SR));
    const g2 = 0.72 + 0.28 * Math.sin((2 * Math.PI * 0.11 * i) / SR + 1.3);
    const g3 = 0.88 + 0.12 * Math.sin((2 * Math.PI * 0.23 * i) / SR + 0.6);
    buf[i] *= g1 * g2 * g3 * drift[i];
  }
  const whistleStrips = [
    { fc: 360,  q: 4.0 },
    { fc: 620,  q: 4.5 },
    { fc: 960,  q: 4.2 },
    { fc: 1380, q: 5.0 },
  ];
  const whistleBuf = new Float32Array(N);
  for (const s of whistleStrips) {
    const stripNoise = whiteNoise();
    bp2(stripNoise, s.fc, s.q);
    const stripLfo = smoothRandomLfo(0.0, 1.0, 1.4, 5.5);
    for (let i = 0; i < N; i++) whistleBuf[i] += stripNoise[i] * stripLfo[i] * 0.25;
  }
  const mix = new Float32Array(N);
  for (let i = 0; i < N; i++) mix[i] = buf[i] * (1 - whistleMixLevel) + whistleBuf[i] * whistleMixLevel;
  return gen(mix, 0.68);
}

function genFire(): string {
  // Fire: deep turbulent roar + flame body + hiss + ember + whoosh +
  //       crackle bursts + spit crackles + pops + log shifts

  // ── 1. Deep roar body: brown rumble + pink mid-roar, independently modulated ──
  const roar = brownNoise();
  hp1(roar, 40);
  lp1(roar, 600);

  const body = pinkNoise();
  hp1(body, 100);
  lp1(body, 1200);

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
    const burstIntensity = rand(0.08, 0.28);
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
      cPos += Math.floor(SR * rand(0.003, 0.04));
    }
    pos = burstEnd + Math.floor(SR * rand(0.3, 1.8));
  }
  hp1(crackles, 800);
  lp1(crackles, 7000);

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
    const amp = rand(0.15, 0.40);
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
  // Crackles and pops are the dominant character; roar/body are background texture.
  const mix = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const breath = breathA[i] * breathB[i]; // compound modulation
    mix[i] =
      roar[i]       * 0.18 * breathA[i] +
      body[i]       * 0.16 * breath +
      hiss[i]       * 0.025 * breath +
      ember[i]      * 0.012 * emberLfo[i] +
      whoosh[i]     * 0.035 * breath +
      crackles[i]   * 0.30 +
      spits[i]      * 0.12 +
      pops[i]       * 0.14 +
      logShifts[i]  * 0.04;
  }
  return gen(mix, 0.96);  // +1.5x headroom (default volume lowered to match)
}

function genBirdsong(): string {
  // Birdsong: varied bird calls without ambience bed.

  // ── 1. Bird calls: short melodic chirps at varied pitches ──
  const calls = new Float32Array(N);
  let callPos = Math.floor(SR * rand(0.3, 1.2));
  while (callPos < N) {
    // Each bird call is a series of 2–6 chirps
    const numChirps = Math.floor(rand(2, 7));
    const baseFreq = rand(1800, 4200);
    const chirpGap = rand(0.06, 0.14);
    const callAmp = rand(0.08, 0.25);

    let chirpPos = callPos;
    for (let c = 0; c < numChirps && chirpPos < N; c++) {
      const chirpLen = Math.floor(SR * rand(0.03, 0.09));
      const freq = baseFreq * rand(0.85, 1.25);
      const freqEnd = freq * rand(0.7, 1.4); // pitch glide
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

    // Gap between bird calls: 0.8–4.0 seconds
    callPos = chirpPos + Math.floor(SR * rand(0.8, 4.0));
  }
  hp1(calls, 1200);
  lp1(calls, 8000);

  // ── 2. Trills: rapid warbling sequences ──
  const trills = new Float32Array(N);
  let trillPos = Math.floor(SR * rand(1.5, 4.0));
  while (trillPos < N) {
    const trillLen = Math.floor(SR * rand(0.3, 0.8));
    const trillFreq = rand(2400, 5000);
    const trillRate = rand(18, 35); // warble rate in Hz
    const trillAmp = rand(0.06, 0.16);
    let ph = 0;
    for (let i = 0; i < trillLen && trillPos + i < N; i++) {
      const p = i / trillLen;
      // Fade in/out envelope
      const env = Math.sin(Math.PI * p) * trillAmp;
      // Frequency modulation for warble effect
      const fMod = trillFreq + Math.sin(2 * Math.PI * trillRate * (i / SR)) * trillFreq * 0.15;
      ph += (2 * Math.PI * fMod) / SR;
      trills[trillPos + i] += Math.sin(ph) * env;
    }
    trillPos += trillLen + Math.floor(SR * rand(2.5, 8.0));
  }
  hp1(trills, 1800);
  lp1(trills, 9000);

  // ── 3. Distant soft peeps: very quiet background birds ──
  const peeps = new Float32Array(N);
  let peepPos = Math.floor(SR * rand(0.5, 2.0));
  while (peepPos < N) {
    const peepLen = Math.floor(SR * rand(0.015, 0.04));
    const peepFreq = rand(3000, 6000);
    const peepAmp = rand(0.02, 0.06);
    let ph = 0;
    for (let i = 0; i < peepLen && peepPos + i < N; i++) {
      const p = i / peepLen;
      const env = Math.sin(Math.PI * p) * peepAmp;
      ph += (2 * Math.PI * peepFreq) / SR;
      peeps[peepPos + i] += Math.sin(ph) * env;
    }
    peepPos += Math.floor(SR * rand(0.3, 1.8));
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
  const mix = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const rippleEnv = Math.pow(Math.max(0, flowLfo[i]), 1.8);
    mix[i] = bed[i] * (1 - rippleMix) * flowLfo[i] + ripples[i] * rippleMix * rippleEnv;
  }
  return gen(mix, 0.66);
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
  lp1(rolling, 1100 + speed * 1500);
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

  const tractionW = 0.12 * (1 - speed * 0.75);
  const aeroW = 0.05 * speed * speed;
  const wheelW = (0.015 + speed * 0.05) * (0.5 + clatter * 0.8);
  const mix = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const humPh = (2 * Math.PI * humF * i) / SR;
    const hum = Math.sin(humPh) * 0.6 + Math.sin(2 * humPh + 0.8) * 0.3;
    mix[i] =
      body[i] * (0.30 + rumbleParam * 0.26) * sway[i] +
      rolling[i] * (0.09 + speed * 0.15) * roughness[i] +
      railMid[i] * (0.04 + speed * 0.05) +
      wheelTop[i] * wheelW * wheelDrift[i] +
      (traction[i] * 0.8 + hum * 0.18) * tractionW +
      aero[i] * aeroW +
      clacks[i] * 0.30 +
      thumps[i] * (0.30 + rumbleParam * 0.25);
  }
  return gen(mix, 0.68);
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

  const bubblesBuf = new Float32Array(N);
  let pos = Math.floor(SR * 0.05);
  while (pos < N) {
    const bFreq = rand(200, 800);
    const bLen = Math.floor(SR * rand(0.008, 0.030));
    const bAmp = rand(0.02, 0.08);
    let ph = 0;
    for (let i = 0; i < bLen && pos + i < N; i++) {
      const p = i / Math.max(1, bLen);
      const env = Math.sin(Math.PI * p);
      const f = bFreq + bFreq * 0.3 * p; // pitch rise
      ph += (2 * Math.PI * f) / SR;
      bubblesBuf[pos + i] += Math.sin(ph) * env * bAmp;
    }
    pos += Math.floor(SR * rand(0.05, 0.4) / (bubbles + 0.2));
  }
  hp1(bubblesBuf, 150);
  lp1(bubblesBuf, 1600);

  // Dark final cutoff so no high-frequency hiss survives.
  const finalLp = 500 + (1 - depth) * 1400;
  const mix = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const swell = 1 - currentDepth + currentDepth * swellLfo[i];
    mix[i] = baseBuf[i] * 0.85 * swell + bubblesBuf[i] * 0.22;
  }
  lp1(mix, finalLp);
  return gen(mix, 0.6);
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

  const preMix = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    preMix[i] = spray[i] * 0.5 + bodyBuf[i] * 0.35 + steamBuf[i] * (0.05 + steam * 0.1);
  }
  // Room resonance
  const roomRes = new Float32Array(preMix);
  bp2(roomRes, 400 + room * 400, 1 + room * 2);
  for (let i = 0; i < N; i++) preMix[i] += roomRes[i] * room * 0.15;
  return gen(preMix, 0.65);
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
  const mix = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const t = (2 * Math.PI * i) / SR;
    const tone = Math.sin(f1 * t) * 0.7 + Math.sin(f2 * t + 1.1) * 0.45;
    const turb = turbEnv[i];
    mix[i] =
      engine[i] * 0.30 * engDrift[i] * (1 + 0.7 * turb) +
      tone * 0.035 * toneBeat[i] +
      airflow[i] * airW * airDrift[i] * (1 + 0.3 * turb) +
      vents[i] * ventW +
      structure[i] * 0.16 * structureSwell[i] * (1 + 0.9 * turb);
  }
  return gen(mix, 0.66);
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

  const mix = new Float32Array(N);
  for (let b = 0; b < bandDefs.length; b++) {
    const { fc, q } = bandDefs[b];
    const buf = whiteNoise();
    bp2(buf, fc, q);
    const g = gates[b];
    const gain = 0.10 * (0.5 + cosmic);
    for (let i = 0; i < N; i++) mix[i] += buf[i] * gain * g[i] * pulseLfo[i];
  }

  if (voidParam > 0) {
    const voidBuf = brownNoise();
    lp1(voidBuf, 60 + voidParam * 40);
    lp1(voidBuf, 60 + voidParam * 40);
    for (let i = 0; i < N; i++) mix[i] += voidBuf[i] * voidParam * 0.6;
  }
  return gen(mix, 0.55);
}

function genHeartbeat(params?: Record<string, number>): string {
  const { rate = 0.5, chest = 0.6, muffle = 0.5 } = params ?? {};
  const bpm = 52 + rate * 28;
  const beatInterval = Math.floor(SR * 60 / bpm);
  const lubFreq = 40 + chest * 20;
  const dubFreq = 50 + chest * 25;
  const noiseLp = 100 + chest * 80;
  const finalLp = 200 + (1 - muffle) * 600;

  const beats = new Float32Array(N);
  let beatPos = Math.floor(SR * 0.5);
  while (beatPos < N) {
    // Lub
    const lubLen = Math.floor(SR * rand(0.08, 0.12));
    for (let i = 0; i < lubLen && beatPos + i < N; i++) {
      const p = i / lubLen;
      const env = Math.sin(Math.PI * p);
      const noise = (random() * 2 - 1) * 0.3;
      beats[beatPos + i] += (Math.sin(2 * Math.PI * lubFreq * (i / SR)) * 0.7 + noise) * env * 0.25;
    }
    // Dub (offset ~200ms)
    const dubOffset = Math.floor(SR * 0.2);
    const dubLen = Math.floor(SR * rand(0.06, 0.09));
    const dubPos = beatPos + dubOffset;
    for (let i = 0; i < dubLen && dubPos + i < N; i++) {
      const p = i / dubLen;
      const env = Math.sin(Math.PI * p);
      const noise = (random() * 2 - 1) * 0.3;
      beats[dubPos + i] += (Math.sin(2 * Math.PI * dubFreq * (i / SR)) * 0.7 + noise) * env * 0.25 * 0.6;
    }
    // Add brown noise burst for realism at beat position
    const burstLen = Math.floor(SR * 0.15);
    for (let i = 0; i < burstLen && beatPos + i < N; i++) {
      const p = i / burstLen;
      const env = Math.exp(-5 * p);
      beats[beatPos + i] += (random() * 2 - 1) * 0.04 * env;
    }
    // Slight timing jitter
    const jitter = Math.floor(rand(-0.01, 0.01) * beatInterval);
    beatPos += beatInterval + jitter;
  }
  lp1(beats, noiseLp);

  // Gentle bed
  const bed = brownNoise();
  lp1(bed, 80);

  const mix = new Float32Array(N);
  for (let i = 0; i < N; i++) mix[i] = beats[i] + bed[i] * 0.05;
  lp1(mix, finalLp);
  return gen(mix, 0.6);
}

export {
  genForest, genWhite, genBrown, genFan, genPink, genRain, genOcean, genWind, genFire, genBirdsong, genStream, genThunder, genTrain, genUnderwater, genShower, genAirplane, genSpace, genHeartbeat,
};
