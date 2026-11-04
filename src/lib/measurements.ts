import type { RomMovement } from '../types';

/** Historical ROM zeros were placeholders. A genuine measured zero has explicit provenance. */
export function measuredRomSide(r: RomMovement | undefined, side: 'left' | 'right'): number | null {
  if (!r) return null;
  const v = r[side];
  if (v == null || !Number.isFinite(v) || v < 0 || v > 180) return null;
  if (v === 0 && r.measuredSides?.[side] !== true) return null;
  return v;
}
export function measuredAsymmetry(left: number | null | undefined, right: number | null | undefined): number | null {
  if (left == null || right == null || !Number.isFinite(left) || !Number.isFinite(right) || left < 0 || right < 0) return null;
  const maximum = Math.max(left, right);
  return maximum === 0 ? 0 : Math.round(Math.abs(left - right) / maximum * 100);
}
