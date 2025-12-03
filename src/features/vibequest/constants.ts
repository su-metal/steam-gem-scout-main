import { VibeData, SubVibe } from './types';

// Helper to distribute points on a sphere roughly
// We place them carefully to ensure they are accessible via rotation
// Normalized to radius ~2.2 to ensure they float above the sphere (radius 1.8)
export const VIBES: VibeData[] = [
  {
    id: 'CHILL',
    label: 'Chill',
    description: 'Low stakes, high relaxation. Atmospheres to get lost in.',
    color: '#3b82f6', // Blue
    accentColor: '#93c5fd',
    position: [0, 0, 2.3], // Front
    tags: ['Cozy', 'Sandbox', 'Nature', 'No Combat']
  },
  {
    id: 'FOCUS',
    label: 'Focus',
    description: 'Precision, strategy, and flow state. Test your mind.',
    color: '#8b5cf6', // Violet
    accentColor: '#c4b5fd',
    position: [2.0, 0, 1.0], // Right
    tags: ['Puzzle', 'Strategy', 'Rhythm', 'Programming']
  },
  {
    id: 'STORY',
    label: 'Story',
    description: 'Deep narratives and emotional journeys. Cinema you play.',
    color: '#f59e0b', // Amber
    accentColor: '#fcd34d',
    position: [-2.0, 0, 1.0], // Left
    tags: ['RPG', 'Visual Novel', 'Choice Matters', 'Lore']
  },
  {
    id: 'SPEED',
    label: 'Speed',
    description: 'Adrenaline, reflexes, and fast-paced action.',
    color: '#ef4444', // Red
    accentColor: '#fca5a5',
    position: [1.2, 1.6, 0.8], // Top Right
    tags: ['Racing', 'FPS', 'Platformer', 'Action']
  },
  {
    id: 'SHORT',
    label: 'Short',
    description: 'Complete experiences in under 2 hours. Respects your time.',
    color: '#10b981', // Emerald
    accentColor: '#6ee7b7',
    position: [-1.2, -1.6, 0.8], // Bottom Left
    tags: ['Indie', 'Arcade', 'Experimental', 'Compact']
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