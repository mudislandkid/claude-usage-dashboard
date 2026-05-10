// Design tokens for the "terminal" aesthetic.
// Inline-style values (not Tailwind) — matches the design prototype exactly.

export const TT = {
  bg: '#08090a',
  bgAlt: '#0c0e10',
  panel: '#101315',
  panelHi: '#13171a',
  border: 'rgba(120,200,140,0.08)',
  borderHi: 'rgba(120,200,140,0.18)',
  borderSubtle: 'rgba(255,255,255,0.05)',
  grid: 'rgba(120,200,140,0.04)',
  text: '#dde4de',
  textHi: '#f1f6f3',
  textMute: '#7d8a82',
  textDim: '#4a544e',
  green: '#4ade80',
  greenSoft: 'rgba(74,222,128,0.10)',
  greenBright: '#86efac',
  amber: '#fbbf24',
  amberSoft: 'rgba(251,191,36,0.10)',
  red: '#f87171',
  redSoft: 'rgba(248,113,113,0.10)',
  blue: '#7dd3fc',
  blueSoft: 'rgba(125,211,252,0.10)',
  cyan: '#67e8f9',
  purple: '#c4b5fd',
  purpleSoft: 'rgba(196,181,253,0.10)',
  magenta: '#f0abfc',
} as const;

export const TT_MONO = "'IBM Plex Mono', ui-monospace, 'JetBrains Mono', monospace";

export type Range = '5H' | '24H' | '7D' | '30D';

export const rangeToDays: Record<Range, number> = {
  '5H': 5 / 24, // ≈ 0.2083; server queries accept fractional days
  '24H': 1,
  '7D': 7,
  '30D': 30,
};
