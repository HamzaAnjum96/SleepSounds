import type { Sound } from './types';

export const SOUND_LIBRARY: Sound[] = [
  {
    id: 'rain',
    name: 'Rain',
    category: 'Nature',
    url: 'https://assets.mixkit.co/active_storage/sfx/124/124-preview.mp3',
  },
  {
    id: 'ocean',
    name: 'Ocean',
    category: 'Nature',
    url: 'https://assets.mixkit.co/active_storage/sfx/1196/1196-preview.mp3',
  },
  {
    id: 'wind',
    name: 'Wind',
    category: 'Nature',
    url: 'https://assets.mixkit.co/active_storage/sfx/1166/1166-preview.mp3',
  },
  {
    id: 'forest',
    name: 'Forest',
    category: 'Nature',
    url: 'https://assets.mixkit.co/active_storage/sfx/2480/2480-preview.mp3',
  },
  {
    id: 'fireplace',
    name: 'Fireplace',
    category: 'Cozy',
    url: 'https://assets.mixkit.co/active_storage/sfx/2535/2535-preview.mp3',
  },
  {
    id: 'white-noise',
    name: 'White Noise',
    category: 'Noise',
    url: 'https://assets.mixkit.co/active_storage/sfx/2514/2514-preview.mp3',
  },
  {
    id: 'brown-noise',
    name: 'Brown Noise',
    category: 'Noise',
    url: 'https://assets.mixkit.co/active_storage/sfx/2515/2515-preview.mp3',
  },
  {
    id: 'night',
    name: 'Night Ambience',
    category: 'Nature',
    url: 'https://assets.mixkit.co/active_storage/sfx/2348/2348-preview.mp3',
  },
];

export const PRESET_STORAGE_KEY = 'sleep-mixer-presets-v1';
