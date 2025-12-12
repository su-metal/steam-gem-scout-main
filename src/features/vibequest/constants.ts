import { VibeData, SubVibe } from './types';

// Helper to distribute points on a sphere roughly
// We place them carefully to ensure they are accessible via rotation
// Normalized to radius ~2.2 to ensure they float above the sphere (radius 1.8)
export const VIBES: VibeData[] = [
  {
    id: 'CHILL',
    label: 'Chill',
    description: 'Unwind at your own pace and float through cozy atmospheres.',
    color: '#3b82f6',
    accentColor: '#93c5fd',
    position: [0, 0, 2.3],
    tags: ['Cozy', 'Ambient', 'Low Pressure', 'Slow Moments']
  },
  {
    id: 'FOCUS',
    label: 'Focus',
    description: 'Tactically rich systems that reward planning and optimization.',
    color: '#8b5cf6',
    accentColor: '#c4b5fd',
    position: [2.0, 0, 1.0],
    tags: ['Strategy', 'Systems', 'Planning', 'Flow']
  },
  {
    id: 'STORY',
    label: 'Story',
    description: 'Threaded narratives and emotional journeys with meaningful choices.',
    color: '#f59e0b',
    accentColor: '#fcd34d',
    position: [-2.0, 0, 1.0],
    tags: ['Story', 'Choices', 'Mystery', 'Lore']
  },
  {
    id: 'ACTION',
    label: 'Action',
    description: 'React, move, and fight at full throttle—intensity on tap.',
    color: '#ef4444',
    accentColor: '#fca5a5',
    position: [1.2, 1.6, 0.8],
    tags: ['Combat', 'Exploration', 'Intensity', 'Reactiveness']
  },
  {
    id: 'SHORT',
    label: 'Short',
    description: 'Bite-sized runs and tight loops that respect your time.',
    color: '#10b981',
    accentColor: '#6ee7b7',
    position: [-1.2, -1.6, 0.8],
    tags: ['Bite-Size', 'Rounds', 'Instant', 'Arcade']
  }
];

export const SUB_VIBES: SubVibe[] = [
  { id: 'sv1', label: 'Cyberpunk', category: 'aesthetic' },
  { id: 'sv2', label: 'Retro', category: 'aesthetic' },
  { id: 'sv3', label: 'Cooperative', category: 'genre' },
  { id: 'sv4', label: 'Difficult', category: 'mood' },
  { id: 'sv5', label: 'Funny', category: 'mood' },
  { id: 'sv6', label: 'Dark', category: 'aesthetic' },
  { id: 'sv7', label: 'Management', category: 'genre' },
  { id: 'sv8', label: 'Open World', category: 'genre' },
];
