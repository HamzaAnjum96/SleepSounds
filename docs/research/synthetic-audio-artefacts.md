# Improving Robotic and White‑Noise Artefacts in Synthetic Audio

## Executive summary

Robotic timbre and “white‑noise” character in generated audio almost always originate from a small set of failure modes: (a) **spectral images/aliasing** from non‑bandlimited synthesis (especially discontinuous waveforms and aggressive modulation), (b) **signal‑dependent quantisation distortion** (often caused by repeated truncation or low bit‑depth in intermediate stages), (c) **phase incoherence** and **time‑frequency leakage** in STFT/phase‑vocoder style processing, and (d) **over‑simplified source–filter / excitation models** (common in vocoders, naïve LPC or pitch‑synchronous methods) that do not preserve formants, transients, or voiced/unvoiced structure. citeturn3search6turn3search34turn0search2turn0search13turn4search1turn0search3  

The highest‑leverage interventions are typically:

1. **Make all oscillators and hard nonlinearities perceptually bandlimited** (bandlimited primitives, BLEP/BLIT families, or oversampling + strong low‑pass + decimation). Increasing sample rate alone helps but is usually not sufficient on its own for discontinuities. citeturn3search6turn3search34  
2. **Avoid repeated requantisation**; keep internal processing at high precision (e.g., float or high‑word‑length fixed‑point), and apply **TPDF dither** (and optional noise shaping) only when reducing bit‑depth at the final output stage. citeturn1search12turn11view0turn10search30  
3. **Use proper resampling** (polyphase, windowed‑sinc / fractional‑delay filters) instead of low‑order interpolation when changing sample rate or pitch via “resample then play”. citeturn9search6turn3search1  
4. **For STFT/phase‑vocoder processing**, enforce analysis/synthesis overlap‑add requirements, use windows with good sidelobe behaviour, and apply **phase‑locking / phase‑synchronisation** when time‑stretching or pitch‑shifting to reduce “phasiness”. citeturn2search0turn2search5turn0search2  
5. **For speech‑like synthesis**, improve pitch tracking (reduce octave errors and jitter), preserve formants and transients (PSOLA‑style time‑domain approaches or spectral‑envelope constraints), and use mixed excitation/noise modelling rather than a single simplistic excitation. citeturn1search2turn4search3turn4search1turn0search3  

Unless otherwise stated, parameters such as sample rate, bit depth, buffer size, hop size, and filter specifications are **unspecified**. Where concrete values are shown, they are explicitly marked as **worked examples** and must be recomputed for your actual system.

## Root causes of robotic and noise‑like timbres

Robotic/white‑noise artefacts are best understood as *energy appearing in the wrong places* (spectrally, temporally, or perceptually) because constraints of sampled‑data systems and analysis/synthesis methods were violated or approximated too crudely.

### Aliasing and image components from synthesis and modulation

Discontinuous waveforms (pulse, saw, hard sync, hard clipping) have theoretically infinite bandwidth. When sampled, spectral components above Nyquist fold back into the baseband, typically producing a characteristic brittle “buzz” that can be misperceived as noisy or robotic, especially under modulation. Alias‑free methods explicitly bandlimit these waveforms or generate bandlimited primitive components whose integration or summation yields the target waveform. citeturn3search6turn3search34  

Wavetable synthesis can also alias when (i) tables contain energy above Nyquist at the current playback pitch, (ii) interpolation is poor, or (iii) table switching introduces discontinuities. The same risk appears in FM/PM: modulation can create wide sideband structures; if sidebands exceed Nyquist, they fold, often as inharmonic “noise‑like” energy. The underlying FM sideband structure is a feature, but uncontrolled folding is not. citeturn3search7turn3search6turn3search34  

### Quantisation, truncation, and numeric precision loss

Quantisation is not just “added noise”: undithered quantisation error is **signal‑dependent** and can manifest as correlated distortion (spurious tones, harmonic “zipper” artefacts), which may be heard as robotic or “granular”. Textbook SNR limits (≈ 6.02 N + 1.76 dB for an ideal N‑bit converter driven by a full‑scale sine) are derived under specific assumptions; in real DSP chains, repeated truncation and coefficient quantisation often dominate. citeturn1search12turn1search0  

Proper dithering decorrelates the error, trading structured distortion for (typically less objectionable) broadband noise. citeturn11view0turn12search19  

### Phase errors, windowing, and STFT leakage

Short‑time Fourier processing (STFT, phase vocoder, spectral gating, vocoders built on filterbanks) relies on consistent phase and correct overlap‑add reconstruction. Poor window choice, incorrect hop size, or inconsistent analysis/synthesis windows can cause time‑varying gain (“phasiness”, “flanging”), noise floor elevation, or transient smearing. Window sidelobe levels strongly influence leakage: high sidelobes smear narrowband energy into broadband energy, perceived as hiss or roughness. citeturn2search0turn2search5turn3search8  

Phase vocoders in particular are known to produce “phasiness” in time‑stretched audio unless phase relationships are constrained (e.g., phase‑locking around spectral peaks). citeturn0search2turn0search13turn0search17  

### Poor excitation/noise modelling and oversimplified source–filter assumptions

Classic source–filter paradigms (including channel vocoders and LPC‑based synthesis) rely on two modelling steps: estimate the spectral envelope (vocal‑tract filter) and generate an excitation (voiced periodicity + unvoiced noise). If the envelope is over‑smoothed, poorly estimated, or updated too coarsely, the result becomes “buzzy” or “robotic”; if the excitation is wrong (e.g., voiced/unvoiced misclassification, noise injected into voiced speech, or impulse train too idealised), the output can become hissy or whisper‑like. citeturn5search6turn4search1turn4search0  

### Pitch tracking errors, envelope discontinuities, and parameter stepping

Pitch trackers commonly produce octave errors (doubling/halving), jitter, or voiced/unvoiced confusion—especially in noisy, breathy, or polyphonic signals—leading to robotic pitch contours and instability. Robust algorithms mitigate this but still require post‑processing and temporal smoothing. citeturn1search2turn4search3  

Similarly, abrupt parameter changes (ADSR steps, filter cutoff jumps, wavetable index jumps) introduce broadband energy (clicks) and modulation sidebands (“zipper noise”) that can be perceived as hiss or synthetic roughness. Windowing and smoothing are the standard remedies. citeturn2search0turn2search5  

### Real‑time delivery issues: buffer underruns and resynchronisation glitches

In real‑time systems, missed deadlines cause buffer underflow/overflow (xruns). The audible results range from clicks and repeated buffer fragments to bursts of noise, depending on the audio API and underflow handling. citeturn8search1turn8search11  

```mermaid
flowchart TD
  P[Parameters / Control signals] --> S[Signal generation<br/>(oscillators, noise, samples)]
  S --> A[Anti-alias & resampling<br/>(bandlimit, oversample, polyphase SRC)]
  A --> M[Modulation & shaping<br/>(filters, waveshaping, envelopes)]
  M --> T[Time-frequency processing<br/>(STFT, vocoder, PSOLA, granular)]
  T --> X[Mix / dynamics / spatial]
  X --> Q[Output stage<br/>(limit, dither, quantise)]
  Q --> B[Audio I/O buffers]
  B --> D[DAC / Playback]

  S -. discontinuities -> AA[Aliasing]
  Q -. truncation -> QN[Quantisation distortion]
  T -. window/hop/phase -> PV[Phasiness / leakage]
  B -. missed deadlines -> XR[Underruns / XRuns]
```

## Mathematical foundations and artefact analysis

This section gives compact equations that explain *why* the artefacts occur and where mitigation should be inserted.

### Discrete‑time waveform generation and modulation

A basic sinusoidal oscillator is generated by a phase accumulator:

\[
\phi[n] = \phi[n-1] + 2\pi \frac{f_0[n]}{f_s} \quad (\bmod 2\pi), \qquad x[n]=A\sin(\phi[n]).
\]

Additive synthesis generalises this as:

\[
x[n] = \sum_{k=1}^{K} A_k[n]\sin(\phi_k[n]), \quad \phi_k[n]=\phi_k[n-1]+2\pi\frac{k f_0[n]}{f_s}.
\]

FM synthesis (sinusoidal carrier and modulator) can be written:

\[
x[n] = A \sin\!\Bigl(2\pi \frac{f_c}{f_s}n + I \sin\!\bigl(2\pi \frac{f_m}{f_s}n\bigr)\Bigr),
\]

where \(I\) is the modulation index; the resulting spectrum contains sidebands whose extent grows with \(I\). Wide sidebands are likely to exceed Nyquist and fold if not handled. citeturn3search7turn3search6turn3search34  

### Aliasing conditions and fold‑back mapping

In sampled systems, any sinusoidal component at analogue frequency \(f\) is indistinguishable from components at \(f \pm k f_s\). A useful fold‑back mapping for a discrete‑time sinusoid is:

\[
f_{\text{alias}} = \left| f - k f_s \right| \quad \text{for integer } k \text{ chosen so } f_{\text{alias}} \in [0, f_s/2].
\]

For harmonic signals \(k f_0\), aliasing begins once \(k f_0 > f_s/2\). Discontinuous waveforms generate infinitely many harmonics, so aliasing is inevitable unless the waveform is explicitly bandlimited before sampling. citeturn3search6turn3search34turn9search6  

**Illustration (generated for this report):** the spectrogram below shows a naïve digitally generated sawtooth with rising \(f_0\). Harmonics fold as they hit Nyquist; oversampling + low‑pass + decimation largely removes the fold‑back components.

![Aliasing fold-back vs oversampling + low-pass + decimation](sandbox:/mnt/data/aliasing_spectrogram_naive_vs_oversampled.png)

### Quantisation noise, SNR, and why undithered distortion can sound robotic

A uniform mid‑tread quantiser with step size \(\Delta\) can be modelled as:

\[
Q(x) = \Delta \cdot \mathrm{round}\!\left(\frac{x}{\Delta}\right), \qquad e = Q(x)-x.
\]

Under classical assumptions (busy signal, no overload), the error \(e\) is approximated as uniformly distributed on \([-\Delta/2, \Delta/2]\), giving:

\[
\sigma_e^2 = \frac{\Delta^2}{12}.
\]

For an ideal N‑bit converter with a full‑scale sine input, a common result is:

\[
\mathrm{SNR} \approx 6.02\,N + 1.76 \text{ dB},
\]

over the baseband. citeturn1search12turn1search0  

The crucial nuance for *robotic artefacts* is that **without dither**, quantisation error is not guaranteed to be independent of the signal; it can produce deterministic spurs and harmonic patterns perceived as “digital”. Dither is introduced to linearise the quantiser statistically. citeturn11view0turn12search19  

### Dithering and noise shaping

Dithered quantisation applies noise \(d[n]\) before quantisation:

\[
y[n] = Q(x[n] + d[n]).
\]

The choice of probability distribution for \(d[n]\) matters. Classic results show that properly chosen dither can make quantisation error statistically independent of the input under practical conditions; the AES survey discusses rectangular and triangular (TPDF) dither and their implications for error properties. citeturn11view0turn10search30turn12search19  

Noise shaping typically introduces feedback around a quantiser so that quantisation noise is spectrally weighted (often pushed to higher frequencies). However, feedback systems can exhibit idle tones and artefacts if not dithered/stabilised appropriately. citeturn9search4turn9search27  

**Illustration (generated for this report):** undithered 8‑bit quantisation error for a sine produces strong harmonic structure; TPDF dither removes the tones and yields a flatter noise floor.

![Quantisation error PSD: undithered vs TPDF dithered](sandbox:/mnt/data/quantisation_error_psd_dither_vs_none.png)

### Interpolation, fractional delay, and sample‑rate conversion error mechanisms

Resampling and pitch‑shift‑by‑resampling fundamentally require **bandlimited interpolation**. In discrete time, ideal interpolation is convolution with a sinc kernel:

\[
x(t)=\sum_{n=-\infty}^{\infty} x[n]\;\mathrm{sinc}\!\left(\frac{t-nT}{T}\right), \quad T = 1/f_s.
\]

Practical systems approximate the sinc (truncate/window it) or use fractional‑delay filters and polyphase structures. Efficient multirate resampling architectures and design methods are treated in classic tutorial literature. citeturn9search6turn3search1turn9search2  

Low‑order interpolation corresponds to specific kernels with known frequency responses:

- **Zero‑order hold (ZOH)** ≈ rectangular kernel → frequency response with sinc roll‑off.
- **Linear interpolation** ≈ triangular kernel → \( \mathrm{sinc}^2 \) roll‑off, attenuating high frequencies and introducing imaging/aliasing under rate conversion.
- **Higher‑order Lagrange/cubic** reduce error but remain approximations to ideal bandlimited interpolation.

Fractional delay filter design (including FIR and all‑pass approaches) is specifically motivated by “splitting the unit delay” as a bandlimited interpolation problem. citeturn3search1turn2search11  

### FIR/IIR filter design equations and stability

An FIR filter is:

\[
y[n] = \sum_{k=0}^{M-1} h[k]\,x[n-k], \qquad H(e^{j\omega})=\sum_{k=0}^{M-1} h[k]e^{-j\omega k}.
\]

Windowed‑sinc FIR design starts from an ideal impulse response (sinc) and applies a window to control sidelobes and transition width. citeturn9search5turn9search32turn9search28  

An IIR biquad in direct form is commonly written:

\[
y[n] = b_0x[n]+b_1x[n-1]+b_2x[n-2] - a_1y[n-1]-a_2y[n-2].
\]

Standardised “cookbook” coefficient formulae for such biquads are widely used in audio engineering. citeturn1search1turn1search5  

### Window functions, FFT leakage, and overlap‑add reconstruction

The DFT of a windowed frame of length \(N\) is:

\[
X[k]=\sum_{n=0}^{N-1} x[n]\,w[n]\,e^{-j2\pi kn/N}.
\]

Spectral leakage arises because finite windows correspond to convolution in frequency by the window spectrum; sidelobe levels drive how much energy “leaks” into other bins. The classic window survey systematically compares window sidelobes and mainlobe widths. citeturn2search0turn3search8  

For overlap‑add reconstruction in STFT pipelines, windows and hop sizes are often chosen to satisfy constant overlap‑add (COLA) or related perfect reconstruction conditions. citeturn2search5turn2search36turn2search21  

**Illustration (generated for this report):** rectangular windows have high sidelobes (more leakage) compared with Hann/Blackman‑type tapers.

![Window frequency responses](sandbox:/mnt/data/window_frequency_response_rect_hann_blackman.png)

### Phase vocoder maths and “phasiness”

A common STFT definition for frame index \(m\), frequency bin \(k\), hop \(R\), and analysis window \(w\) is:

\[
X(m,k)=\sum_{n} x[n]\,w[n-mR]\,e^{-j 2\pi k n/N}.
\]

Phase vocoder time‑scale modification typically adjusts hop sizes between analysis and synthesis. A major source of artefacts is inconsistent phase evolution across bins (spectral components that should move together do not), producing the characteristic “phasiness”. Phase‑locking strategies align phases around spectral peaks to preserve local coherence and reduce artefacts. citeturn0search2turn0search13turn0search17  

```mermaid
flowchart LR
  X[x[n]] --> W[Frame & window w[n]]
  W --> F[FFT -> X(m,k)]
  F --> MP[Magnitude |X| and phase ∠X]
  MP --> MOD[Modify<br/>time-scale / pitch / spectral envelope]
  MOD --> PL[Optional: phase locking / peak-sync]
  PL --> I[IFFT]
  I --> O[Overlap-add synthesis]
  O --> Y[y[n]]
```

### LPC/formant estimation and excitation modelling

Linear prediction models each sample as a linear combination of past samples:

\[
x[n] \approx \sum_{i=1}^{p} a_i\,x[n-i] + e[n].
\]

This corresponds to an all‑pole filter \(A(z)=1-\sum_{i=1}^{p} a_i z^{-i}\) driven by an excitation \(e[n]\). The coefficients \(a_i\) define a spectral envelope; formants correspond (approximately) to resonances associated with poles of \(1/A(z)\). LPC analysis/synthesis and its relationship to speech spectral envelope estimation are foundational in speech coding literature. citeturn4search1turn4search0  

### PSOLA (pitch‑synchronous overlap‑add)

Time‑domain PSOLA variants segment the waveform around pitch marks (epochs), window each pitch‑synchronous segment, and overlap‑add segments at new time positions to change pitch and/or duration:

\[
y[n] = \sum_{m} x[n]\,w[n-n_m] \quad \text{(repositioned with modified pitch period)}.
\]

PSOLA is widely used for prosody modification because it can alter pitch with relatively small changes to spectral envelope when pitch marks are correct. citeturn0search3turn0search30turn0search38  

### Granular synthesis (time‑domain, probabilistic, and OLA perspectives)

A generic granular synthesis model can be written as a sum of grains \(g_i\) placed at times \(t_i\):

\[
y(t) = \sum_{i} a_i\,g_i(t-t_i), \qquad g_i(t)=w_i(t)\,s_i(t),
\]

where \(w_i\) is the grain envelope/window and \(s_i\) is a carrier (sample excerpt, noise, or oscillator). Grain density and parameter distributions control the perceived texture; discontinuities in grain boundaries or poor windowing can create noisy artefacts. Granular synthesis is treated extensively in the computer music literature. citeturn5search0turn5search1  

## Practical remediation strategies

This section translates the above mechanisms into concrete engineering choices. Unless explicitly stated as a worked example, parameters are **unspecified** and must be set based on your target content (speech vs music vs SFX), sample rate, and computational budget.

### Anti‑aliasing strategies for oscillators, wavetable, and nonlinear stages

**Bandlimit the source, not just the output.** If you generate discontinuities at the base sample rate and “filter later”, the aliased components are already in‑band and cannot be removed. Alias‑free waveform synthesis methods therefore generate bandlimited primitives (e.g., bandlimited impulse trains) or apply local corrections around discontinuities. citeturn3search6turn3search34  

**Oversampling as a robust baseline.** A common approach is:

- Upsample by \(L\) (2×/4×/8×/16×; unspecified).
- Generate oscillator / apply nonlinearities at \(L f_s\).
- Apply a strong low‑pass with cutoff \(\le f_s/2\) (in the oversampled domain).
- Downsample by \(L\).

Increasing sample rate reduces perceptible aliasing in principle, but practical oscillators still need explicit anti‑aliasing for discontinuities. citeturn3search34turn9search6  

**Recommended oversampling factors (rule‑of‑thumb):**
- **2×**: mild nonlinearities (soft saturation), low fundamentals, conservative modulation.
- **4×**: saw/pulse oscillators in musical ranges; moderate waveshaping.
- **8×**: hard sync, aggressive FM, sharp clipping, heavy distortion; high‑pitch content.
- **16×**: specialised cases where alias suppression requirements are very strict and CPU allows.  
These are engineering heuristics; perceptual thresholds depend on material and acceptable artefact level. citeturn3search34turn3search6  

**Wavetable mipmapping / multitable bandlimiting.** Precompute tables bandlimited to different top harmonic counts (or low‑pass the table spectrum) and select based on pitch so the table’s highest harmonic is below Nyquist. This is typically cheaper than high oversampling for pure wavetable oscillators, but still needs careful interpolation and crossfading to avoid switching clicks. citeturn3search6turn3search34  

### Interpolation and resampling fixes

If pitch shifting or playback uses resampling or fractional playback rates, **linear interpolation is usually insufficient** at high frequencies. The correct framing is “bandlimited interpolation” via fractional delay and polyphase filters. citeturn3search1turn9search6  

**Practical recommendation hierarchy (quality vs cost):**
- **Sinc / polyphase FIR** (highest quality; highest CPU; common in high‑quality SRC). citeturn9search6turn9search5  
- **Windowed‑sinc with moderate taps** (good compromise; tune taps/stopband). citeturn9search32turn9search28  
- **Cubic / Lagrange fractional delay** (moderate quality; easier than large FIR banks). citeturn3search1turn2search11  
- **Linear** (lowest CPU; audible HF loss/imaging in demanding cases).

**Anti‑aliasing in SRC:** downsampling requires a low‑pass before decimation; interpolation requires suppression of imaging at multiples of the new Nyquist. Efficient multirate structures exploit polyphase decomposition. citeturn9search6turn9search2  

### Windowing, overlap‑add, and transient handling

**Choose windows for your task:**
- For general STFT analysis: Hann/Blackman‑family windows are common; lower sidelobes reduce leakage. citeturn2search0turn3search8turn10search32  
- For analysis‑synthesis with overlap‑add, ensure the window/hop combination supports perfect reconstruction (COLA or related conditions). citeturn2search5turn2search21turn2search36  

**High overlap reduces phase vocoder artefacts.** Phase‑vocoder improvements and phase‑locking methods were introduced explicitly to reduce “phasiness”, and overlap/hop choices interact strongly with these artefacts. citeturn0search2turn0search13turn0search17  

**Transient preservation:** time‑stretch methods that treat all frames as stationary tend to smear transients and produce “watery” or “phasiness” artefacts. Hybrid methods combining time‑domain alignment (SOLA‑style) with phase‑vocoder concepts have been explored to reduce such artefacts in music signals. citeturn0search25turn0search37  

### Dithering, bit depth, and noise shaping in practice

**Rule:** keep processing at high resolution; dither only when reducing word length.

- Internal word length: **unspecified**. Many systems use float32/float64 internally; fixed‑point systems need guard bits and careful scaling.
- Output word length: **unspecified**. If output is integer PCM, apply dither when rounding/truncating.

**TPDF dither is a common default** for removing correlated quantisation distortion when truncating PCM. The dither survey provides conditions under which specific dither pdfs produce desirable error properties and discusses practical misunderstandings. citeturn11view0turn12search19turn10search30  

**Noise shaping:** apply only if (a) you understand stability/noise‑gain constraints, and (b) the playback chain and bandwidth make it beneficial. Audio sigma‑delta/noise‑shaping systems can show low‑level artefacts without appropriate dithering; published analyses discuss idle tones and noise modulation. citeturn9search4turn9search27  

### Pitch tracking and formant preservation

**Pitch tracking improvements:**
- Use a robust estimator (e.g., YIN or RAPT‑style approaches) and explicitly correct octave errors (doubling/halving) with temporal continuity constraints and voiced/unvoiced gating. citeturn1search2turn4search3  
- Smooth \(f_0\) with median filtering or low‑pass smoothing in the log‑frequency domain (details depend on your use case; unspecified). The general motivation is to suppress jitter that becomes robotic modulation.

**Formant preservation:** for speech pitch shift, PSOLA is often preferred when pitch marks are reliable because it can adjust pitch with minor changes to vowel identity. citeturn0search3turn0search30  
For spectral methods, preserve the spectral envelope (e.g., estimate envelope via LPC/cepstrum, shift harmonics, then reimpose envelope). LPC foundations and speech analysis/synthesis properties are discussed in classical literature. citeturn4search1turn4search0  

### Vocoder and excitation/noise modelling fixes

Channel vocoders and LPC synthesis depend on:
- enough spectral channels / resolution,
- correct envelope tracking bandwidth,
- appropriate voiced/unvoiced excitation mixture,
- stable, smoothly varying parameters.  

The original vocoder framing as “carrier + envelope” speech modelling is historically rooted, and modern variants still inherit these sensitivities. citeturn5search6turn4search6turn4search1  

If the output becomes “white‑noise‑like”, common culprits are overly noisy excitation in voiced regions, too few channels (coarse spectral envelope), or envelopes that fluctuate too fast (noise modulation). citeturn4search1turn11view0  

### Real‑time robustness: latency and buffer tuning

When artefacts resemble crackles, bursts, or repeating fragments rather than consistent timbral issues, suspect underruns/overruns.

- Buffer under/overflows occur when subsystems fail to meet real‑time deadlines; PortAudio documents the underflow/overflow problem explicitly and motivates reporting these events to callbacks. citeturn8search1turn10search0  
- On Linux stacks, xruns are commonly described as buffer under/overruns producing audible crackles/pops. citeturn8search11  

**Mitigation tactics (platform‑agnostic):**
- Increase buffer size/latency (exact values unspecified).
- Avoid blocking operations in audio callbacks (I/O, locks, allocation).
- Use a lock‑free ring buffer between real‑time audio threads and non‑real‑time work.
- Instrument worst‑case callback time vs buffer deadline.

### Worked examples: filter coefficients and parameterised templates

The examples below assume **fs = 48 kHz** (specified) purely to provide concrete numbers. Recompute for your actual sample rate.

**Example A: biquad low‑pass (RBJ cookbook), fs=48 kHz, f0=8 kHz, Q=0.7071**

Coefficients are for the standard direct‑form I/II difference equation  
\(y[n]=b_0x[n]+b_1x[n-1]+b_2x[n-2]-a_1y[n-1]-a_2y[n-2]\). citeturn1search1turn1search5  

```code
# fs = 48000 Hz, f0 = 8000 Hz, Q = 0.70710678
b0 =  0.15505102572168214
b1 =  0.31010205144336430
b2 =  0.15505102572168214
a1 = -0.62020410288672880
a2 =  0.24040820577345745
```

**Example B: FIR low‑pass for decimation by 2, fs_in=48 kHz → fs_out=24 kHz**

Designed with windowed‑sinc (Kaiser) using cutoff \(f_c=10.8\text{ kHz}\) (specified), 127 taps (specified). This is an illustrative decimation filter; stringent SRC may require different ripple/attenuation and more taps. FIR window method context and FIR design are covered in standard DSP references. citeturn9search32turn9search5turn9search6  

```code
# FIR LPF (Kaiser-windowed sinc), numtaps = 127
# fs_in = 48000 Hz, cutoff = 10800 Hz  (normalised cutoff = 0.45 of Nyquist)
# Symmetric linear-phase: h[n] = h[M-1-n]

# First 18 taps:
h[0..17] =
[ +5.99877872e-06, -3.53634666e-06, -1.74104322e-05, +1.75296972e-19,
  +3.50960166e-05, +1.48001657e-05, -5.61399729e-05, -4.77728129e-05,
  +7.29308250e-05, +1.04424613e-04, -7.24570719e-05, -1.85712100e-04,
  +3.70248621e-05, +2.84471401e-04, +5.30825356e-05, -3.82302332e-04,
  -2.14824720e-04, +4.48030607e-04 ]

# Centre region (around tap 63):
h[60..66] =
[ -9.367593e-02, +4.898168e-02, +3.140714e-01, +4.500006e-01,
  +3.140714e-01, +4.898168e-02, -9.367593e-02 ]

# Last 18 taps mirror the first 18 in reverse order.
```

## Implementation and evaluation playbook

### Pseudocode building blocks

The following is language‑neutral pseudocode with explicit algorithmic intent.

**Bandlimited oscillator via oversampling + decimation (robust baseline)** citeturn9search6turn3search34  

```code
function render_block(params, N, fs):
    OS = params.oversampling_factor  # unspecified (e.g., 4, 8)
    fs_hi = fs * OS

    # 1) Upsample control signals (f0, cutoff, etc.) to fs_hi
    f0_hi = upsample_control(params.f0, OS)

    # 2) Generate signal at high rate
    x_hi = oscillator_or_excitation(f0_hi, fs_hi, params)

    # 3) Apply nonlinearities/filters at high rate (optional)
    x_hi = nonlinear_chain(x_hi, fs_hi, params)

    # 4) Low-pass to <= fs/2 (in fs_hi domain), then decimate
    x_hi = fir_lowpass(x_hi, cutoff = fs/2, fs = fs_hi, spec = params.aa_spec)
    y    = decimate_by_OS(x_hi, OS)

    return y[0..N-1]
```

**TPDF dithering on final word‑length reduction** citeturn11view0turn1search12  

```code
function quantise_with_tpdf_dither(x_float, bit_depth):
    # bit_depth unspecified; for integer PCM output
    Δ = full_scale / (2^(bit_depth-1) - 1)

    # TPDF dither: sum of two independent uniform(-0.5, 0.5) scaled to 1 LSB
    u1 = uniform(-0.5, +0.5)
    u2 = uniform(-0.5, +0.5)
    d  = (u1 + u2) * Δ

    y_int = round((x_float + d) / Δ)
    y_int = clamp(y_int, min_int, max_int)

    return y_int
```

**Polyphase SRC skeleton (rational factor \(L/M\))** citeturn9search6turn9search2  

```code
function src_polyphase(x, L, M, h):
    # L/M: rational conversion ratio (unspecified)
    # h: prototype low-pass FIR for anti-imaging/anti-aliasing (specified by design)
    phases = split_into_polyphase(h, L)

    y = []
    phase_acc = 0
    n = 0

    while n < length(x):
        # produce as many output samples as needed
        while phase_acc <= 0:
            p = (-phase_acc) mod L
            y.append( dot(phases[p], x_around(n)) )
            phase_acc += M

        phase_acc -= L
        n += 1

    return y
```

**STFT phase vocoder with phase locking hook** citeturn0search2turn0search13turn2search5  

```code
function phase_vocoder(x, stretch_factor):
    N = params.fft_size        # unspecified
    R = params.analysis_hop    # unspecified
    S = round(R * stretch_factor)

    w = params.window          # e.g., Hann; ensure COLA/NOLA (unspecified)
    prev_phase = zeros(N/2+1)
    phase_acc  = zeros(N/2+1)

    for each frame m:
        x_m = x[m*R : m*R+N-1] * w
        X   = FFT(x_m)

        mag   = abs(X)
        phase = angle(X)

        # phase advance estimate (unwrap)
        delta = princ_arg(phase - prev_phase - expected_phase_advance(R))
        inst_freq = expected_bin_freq + delta / R

        # synthesis phase accumulation
        phase_acc += inst_freq * S

        # optional: phase locking around peaks
        phase_acc = phase_lock(phase_acc, mag)

        Y = mag * exp(j * phase_acc)

        y_frame = IFFT(Y) * w_synthesis
        overlap_add(output, y_frame, hop = S)

        prev_phase = phase

    return output
```

### Test signals that expose robotic/noise artefacts

Use diagnostic signals that make specific errors obvious:

- **Log sine sweep** (20 Hz → Nyquist): reveals alias fold‑back and resampling filters.
- **Single‑tone not bin‑centred**: exposes FFT leakage and window effects. citeturn2search0turn3search8  
- **Impulse and step**: reveal ringing, phase distortion, and reconstruction errors in OLA/filtering.
- **Harmonic stack / sawtooth at varying pitch**: reveals bandlimiting failures. citeturn3search6turn3search34  
- **Voiced/unvoiced speech segments**: stress pitch tracking, vocoder excitation decisions. citeturn1search2turn4search3  

### Objective metrics: what to measure and why

No single metric captures “robotic” timbre; combine complementary measures.

**SNR / segmental SNR**  
Straightforward for controlled tests (known reference). Use when diagnosing quantisation/residual noise.

**Spectral flatness (tonality vs noise‑like)**  
A standard form is ratio of geometric mean to arithmetic mean of spectral power in a band:

\[
\mathrm{SFM} = \frac{\exp\left(\frac{1}{N}\sum_{k}\ln P[k]\right)}{\frac{1}{N}\sum_k P[k]}.
\]

This traditional measure is analysed and generalised in the literature, and is widely used in audio feature toolkits. citeturn8search17turn8search32turn8search25  

**Harmonics‑to‑Noise Ratio (HNR)**  
One established definition uses autocorrelation at the pitch period:

\[
\mathrm{HNR_{dB}} = 10\log_{10}\left(\frac{r'_x(\tau_{\max})}{1-r'_x(\tau_{\max})}\right).
\]

This is useful for “buzz vs breath/noise” diagnosis in voice‑like signals. citeturn7search3turn7search7  

**STOI (intelligibility proxy for speech)**  
STOI was introduced as an objective intelligibility measure with high correlation to intelligibility under certain degradations; use for speech systems when you have a clean reference. citeturn1search7  

**PESQ (speech quality proxy for narrowband telephony conditions)**  
PESQ is standardised for certain telephony use cases; its domain limits matter (e.g., narrowband handset telephony in the base recommendation). citeturn7search0turn7search4  

### Unit tests and regression testing ideas

- **Aliasing budget test:** generate a high‑pitch harmonic signal, compute spectrogram/PSD, and assert that energy above a threshold in bands expected to be empty is below a target (thresholds unspecified; set based on your quality goals). citeturn3search6turn3search34  
- **OLA reconstruction test:** STFT → iSTFT with no modifications should reconstruct within numerical tolerance; if not, window/hop is wrong. citeturn2search5turn2search21  
- **SRC invariance test:** upsample then downsample (or L/M then M/L) should preserve tone frequency and introduce bounded error (spec depends on filter). citeturn9search6turn3search1  
- **Pitch tracker sanity tests:** synthetic voiced signals with known \(f_0\) should not show octave errors; evaluate error distributions and smoothing. citeturn1search2turn4search3  

### Listening tests: protocols that catch “robotic” artefacts reliably

For intermediate impairments, **MUSHRA** (multi‑stimulus with hidden reference and anchor) is a widely recommended methodology and has detailed guidance on experiment design, anchors, and reporting. citeturn7search5turn7search1  

For single‑stimulus ratings (MOS terminology and reporting), ITU recommendations define MOS terms and encourage careful interpretation. citeturn7search2turn7search18  

If you run web‑based tests, follow established frameworks to improve reliability and reduce bias (e.g., interface and randomisation controls). citeturn7search29  

## Comparative synthesis methods and recommended fixes

The table below summarises typical ways each synthesis family becomes robotic/noisy, and which fixes most directly reduce those failure modes.

| Synthesis method | Typical robotic / noise‑like failure modes | Root causes (engineering) | High‑leverage fixes |
|---|---|---|---|
| Additive | “Organ‑like”/static tone; noisy residual; phasey resynthesis | Too few partials; poor amplitude/frequency smoothing; incoherent phase; missing stochastic component | Track partials + smooth trajectories; add residual/noise model (sines+noise); preserve phase continuity citeturn10search10turn10search6 |
| Subtractive (oscillator + filter) | Buzziness; inharmonic “digital” grit at high notes | Aliasing from discontinuous oscillators and nonlinearities | Bandlimited oscillators (alias‑free methods); oversampling + LPF; avoid hard discontinuities citeturn3search6turn3search34 |
| FM / PM | Inharmonic roughness becomes noise; metallic artefacts | Sidebands exceed Nyquist; high modulation index; insufficient oversampling | Constrain modulation bandwidth; oversample; bandlimit carrier/modulator; post‑filter cautiously citeturn3search7turn3search34 |
| Wavetable | “Digital” harshness; stepping/zipper; phase reset clicks | Tables not bandlimited per pitch; poor interpolation; abrupt table switching | Mipmapped/bandlimited tables; higher‑order interpolation; crossfade table changes; ensure phase continuity citeturn3search6turn3search1 |
| Granular | Broadband hiss/“spray”; roughness; time smear | Grain boundary discontinuities; poor window; too high density; poor randomisation; misaligned grains | Use smooth grain windows (e.g., Hann); enforce energy‑consistent overlap; control density jitter; transient‑aware grain selection citeturn5search0turn5search1turn2search5 |
| Vocoder / LPC‑style | Classic “robot voice”; excessive hiss; intelligibility loss | Too few channels; envelope tracking too coarse/fast; poor excitation model; pitch errors; formant drift | Increase channels/resolution; smooth envelopes; mixed excitation; robust pitch tracking; formant preservation constraints citeturn5search6turn4search1turn1search2turn4search3 |
| Neural TTS (acoustic model + neural vocoder) | Metallic noise; pitch jitter; noisy fricatives; “GAN shimmer” | Model mismatch between predicted vs true features; vocoder generalisation failure; adversarial artefacts | Use robust/universal vocoders; training augmentations; explicit periodicity modelling; post‑filtering only as last resort citeturn6search16turn6search2turn6search1turn6search27turn6search35 |

### Selecting a fix order in practice

When both white‑noise and robotic colouration are present, a pragmatic prioritisation is:

1. Verify **real‑time stability** (no xruns/underruns). citeturn8search1turn8search11  
2. Eliminate **aliasing** at the source (bandlimit/oversample before nonlinearity). citeturn3search6turn3search34  
3. Ensure **correct SRC/interpolation** wherever sample rates or playback rates change. citeturn9search6turn3search1  
4. Fix **window/hop/phase coherence** in STFT processing chains. citeturn2search0turn2search5turn0search2  
5. Address **model adequacy** (excitation/noise modelling, formants, pitch tracking). citeturn4search1turn0search3turn1search2