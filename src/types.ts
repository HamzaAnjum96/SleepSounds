export interface Sound {
  id: string;
  name: string;
  category: string;
  url: string;
}

export interface SoundState {
  enabled: boolean;
  volume: number;
}

export interface Preset {
  id: string;
  name: string;
  createdAt: string;
  state: Record<string, SoundState>;
  masterVolume?: number;
}
