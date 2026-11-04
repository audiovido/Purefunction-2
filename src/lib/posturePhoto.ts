import { viewerSide } from './postureAssessment';

export type PhotoView = 'front' | 'side' | 'rear';
export type LandmarkKey = typeof POSE_LANDMARKS[number];
export interface PhotoPoint {
  key: LandmarkKey;
  x: number;
  y: number;
  confidence: number;
  confirmed: boolean;
  visible: boolean;
  adjusted: boolean;
}
export interface PhotoLine {
  id: string;
  label: string;
  from: LandmarkKey;
  to: LandmarkKey;
  degrees: number;
  color: 'green' | 'red';
}
export interface PhotoReviewRecord {
  id: string;
  view: PhotoView;
  side: 'L' | 'R';
  mirrored: boolean;
  recordedAt: string;
  ruleVersion: string;
  thresholdDegrees: number;
  landmarks: PhotoPoint[];
  lines: PhotoLine[];
}

export const PHOTO_RULE_VERSION = 'posture-photo-draft-v1-PENDING-HAMOON';
/** Illustration threshold only; NOT a validated posture diagnosis. */
export const DRAFT_LEVEL_THRESHOLD_DEGREES = 3;
export const MIN_CONFIDENCE = 0.6;
export const POSE_LANDMARKS = [
  'nose', 'left_eye_inner', 'left_eye', 'left_eye_outer', 'right_eye_inner',
  'right_eye', 'right_eye_outer', 'left_ear', 'right_ear', 'mouth_left',
  'mouth_right', 'left_shoulder', 'right_shoulder', 'left_elbow', 'right_elbow',
  'left_wrist', 'right_wrist', 'left_pinky', 'right_pinky', 'left_index',
  'right_index', 'left_thumb', 'right_thumb', 'left_hip', 'right_hip',
  'left_knee', 'right_knee', 'left_ankle', 'right_ankle', 'left_heel',
  'right_heel', 'left_foot_index', 'right_foot_index'
] as const;

export type RawPosePoint = { x: number; y: number; visibility?: number; presence?: number };
const clamp = (v: number) => Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0));
export function pointsFromDetection(detected: readonly RawPosePoint[]): PhotoPoint[] {
  return POSE_LANDMARKS.map((key, index) => {
    const p = detected[index];
    const confidence = p ? clamp(Math.min(p.visibility ?? 0, p.presence ?? p.visibility ?? 0)) : 0;
    return { key, x: clamp(p?.x ?? 0.5), y: clamp(p?.y ?? 0.5), confidence,
      visible: Boolean(p && Number.isFinite(p.x) && Number.isFinite(p.y)), confirmed: false, adjusted: false };
  });
}
export function confirmedForLine(point: PhotoPoint | undefined): point is PhotoPoint {
  return !!point && point.visible && point.confirmed && Number.isFinite(point.x) && Number.isFinite(point.y);
}
/** Angle in degrees from horizontal (level) or vertical (plumb). */
export function lineAngle(a: Pick<PhotoPoint, 'x' | 'y'>, b: Pick<PhotoPoint, 'x' | 'y'>, axis: 'level' | 'plumb', imageAspect = 1): number {
  // Normalize to physical image dimensions; normalized X and Y by themselves have different scales.
  const dx = (b.x - a.x) * imageAspect;
  const dy = b.y - a.y;
  if (Math.hypot(dx, dy) < 1e-9) return 0;
  return Math.round(Math.atan2(axis === 'level' ? Math.abs(dy) : Math.abs(dx),
    axis === 'level' ? Math.abs(dx) : Math.abs(dy)) * 180 / Math.PI * 10) / 10;
}
export function thresholdColor(degrees: number, threshold = DRAFT_LEVEL_THRESHOLD_DEGREES): 'green' | 'red' {
  return Math.abs(degrees) <= threshold ? 'green' : 'red';
}
function anatomicalKey(key: LandmarkKey, mirrored: boolean): LandmarkKey {
  if (!mirrored) return key;
  if (key.startsWith('left_')) return (`right_${key.slice(5)}`) as LandmarkKey;
  if (key.startsWith('right_')) return (`left_${key.slice(6)}`) as LandmarkKey;
  return key;
}
/** The anatomical label is distinct from the point's screen coordinate. */
export function landmarkLabel(key: LandmarkKey, view: PhotoView, mirrored: boolean): string {
  const corrected = anatomicalKey(key, mirrored);
  if (!corrected.startsWith('left_') && !corrected.startsWith('right_')) return corrected.replaceAll('_', ' ');
  const side = corrected.startsWith('left_') ? 'L' : 'R';
  const location = viewerSide(side, view);
  return `Client ${side} ${corrected.replace(/^(left|right)_/, '').replaceAll('_', ' ')} (${location})`;
}
function observedPair(left: LandmarkKey, right: LandmarkKey, mirrored: boolean): [LandmarkKey, LandmarkKey] {
  return mirrored ? [right, left] : [left, right];
}
export function photoLines(points: readonly PhotoPoint[], view: PhotoView, side: 'L' | 'R', mirrored: boolean,
  threshold = DRAFT_LEVEL_THRESHOLD_DEGREES, imageAspect = 1): PhotoLine[] {
  const byKey = new Map(points.map(p => [p.key, p]));
  const specs: { id: string; label: string; a: LandmarkKey; b: LandmarkKey; axis: 'level'|'plumb' }[] = [];
  if (view === 'side') {
    const detectedSide = mirrored ? (side === 'L' ? 'right' : 'left') : side === 'L' ? 'left' : 'right';
    const names = ['ear', 'shoulder', 'hip', 'knee', 'ankle'] as const;
    for (let i = 0; i < names.length - 1; i++) specs.push({
      id: `${names[i]}-${names[i + 1]}`, label: `${names[i]}–${names[i + 1]} from plumb`,
      a: `${detectedSide}_${names[i]}` as LandmarkKey, b: `${detectedSide}_${names[i + 1]}` as LandmarkKey, axis: 'plumb'
    });
  } else {
    for (const [id, label, name] of [
      ['head', 'Ear/head level (proxy)', 'ear'],
      ['shoulder', 'Shoulder level', 'shoulder'],
      ['hip', 'Hip level', 'hip'],
      ['knee', 'Knee level', 'knee']
    ] as const) {
      const [a, b] = observedPair(`left_${name}` as LandmarkKey, `right_${name}` as LandmarkKey, mirrored);
      specs.push({id, label, a, b, axis:'level'});
    }
  }
  return specs.flatMap(({id,label,a,b,axis}) => {
    const pa = byKey.get(a), pb = byKey.get(b);
    if (!confirmedForLine(pa) || !confirmedForLine(pb)) return [];
    if (Math.hypot((pb.x - pa.x) * imageAspect, pb.y - pa.y) < 1e-5) return [];
    const degrees = lineAngle(pa, pb, axis, imageAspect);
    return [{id,label,from:a,to:b,degrees,color:thresholdColor(degrees,threshold)}];
  });
}
/** Explicit whitelist: cannot accidentally persist object URLs, EXIF, image bytes, or image data URLs. */
export function createSavedPhotoReview(input: Pick<PhotoReviewRecord, 'id'|'view'|'side'|'mirrored'|'recordedAt'|'landmarks'>,
  imageAspect: number): PhotoReviewRecord {
  const landmarks = input.landmarks.filter(p => POSE_LANDMARKS.includes(p.key)).map(p => ({
    key: p.key, x: clamp(p.x), y: clamp(p.y), confidence: clamp(p.confidence),
    confirmed: Boolean(p.confirmed && p.visible), visible: Boolean(p.visible), adjusted: Boolean(p.adjusted)
  }));
  const thresholdDegrees = DRAFT_LEVEL_THRESHOLD_DEGREES;
  return {
    id: input.id, view: input.view, side: input.side, mirrored: Boolean(input.mirrored),
    recordedAt: input.recordedAt, ruleVersion: PHOTO_RULE_VERSION, thresholdDegrees, landmarks,
    lines: photoLines(landmarks,input.view,input.side,input.mirrored,thresholdDegrees,imageAspect)
  };
}
