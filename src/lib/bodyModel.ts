/**
 * Body model: joint positions for a simple articulated figure, the movements
 * the coach can play on it, and how posture / range-of-motion numbers are rated.
 * All angles are in degrees. "Left"/"right" are the client's own sides.
 */
import { ClientProfile, PostureAngles, RomMovement } from '../types';

export type View = 'front' | 'side';
export type Pt = [number, number];
export type Severity = 'ok' | 'watch' | 'work';

/** Everything the figure can do. Missing values = neutral standing. */
export interface Pose {
  // front view
  shAbdL?: number;
  shAbdR?: number;
  elFlexL?: number;
  elFlexR?: number;
  hipAbdL?: number;
  hipAbdR?: number;
  valgusL?: number;
  valgusR?: number;
  shoulderTilt?: number; // + = left shoulder lower
  pelvisTilt?: number; // + = left hip lower
  headTilt?: number; // + = toward the right shoulder
  /** seated, thighs toward the viewer: shins swing for hip rotation tests */
  seated?: boolean;
  hipRotL?: number; // + = internal (shin swings out)
  hipRotR?: number;
  // side view (client faces right)
  shFlex?: number;
  elFlex?: number;
  /** arm out to the side at 90°, elbow 90°: + = internal rotation (forearm down), − = external */
  shRot?: number;
  hipFlex?: number;
  kneeFlex?: number;
  ankleDorsi?: number; // shin forward over the foot
  /** frontal ankle projection: rotate each shin around a planted ankle */
  groundedFront?: boolean;
  ankleDorsiL?: number;
  ankleDorsiR?: number;
  trunkLean?: number; // + = forward
  headForward?: number;
  roundedShoulders?: number;
  /** feet stay on the floor (squat, lunge) instead of the hip staying put */
  grounded?: boolean;
}

export interface Joints {
  head: Pt;
  headR: number;
  neck: Pt;
  torso: Pt[];
  /** limbs as [from, to, thickness] in draw order (far side first) */
  limbs: { a: Pt; b: Pt; w: number; far?: boolean; key: string }[];
  hands: { p: Pt; far?: boolean }[];
  feet: { a: Pt; b: Pt; far?: boolean }[];
  /** named points for overlays */
  p: Record<string, Pt>;
}

const rad = (d: number) => (d * Math.PI) / 180;
const add = (a: Pt, len: number, angDown: number, side: 1 | -1 = 1): Pt =>
  // angle measured from straight down; side=+1 swings toward +x
  [a[0] + side * len * Math.sin(rad(angDown)), a[1] + len * Math.cos(rad(angDown))];
const rotAbout = (p: Pt, c: Pt, deg: number): Pt => {
  const r = rad(deg), dx = p[0] - c[0], dy = p[1] - c[1];
  return [c[0] + dx * Math.cos(r) - dy * Math.sin(r), c[1] + dx * Math.sin(r) + dy * Math.cos(r)];
};

const UA = 92, FA = 84, TH = 122, SH = 114, CX = 150;

/** Joint positions for a pose, in a 300 × 540 box. */
export function solve(view: View, pose: Pose = {}): Joints {
  return view === 'front' ? solveFront(pose) : solveSide(pose);
}

function solveFront(o: Pose): Joints {
  const st = o.shoulderTilt ?? 0, pt = o.pelvisTilt ?? 0;
  // the client's LEFT side is on the viewer's RIGHT (+x)
  const shC: Pt = [CX, 114];
  const shL = rotAbout([CX + 54, 114], shC, st);
  const shR = rotAbout([CX - 54, 114], shC, st);
  const hipC: Pt = [CX, 300];
  const hipL = rotAbout([CX + 30, 300], hipC, pt);
  const hipR = rotAbout([CX - 30, 300], hipC, pt);
  const neck: Pt = [CX, 98];
  const head = rotAbout([CX, 56], neck, -(o.headTilt ?? 0));

  const arm = (sh: Pt, abd: number, flex: number, s: 1 | -1) => {
    const el = add(sh, UA, abd, s);
    const wr = add(el, FA, abd + flex, s);
    return { el, wr };
  };
  const L = arm(shL, o.shAbdL ?? 6, o.elFlexL ?? 4, 1);
  const R = arm(shR, o.shAbdR ?? 6, o.elFlexR ?? 4, -1);

  let knL: Pt, knR: Pt, anL: Pt, anR: Pt;
  if (o.seated) {
    // thighs come toward the viewer: short, knees a little lower and wider
    knL = [hipL[0] + 8, hipL[1] + 46];
    knR = [hipR[0] - 8, hipR[1] + 46];
    anL = add(knL, SH, o.hipRotL ?? 0, 1);
    anR = add(knR, SH, o.hipRotR ?? 0, -1);
  } else if (o.groundedFront) {
    // The ankles remain planted while the shins angle over them.
    anL = [hipL[0] + 8, 536];
    anR = [hipR[0] - 8, 536];
    knL = [anL[0] + SH * Math.sin(rad(o.ankleDorsiL ?? 0)),
      anL[1] - SH * Math.cos(rad(o.ankleDorsiL ?? 0))];
    knR = [anR[0] - SH * Math.sin(rad(o.ankleDorsiR ?? 0)),
      anR[1] - SH * Math.cos(rad(o.ankleDorsiR ?? 0))];
  } else {
    knL = add(hipL, TH, o.hipAbdL ?? 3, 1);
    knR = add(hipR, TH, o.hipAbdR ?? 3, -1);
    anL = add(knL, SH, (o.hipAbdL ?? 3) - (o.valgusL ?? 0), 1);
    anR = add(knR, SH, (o.hipAbdR ?? 3) - (o.valgusR ?? 0), -1);
  }
  const toe = (an: Pt, s: 1 | -1): Pt => [an[0] + s * 16, an[1] + 10];

  const torso: Pt[] = [
    shR, shL,
    rotAbout([CX + 46, 158], shC, st),
    [CX + 36, 238],
    [hipL[0] + 14, hipL[1] - 4],
    [hipL[0] - 4, hipL[1] + 18],
    [hipR[0] + 4, hipR[1] + 18],
    [hipR[0] - 14, hipR[1] - 4],
    [CX - 36, 238],
    rotAbout([CX - 46, 158], shC, st)
  ];
  return {
    head, headR: 25, neck, torso,
    limbs: [
      { a: neck, b: [CX, 116], w: 18, key: 'neck' },
      { a: shL, b: L.el, w: 24, key: 'uaL' },
      { a: L.el, b: L.wr, w: 19, key: 'faL' },
      { a: shR, b: R.el, w: 24, key: 'uaR' },
      { a: R.el, b: R.wr, w: 19, key: 'faR' },
      { a: hipL, b: knL, w: o.seated ? 36 : 33, key: 'thL' },
      { a: knL, b: anL, w: 25, key: 'shL' },
      { a: hipR, b: knR, w: o.seated ? 36 : 33, key: 'thR' },
      { a: knR, b: anR, w: 25, key: 'shR' }
    ],
    hands: [{ p: L.wr }, { p: R.wr }],
    feet: [{ a: anL, b: toe(anL, 1) }, { a: anR, b: toe(anR, -1) }],
    p: { head, neck, shL, shR, elL: L.el, elR: R.el, wrL: L.wr, wrR: R.wr, hipL, hipR, knL, knR, anL, anR }
  };
}

function solveSide(o: Pose): Joints {
  const lean = o.trunkLean ?? 0;
  let hip: Pt, kn: Pt, an: Pt;
  if (o.grounded) {
    an = [CX - 4, 512];
    const a = o.ankleDorsi ?? 0, k = o.kneeFlex ?? 0;
    kn = [an[0] + SH * Math.sin(rad(a)), an[1] - SH * Math.cos(rad(a))];
    hip = [kn[0] + TH * Math.sin(rad(a - k)), kn[1] - TH * Math.cos(rad(a - k))];
  } else {
    hip = [CX, 300];
    const hf = o.hipFlex ?? 0, kf = o.kneeFlex ?? 0;
    kn = add(hip, TH, hf, 1);
    an = add(kn, SH, hf - kf, 1);
  }
  const up = (from: Pt, len: number, ang: number): Pt => [from[0] + len * Math.sin(rad(ang)), from[1] - len * Math.cos(rad(ang))];
  const shoulder = up(hip, 186, lean);
  const rs = o.roundedShoulders ?? 0;
  const sh: Pt = [shoulder[0] + rs * 0.9, shoulder[1] + rs * 0.2];
  const neck = up(shoulder, 18, lean);
  const head = up(neck, 40, lean + (o.headForward ?? 0));

  let el: Pt, wr: Pt, upperW = 24;
  if (o.shRot != null) {
    // arm points at the viewer: upper arm foreshortened, forearm rotates in the sagittal plane
    el = [sh[0] + 6, sh[1] + 4];
    upperW = 30;
    // 0° = forearm points forward; + internal rotation turns it down, − external turns it up
    wr = add(el, FA, 90 - o.shRot, 1);
  } else {
    const f = o.shFlex ?? 4;
    el = add(sh, UA, f, 1);
    wr = add(el, FA, f + (o.elFlex ?? 6), 1);
  }
  const lean2 = (p: Pt) => rotAbout(p, hip, lean);
  const torso: Pt[] = [
    lean2([CX - 16, 126]), lean2([CX + 14, 118]), lean2([CX + 38, 150]), lean2([CX + 36, 196]), lean2([CX + 28, 244]),
    lean2([CX + 26, 296]), lean2([CX - 2, 320]), lean2([CX - 32, 304]), lean2([CX - 26, 246]), lean2([CX - 34, 180])
  ].map((p) => [p[0] - CX + hip[0], p[1] - 300 + hip[1]] as Pt);
  const a = o.ankleDorsi ?? 0;
  const toe: Pt = [an[0] + 34, an[1] + 6 - (o.grounded ? 0 : a * 0.3)];
  // far side (behind): same pose, nudged back, drawn lighter
  const back = (q: Pt): Pt => [q[0] - 7, q[1] - 2];
  return {
    head, headR: 25, neck, torso,
    limbs: [
      { a: back(hip), b: back(kn), w: 32, key: 'thF', far: true },
      { a: back(kn), b: back(an), w: 24, key: 'shF', far: true },
      { a: back(sh), b: back(el), w: upperW - 2, key: 'uaF', far: true },
      { a: back(el), b: back(wr), w: 18, key: 'faF', far: true },
      { a: neck, b: up(neck, -16, lean), w: 18, key: 'neck' },
      { a: hip, b: kn, w: 34, key: 'th' },
      { a: kn, b: an, w: 25, key: 'sh' },
      { a: sh, b: el, w: upperW, key: 'ua' },
      { a: el, b: wr, w: 19, key: 'fa' }
    ],
    hands: [{ p: back(wr), far: true }, { p: wr }],
    feet: [{ a: back(an), b: back(toe), far: true }, { a: an, b: toe }],
    p: { head, neck, sh, el, wr, hip, kn, an, toe }
  };
}

// ---------------------------------------------------------------------------
// Movements the coach can play

export interface MovementDef {
  id: string;
  /** matching row id in SPECTRUM_ROWS / clientFindings */
  sopKey: string;
  label: string;
  /** name of the ROM test in the assessment (matches RomMovement.name) */
  romName?: string;
  view: View;
  normal: number;
  /** joint on the standing figure where this finding is anchored */
  joint: 'shoulder' | 'hip' | 'ankle';
  /** the joint the angle is measured at, and the moving limb end, for the arc */
  pivot: string;
  end: string;
  /** direction of 0° at the pivot, measured from straight down (side view) or outward-down (front) */
  zeroDown: number;
  /** pose for a value; side = which side moves in the front view */
  pose: (v: number, side: 'L' | 'R') => Pose;
  limited: string;
  tip: string;
  /** how the client is positioned for the test */
  setup?: string;
}

export const MOVEMENTS: MovementDef[] = [
  {
    id: 'shoulder-ir', sopKey: 'shoulder-ir', label: 'Shoulder internal rotation', romName: 'Shoulder internal rotation', view: 'side', normal: 90,
    joint: 'shoulder', pivot: 'el', end: 'wr', zeroDown: 90, pose: (v) => ({ shRot: v }),
    setup: '90/90 test: arm out to the side at 90°, elbow bent 90° pointing toward you. Forearm starts horizontal forward and rotates down.',
    limited: 'With limited internal rotation the shoulder blade tips forward and the humeral head glides forward to compensate during pressing or reaching.',
    tip: 'Cross-body posterior capsule stretch, low-trap/serratus work, and ribcage internal rotation (PRI).'
  },
  {
    id: 'shoulder-er', sopKey: 'shoulder-er', label: 'Shoulder external rotation', romName: 'Shoulder external rotation', view: 'side', normal: 90,
    joint: 'shoulder', pivot: 'el', end: 'wr', zeroDown: 90, pose: (v) => ({ shRot: -v }),
    setup: '90/90 test: arm out to the side at 90°, elbow bent 90° pointing toward you. Forearm starts horizontal forward and rotates up.',
    limited: 'Limited external rotation restricts overhead positioning and forces the lower back to arch or the elbow to flare during presses and pulls.',
    tip: 'Pec minor/lat release, thoracic extension, and apical chest expansion with external rotation.'
  },
  {
    id: 'shoulder-abd', sopKey: 'shoulder-abd', label: 'Shoulder abduction', romName: 'Shoulder abduction', view: 'front', normal: 45,
    joint: 'shoulder', pivot: 'sh', end: 'el', zeroDown: 0, pose: (v, s) => (s === 'L' ? { shAbdL: v, elFlexL: 2 } : { shAbdR: v, elFlexR: 2 }),
    setup: 'Pure glenohumeral abduction before the shoulder blade hikes or rotates upward (Full = 45°).',
    limited: 'If the arm stops early when lifted out to the side, the upper trap hikes the shoulder and the trunk leans away to finish the reach.',
    tip: 'Serratus anterior wall slides, humeral centration, and lateral ribcage expansion.'
  },
  {
    id: 'shoulder-flex', sopKey: 'shoulder-flex', label: 'Shoulder flexion', romName: 'Shoulder flexion', view: 'side', normal: 140,
    joint: 'shoulder', pivot: 'sh', end: 'el', zeroDown: 0, pose: (v) => ({ shFlex: v, elFlex: 4 }),
    setup: 'Raising the arm forward and overhead without arching the lower back or flaring the ribs (Full = 140°).',
    limited: 'When the arm can’t get overhead cleanly, the lower back arches and the ribs flare to make up the difference.',
    tip: 'Thoracic extension, lat and pec stretches, exhalation rib-control drills; press within the rib-stacked range.'
  },
  {
    id: 'hip-abd', sopKey: 'hip-abd', label: 'Hip abduction', romName: 'Hip abduction', view: 'front', normal: 45,
    joint: 'hip', pivot: 'hip', end: 'kn', zeroDown: 0, pose: (v, s) => (s === 'L' ? { hipAbdL: v } : { hipAbdR: v }),
    setup: 'Opening the leg out to the side while keeping the pelvis level and toes forward (Full = 45°).',
    limited: 'Limited hip abduction causes the pelvis to hike or rotate during single-leg stance, lateral lunges, and wide-stance squats.',
    tip: 'Adductor inhibition, side-lying glute medius work, and frontal-plane pelvis control.'
  },
  {
    id: 'hip-flex', sopKey: 'hip-flex', label: 'Hip flexion', romName: 'Hip flexion', view: 'side', normal: 140,
    joint: 'hip', pivot: 'hip', end: 'kn', zeroDown: 0, pose: (v) => ({ hipFlex: v, kneeFlex: Math.min(v * 0.75, 100) }),
    setup: 'Bringing the knee toward the chest with a neutral lumbar spine (Full = 140°).',
    limited: 'When hip flexion stops early, the pelvis tucks under (posterior tilt / butt wink) at the bottom of a squat or deadlift setup.',
    tip: 'Posterior hip capsule mobilization, 90/90 breathing with hamstring pull, and squat depth matched to hip range.'
  },
  {
    id: 'slr', sopKey: 'slr', label: 'Straight leg raise', romName: 'Straight leg raise', view: 'side', normal: 90,
    joint: 'hip', pivot: 'hip', end: 'an', zeroDown: 0, pose: (v) => ({ hipFlex: v, kneeFlex: 0 }),
    setup: 'Raising the straight leg with the knee locked and pelvis flat (Full = 90°).',
    limited: 'A limited straight leg raise reflects hamstring tension or anterior pelvic tilt blocking clean hip hinging.',
    tip: 'Core-engaged active straight leg raises, eccentric RDLs, and pelvic repositioning.'
  },
  {
    id: 'hip-ir', sopKey: 'hip-ir', label: 'Hip internal rotation', romName: 'Hip internal rotation', view: 'front', normal: 40,
    joint: 'hip', pivot: 'kn', end: 'an', zeroDown: 0, pose: (v, s) => ({ seated: true, ...(s === 'L' ? { hipRotL: v } : { hipRotR: v }) }),
    setup: 'Seated on a stool, knees bent 90°. The foot swings out = the hip turns in (Full = 40°).',
    limited: 'Limited hip internal rotation makes the knee cave in or the foot turn out in squats and lunges. Stress moves to the knee and lower back.',
    tip: '90/90 hip switches, hip IR lift-offs; PRI left AIC repositioning when asymmetrical.'
  },
  {
    id: 'hip-er', sopKey: 'hip-er', label: 'Hip external rotation', romName: 'Hip external rotation', view: 'front', normal: 45,
    joint: 'hip', pivot: 'kn', end: 'an', zeroDown: 0, pose: (v, s) => ({ seated: true, ...(s === 'L' ? { hipRotL: -v } : { hipRotR: -v }) }),
    setup: 'Seated on a stool, knees bent 90°. The foot swings in = the hip turns out (Full = 45°).',
    limited: 'With little external rotation the knee drifts inward and the pelvis rotates in single-leg work; deep squats feel blocked.',
    tip: '90/90 stretch, figure-4 stretch, glute med strength, and posterior hip expansion.'
  },
  {
    id: 'ankle-dorsiflexion', sopKey: 'ankle-dorsiflexion', label: 'Ankle dorsiflexion', romName: 'Ankle dorsiflexion', view: 'side', normal: 20,
    joint: 'ankle', pivot: 'an', end: 'kn', zeroDown: 180, pose: (v) => ({ grounded: true, ankleDorsi: v, kneeFlex: v * 1.4, trunkLean: v * 0.4, shFlex: 50 }),
    setup: 'Knee-to-wall lunge: the knee travels forward over the toes with the heel down (Full = 20°).',
    limited: 'A stiff ankle stops the knee from travelling over the toes: heels lift, the knee caves in, or the torso tips forward at the bottom of a squat.',
    tip: 'Knee-to-wall drill, calf/soleus stretch; heel-elevated squats while it improves.'
  }
];

/**
 * Project each ROM movement into both figures without changing BodyFigure.
 * In the non-natural view a foreshortened limb rotates around the SAME joint.
 * This is a visual projection, not a second clinical measurement.
 */
export function movementPose(m: MovementDef, view: View, value: number, side: 'L' | 'R'): Pose {
  if (view === m.view) return m.pose(value, side);
  const l = side === 'L';
  const arm = (abd: number, elbow: number): Pose => l
    ? { shAbdL: abd, elFlexL: elbow }
    : { shAbdR: abd, elFlexR: elbow };
  const leg = (abd: number, valgus = 0): Pose => l
    ? { hipAbdL: abd, valgusL: valgus }
    : { hipAbdR: abd, valgusR: valgus };
  switch (m.id) {
    // Shoulder 90/90 rotation: the projected FOREARM turns around the elbow.
    case 'shoulder-ir': return arm(70, value * 0.65);
    case 'shoulder-er': return arm(70, -value * 0.65);
    // Out-of-plane shoulder/hip motion is foreshortened in the other view.
    case 'shoulder-abd': return { shFlex: value * 0.65, elFlex: 2 };
    case 'shoulder-flex': return arm(value * 0.65, 4);
    case 'hip-abd': return { hipFlex: value * 0.65, kneeFlex: 0 };
    case 'hip-flex': return leg(value * 0.45);
    case 'slr': return leg(value * 0.45);
    // Seated hip IR/ER: rotate the SHIN about the knee in side view.
    case 'hip-ir': return { hipFlex: 0, kneeFlex: value * 0.65 };
    case 'hip-er': return { hipFlex: 0, kneeFlex: -value * 0.65 };
    // Dorsiflexion in front view: tibia inclines about the ankle.
    case 'ankle-dorsiflexion': return l
      ? { groundedFront: true, ankleDorsiL: value * 0.65 }
      : { groundedFront: true, ankleDorsiR: value * 0.65 };
    default: throw new Error(`Missing alternate movement pose: ${m.id}`);
  }
}

export function romFor(rom: RomMovement[], name?: string): RomMovement | undefined {
  if (!name) return undefined;
  return rom.find((r) => r.name.toLowerCase() === name.toLowerCase());
}

/** Latest ROM: the newest saved assessment, otherwise the one in progress. */
export function latestRom(c: ClientProfile): RomMovement[] {
  const a = c.assessments ?? [];
  const last = a[a.length - 1];
  const rom = last?.rom?.length ? last.rom : c.rom ?? [];
  return rom.filter((r) => r.left > 0 || r.right > 0);
}

export function rateRom(value: number, normal: number): Severity {
  if (!normal) return 'ok';
  const r = value / normal;
  return r >= 0.9 ? 'ok' : r >= 0.7 ? 'watch' : 'work';
}

/** Plain text, no percentages: "Right 8° less than left". */
export function sideDifference(left: number, right: number): string {
  const d = Math.round(Math.abs(left - right));
  if (d < 1) return 'Even both sides';
  return left < right ? `Left ${d}° less than right` : `Right ${d}° less than left`;
}

// ---------------------------------------------------------------------------
// Posture

export interface PostureDef {
  key: keyof PostureAngles;
  label: string;
  view: View;
  /** limits for ok / watch (absolute degrees) */
  ok: number;
  watch: number;
  describe: (v: number) => string;
  meaning: string;
}

export const POSTURE: PostureDef[] = [
  { key: 'shoulderTilt', label: 'Shoulder height', view: 'front', ok: 1, watch: 3,
    describe: (v) => (Math.abs(v) < 0.5 ? 'Level' : `${v > 0 ? 'Left' : 'Right'} ${Math.abs(v)}° lower`),
    meaning: 'A lower shoulder often comes with a ribcage/pelvis rotation and a tighter side; it changes how load is shared between arms.' },
  { key: 'pelvisTilt', label: 'Pelvis level', view: 'front', ok: 2, watch: 4,
    describe: (v) => (Math.abs(v) < 0.5 ? 'Level' : `${v > 0 ? 'Left' : 'Right'} hip ${Math.abs(v)}° lower`),
    meaning: 'An uneven pelvis shifts weight to one leg and is common with a left AIC pattern; it shows up as uneven squats and gait.' },
  { key: 'headTilt', label: 'Head tilt', view: 'front', ok: 1, watch: 3,
    describe: (v) => (Math.abs(v) < 0.5 ? 'Straight' : `${Math.abs(v)}° to the ${v > 0 ? 'right' : 'left'}`),
    meaning: 'Head tilt usually follows the shoulders and neck muscles on one side.' },
  { key: 'kneeValgusL', label: 'Left knee alignment', view: 'front', ok: 3, watch: 8,
    describe: (v) => (Math.abs(v) < 0.5 ? 'Straight' : `${Math.abs(v)}° ${v > 0 ? 'inward' : 'outward'}`),
    meaning: 'A knee that caves in is often driven by limited hip rotation, ankle stiffness or weak glutes.' },
  { key: 'kneeValgusR', label: 'Right knee alignment', view: 'front', ok: 3, watch: 8,
    describe: (v) => (Math.abs(v) < 0.5 ? 'Straight' : `${Math.abs(v)}° ${v > 0 ? 'inward' : 'outward'}`),
    meaning: 'A knee that caves in is often driven by limited hip rotation, ankle stiffness or weak glutes.' },
  { key: 'headForward', label: 'Head forward', view: 'side', ok: 5, watch: 12,
    describe: (v) => `${Math.abs(v)}° from vertical`,
    meaning: 'A forward head adds load to the neck and upper back and often pairs with rounded shoulders.' },
  { key: 'roundedShoulders', label: 'Rounded shoulders', view: 'side', ok: 5, watch: 10,
    describe: (v) => `${Math.abs(v)}°`,
    meaning: 'Rounded shoulders limit overhead reach and shoulder rotation.' },
  { key: 'trunkLean', label: 'Trunk lean', view: 'side', ok: 3, watch: 6,
    describe: (v) => `${Math.abs(v)}° ${v >= 0 ? 'forward' : 'back'}`,
    meaning: 'Standing with the trunk leaning changes where the weight sits over the feet.' }
];

export function ratePosture(def: PostureDef, v: number | undefined): Severity | null {
  if (v == null || Number.isNaN(v)) return null;
  const a = Math.abs(v);
  return a <= def.ok ? 'ok' : a <= def.watch ? 'watch' : 'work';
}

/** Posture angles as a pose for the figure. */
export function postureToPose(p: PostureAngles | undefined, view: View): Pose {
  if (!p) return {};
  return view === 'front'
    ? { shoulderTilt: p.shoulderTilt, pelvisTilt: p.pelvisTilt, headTilt: p.headTilt, valgusL: p.kneeValgusL, valgusR: p.kneeValgusR }
    : { headForward: p.headForward, roundedShoulders: p.roundedShoulders, trunkLean: p.trunkLean };
}

export const SEVERITY_COLOR: Record<Severity, string> = { ok: '#16A34A', watch: '#F59E0B', work: '#EF4444' };
