import { describe, it, expect } from 'vitest';
import { SOUND_LIBRARY, CATEGORIES, BUILTIN_PRESETS, defaultVolumeFor, releasableSounds, HIDDEN_SOUND_IDS } from '../src/data';
import { SCENES, presetSoundIds } from '../src/lib/scenes';
import { SOUND_EDITOR_MODELS, EDITABLE_SOUND_IDS } from '../src/components/soundEditorDefs';
import { CATEGORY_ICONS, CATEGORY_COLORS } from '../src/lib/categoryIcons';
import { SOUND_ICONS } from '../src/lib/soundIcons';
import { LAYER_META, layeringTrim, layerShaping } from '../src/audio/layerMeta';

const soundIds = new Set(SOUND_LIBRARY.map((s) => s.id));
const validCategory = new Set(CATEGORIES.filter((c) => c !== 'All'));

describe('sound library', () => {
  it('has unique ids', () => {
    expect(soundIds.size).toBe(SOUND_LIBRARY.length);
  });

  it('every sound has a non-empty name and a known category', () => {
    for (const s of SOUND_LIBRARY) {
      expect(s.name.trim().length, `${s.id} name`).toBeGreaterThan(0);
      expect(validCategory.has(s.category as never), `${s.id} category "${s.category}"`).toBe(true);
    }
  });

  it('every sound has an icon and a default volume in [0,1]', () => {
    for (const s of SOUND_LIBRARY) {
      expect(SOUND_ICONS[s.id], `${s.id} icon`).toBeTruthy();
      const v = defaultVolumeFor(s.id);
      expect(v, `${s.id} default volume`).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it('every sound has a valid quality and a tags array', () => {
    const ok = new Set(['good', 'experimental', 'needs-work']);
    for (const s of SOUND_LIBRARY) {
      expect(ok.has(s.quality), `${s.id} quality "${s.quality}"`).toBe(true);
      expect(Array.isArray(s.tags), `${s.id} tags`).toBe(true);
    }
  });

  it('releasableSounds hides experimental and hidden sounds', () => {
    const visible = SOUND_LIBRARY.filter((s) => !HIDDEN_SOUND_IDS.has(s.id));
    const all = releasableSounds(true);
    const released = releasableSounds(false);
    // hidden sounds never appear, even with experimental opted in
    expect(all.length).toBe(visible.length);
    expect(all.some((s) => HIDDEN_SOUND_IDS.has(s.id))).toBe(false);
    // experimental ones are hidden unless opted in
    expect(released.every((s) => s.quality !== 'experimental')).toBe(true);
    expect(released.length).toBe(visible.filter((s) => s.quality !== 'experimental').length);
  });

  it('every sound declares a well-formed source (worklet or wav)', () => {
    for (const s of SOUND_LIBRARY) {
      const src = s.source;
      if (src.mode === 'worklet') {
        expect(src.module, `${s.id} module`).toMatch(/\.worklet\.js$/);
        expect(src.processor, `${s.id} processor`).toBeTruthy();
        expect(typeof src.params, `${s.id} params`).toBe('object');
        expect(typeof src.fallback, `${s.id} fallback`).toBe('function');
      } else {
        expect(src.mode, `${s.id} mode`).toBe('wav');
        expect(typeof src.make, `${s.id} make`).toBe('function');
      }
    }
  });
});

describe('categories', () => {
  it('every category has an icon and (non-All) a colour triplet', () => {
    for (const c of CATEGORIES) {
      expect(CATEGORY_ICONS[c], `${c} icon`).toBeTruthy();
      if (c !== 'All') {
        const triplet = CATEGORY_COLORS[c];
        expect(triplet, `${c} colour`).toMatch(/^\d{1,3},\d{1,3},\d{1,3}$/);
      }
    }
  });
});

describe('built-in presets', () => {
  it('have unique ids and names', () => {
    const ids = BUILTIN_PRESETS.map((p) => p.id);
    const names = BUILTIN_PRESETS.map((p) => p.name);
    expect(new Set(ids).size, 'unique ids').toBe(ids.length);
    expect(new Set(names).size, 'unique names').toBe(names.length);
  });

  it('reference only valid sounds, with at least one enabled layer', () => {
    for (const p of BUILTIN_PRESETS) {
      const enabled = presetSoundIds(p);
      expect(enabled.length, `${p.id} has layers`).toBeGreaterThan(0);
      for (const id of Object.keys(p.state)) {
        expect(soundIds.has(id), `${p.id} references "${id}"`).toBe(true);
      }
    }
  });

  it('have layer and master volumes in [0,1]', () => {
    for (const p of BUILTIN_PRESETS) {
      if (p.masterVolume !== undefined) {
        expect(p.masterVolume, `${p.id} master`).toBeGreaterThanOrEqual(0);
        expect(p.masterVolume).toBeLessThanOrEqual(1);
      }
      for (const [id, st] of Object.entries(p.state)) {
        expect(st.volume, `${p.id}/${id} volume`).toBeGreaterThanOrEqual(0);
        expect(st.volume).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe('scenes', () => {
  it('each scene has art, a mood line, and a non-empty preset', () => {
    expect(SCENES.length).toBeGreaterThan(0);
    for (const scene of SCENES) {
      expect(scene.art.trim().length, `${scene.preset.id} art`).toBeGreaterThan(0);
      expect(scene.mood.trim().length, `${scene.preset.id} mood`).toBeGreaterThan(0);
      expect(presetSoundIds(scene.preset).length, `${scene.preset.id} layers`).toBeGreaterThan(0);
    }
  });
});

describe('sound editor models', () => {
  it('every editable id is a real sound', () => {
    for (const id of EDITABLE_SOUND_IDS) {
      expect(soundIds.has(id), `editable "${id}"`).toBe(true);
    }
  });

  it('every param has a sane range with the default inside it', () => {
    for (const [id, model] of Object.entries(SOUND_EDITOR_MODELS)) {
      const keys = new Set<string>();
      for (const group of model.groups) {
        for (const p of group.params) {
          expect(p.min, `${id}/${p.key} min<max`).toBeLessThan(p.max);
          expect(p.step, `${id}/${p.key} step`).toBeGreaterThan(0);
          expect(p.def, `${id}/${p.key} def>=min`).toBeGreaterThanOrEqual(p.min);
          expect(p.def, `${id}/${p.key} def<=max`).toBeLessThanOrEqual(p.max);
          expect(keys.has(p.key), `${id}/${p.key} duplicate`).toBe(false);
          keys.add(p.key);
        }
      }
    }
  });

  it('every sound has variants, each named, with keys/values valid for that sound', () => {
    for (const [id, model] of Object.entries(SOUND_EDITOR_MODELS)) {
      const params = new Map(model.groups.flatMap((g) => g.params).map((p) => [p.key, p] as const));
      expect(model.variants, `${id} has variants`).toBeTruthy();
      const variants = model.variants!;
      expect(variants.length, `${id} variant count`).toBeGreaterThanOrEqual(3);

      const names = variants.map((v) => v.name);
      expect(new Set(names).size, `${id} unique variant names`).toBe(names.length);

      for (const v of variants) {
        expect(v.name.trim().length, `${id}/"${v.name}" name`).toBeGreaterThan(0);
        for (const [k, val] of Object.entries(v.values)) {
          const p = params.get(k);
          expect(p, `${id}/"${v.name}" key "${k}" is a real param`).toBeTruthy();
          expect(val, `${id}/"${v.name}".${k} >= min`).toBeGreaterThanOrEqual(p!.min);
          expect(val, `${id}/"${v.name}".${k} <= max`).toBeLessThanOrEqual(p!.max);
        }
      }
    }
  });

  it('exactly one variant per sound is the default (empty overrides)', () => {
    for (const [id, model] of Object.entries(SOUND_EDITOR_MODELS)) {
      const defaultsCount = model.variants!.filter((v) => Object.keys(v.values).length === 0).length;
      expect(defaultsCount, `${id} default-variant count`).toBe(1);
    }
  });
});

describe('layer masking', () => {
  it('every library sound has layer metadata', () => {
    for (const s of SOUND_LIBRARY) {
      expect(LAYER_META[s.id], `${s.id} layer meta`).toBeTruthy();
    }
  });

  it('a lone layer is never trimmed', () => {
    expect(layeringTrim(['fan'], 'fan')).toBe(1);
    expect(layeringTrim(['rain'], 'rain')).toBe(1);
  });

  it('stacked broadband beds duck, but stay sensible', () => {
    const t = layeringTrim(['fan', 'white-noise', 'pink-noise'], 'fan');
    expect(t, 'fan trimmed').toBeLessThan(1);
    expect(t, 'not silenced').toBeGreaterThan(0.4);
  });

  it('accents are never trimmed', () => {
    expect(layeringTrim(['fire', 'birdsong', 'night', 'thunder'], 'fire')).toBe(1);
  });

  it('two same-group motion layers are kept; three duck the extras', () => {
    expect(layeringTrim(['rain', 'ocean'], 'rain')).toBe(1);
    expect(layeringTrim(['rain', 'ocean', 'stream'], 'rain')).toBeLessThan(1);
  });
});

describe('layer spectral shaping', () => {
  it('a solo sound is transparent', () => {
    const s = layerShaping(['fan'], 'fan');
    expect(s).toEqual({ gainDb: 0, lpHz: 20000, shelfDb: 0 });
  });

  it('one or two broadband beds stay full-range', () => {
    expect(layerShaping(['fan', 'white-noise'], 'fan').lpHz).toBe(20000);
  });

  it('a third broadband bed darkens and shelves the non-accents', () => {
    const s = layerShaping(['fan', 'white-noise', 'pink-noise'], 'fan');
    expect(s.lpHz, 'darkened').toBeLessThan(20000);
    expect(s.lpHz, 'still audible').toBeGreaterThanOrEqual(5500);
    expect(s.shelfDb, 'top shelved').toBeLessThan(0);
    expect(s.gainDb, 'extra trim').toBeLessThan(0);
  });

  it('more beds darken further but never collapse', () => {
    const four = layerShaping(['fan', 'white-noise', 'pink-noise', 'wind'], 'fan');
    const three = layerShaping(['fan', 'white-noise', 'pink-noise'], 'fan');
    expect(four.lpHz).toBeLessThan(three.lpHz);
    expect(four.lpHz).toBeGreaterThanOrEqual(5500);
  });

  it('accents keep their top even amid a broadband crowd', () => {
    const s = layerShaping(['fan', 'white-noise', 'pink-noise', 'fire'], 'fire');
    expect(s.lpHz).toBe(20000);
    expect(s.shelfDb).toBe(0);
  });
});
