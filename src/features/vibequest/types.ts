import { Vector3 } from 'three';

export type VibeType = 'CHILL' | 'FOCUS' | 'STORY' | 'ACTION' | 'SHORT';

export interface VibeData {
  id: VibeType;
  label: string;
  description: string;
  color: string;
  accentColor: string;
  position: [number, number, number]; // x, y, z coordinate on sphere
  tags: string[];
}

export interface SubVibe {
  id: string;
  label: string;
  category: 'mood' | 'genre' | 'aesthetic';
}
