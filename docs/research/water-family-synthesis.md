# Water-family synthesis notes (underwater, stream, shower)

Working notes for the 9.3.x pass, grounding the water-family generators in the
bubble-acoustics literature.

## The one model that matters: resonating bubbles

Essentially all liquid sound is acoustic emission from **entrained air
bubbles** (Minnaert 1933; van den Doel, *Physically Based Models for Liquid
Sounds*, ACM TAP 2005). The practical synthesis recipe validated by that line
of work (and its successors in graphics: Zheng & James; Langlois et al.;
coupled-bubble models up to SIGGRAPH 2023):

- A single bubble is a **damped sinusoid**: near-instant onset, exponential
  decay, and — the signature detail — a **pitch that rises** as the bubble
  changes shape and nears the surface. A symmetric "boop" envelope or a flat
  pitch reads as electronic; the up-chirp reads as water.
- The resonant frequency is the **Minnaert frequency**, f ≈ 3.26/r (Hz·m):
  ~3 mm bubble ≈ 1 kHz, big "glug" bubbles are 150–300 Hz. Decay time grows
  with bubble size (small bubbles: a few ms; a glug can ring ~100 ms).
- Complex water sounds (streams, pouring, rain on water, surf) are a
  **stochastic population** of these single-bubble events, with the size
  distribution and event rate defining the character. Distance/immersion
  reads as a lowpass: "the indistinct murmur of a faraway brook versus the
  bright babbling of one up close" (Sounding Liquids, UNC).
- Bubble *clouds* additionally emit **low-frequency collective oscillations**
  (coupled-bubble effect) — the low whoosh under a plunge or heavy stream.

## Per sound

- **Underwater**: hydrophone perspective — a deep pressure bed (brown,
  double-lowpassed), slow current swell, and a sparse bubble population heard
  *through* the water (dark lowpass). Bubbles: mostly small/distant, with
  occasional low glug **trains** (2–4 bubbles, each smaller/higher than the
  last — air breaking up as it rises).
- **Stream**: the babble is a dense mid-band bubble population (400 Hz–2 kHz)
  over a broadband flow bed; "sparkle" is the small-bubble end, "depth" is
  the collective low band. Individual bubble events (with the up-chirp) are
  what separate a brook from filtered noise.
- **Shower**: dense drop impacts on a hard surface (a rain-like impact
  texture, not bubbles) + spray hiss + small-room reflection; the enclosure
  (bright, reflective, close) is what says "shower" rather than "rain".

Sources:
- [Physically based models for liquid sounds (van den Doel, ACM TAP)](https://dl.acm.org/doi/abs/10.1145/1101530.1101554)
- [Sounding Liquids: Automatic Sound Synthesis from Fluid Simulation (UNC)](http://gamma.cs.unc.edu/SoundingLiquids/soundingliquids.pdf)
- [Improved Water Sound Synthesis using Coupled Bubbles (ACM TOG 2023)](https://dl.acm.org/doi/10.1145/3592424)
- [Toward animating water with complex acoustic bubbles (ACM TOG)](https://dl.acm.org/doi/10.1145/2897824.2925904)
- [Sound Synthesis, Propagation, and Rendering: A Survey (arXiv)](https://arxiv.org/pdf/2011.05538)
