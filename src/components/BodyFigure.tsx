import React from 'react';
import { Joints, Pose, Pt, View, solve } from '../lib/bodyModel';

export interface FigureLabel {
  at: Pt;
  text: string;
  color: string;
  /** which side of the figure the tag sits on */
  side: 'left' | 'right';
  dy?: number;
}

export interface FigureLine {
  a: Pt;
  b: Pt;
  color: string;
  dashed?: boolean;
  width?: number;
}

export interface FigureArc {
  center: Pt;
  fromDeg: number; // screen angle in degrees (0 = +x, 90 = down)
  toDeg: number;
  color: string;
  r?: number;
  text?: string;
}

const OUTLINE = '#1F2937';
const FILL = '#FFFFFF';

/** Clean line-art body (one continuous outline). Animate by passing a new pose. */
export const BodyFigure: React.FC<{
  view: View;
  pose?: Pose;
  ghost?: Pose;
  ghostKeys?: string[];
  dots?: Record<string, string>;
  showJoints?: boolean;
  lines?: FigureLine[];
  arcs?: FigureArc[];
  labels?: FigureLabel[];
  plumb?: boolean;
  className?: string;
  title?: string;
}> = ({ view, pose, ghost, ghostKeys, dots, showJoints, lines, arcs, labels, plumb, className, title }) => {
  const j = solve(view, pose);
  const g = ghost ? solve(view, ghost) : null;
  const pts = (ps: Pt[]) => ps.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');

  // in the side view the near arm is drawn as its own layer so it stays visible over the chest
  const TOP = view === 'side' ? ['ua', 'fa'] : [];
  const part = (jj: Joints, stroke: string, extra: number, far: boolean | undefined, torso: boolean, only?: string[]) => (
    <g stroke={stroke} strokeLinecap="round" strokeLinejoin="round" fill={stroke}>
      {torso && <polygon points={pts(jj.torso)} strokeWidth={18 + extra} />}
      {jj.limbs.filter((l) => !!l.far === !!far && (only ? only.includes(l.key) : !TOP.includes(l.key))).map((l) => (
        <line key={l.key} x1={l.a[0]} y1={l.a[1]} x2={l.b[0]} y2={l.b[1]} strokeWidth={l.w + extra} />
      ))}
      {jj.hands.filter((h) => !!h.far === !!far && (only ? true : TOP.length === 0)).map((h, i) => (
        <circle key={i} cx={h.p[0]} cy={h.p[1]} r={9 + extra / 2} strokeWidth={0} />
      ))}
      {!only && jj.feet.filter((f) => !!f.far === !!far).map((f, i) => (
        <line key={i} x1={f.a[0]} y1={f.a[1]} x2={f.b[0]} y2={f.b[1]} strokeWidth={13 + extra} />
      ))}
      {torso && <circle cx={jj.head[0]} cy={jj.head[1]} r={jj.headR + extra / 2} strokeWidth={0} />}
    </g>
  );

  const arcPath = (a: FigureArc) => {
    const r = a.r ?? 34;
    const p = (deg: number): Pt => [a.center[0] + r * Math.cos((deg * Math.PI) / 180), a.center[1] + r * Math.sin((deg * Math.PI) / 180)];
    let d = a.toDeg - a.fromDeg;
    while (d > 180) d -= 360;
    while (d < -180) d += 360;
    const s = p(a.fromDeg), e = p(a.fromDeg + d);
    return { d: `M${a.center[0]},${a.center[1]} L${s[0]},${s[1]} A${r},${r} 0 0 ${d > 0 ? 1 : 0} ${e[0]},${e[1]} Z`, mid: p(a.fromDeg + d / 2) };
  };

  const tag = (l: FigureLabel, i: number) => {
    const w = l.text.length * 6.6 + 18;
    const x = l.side === 'right' ? 308 - w : -8;
    const y = l.at[1] + (l.dy ?? 0);
    const lx = l.side === 'right' ? x : x + w;
    return (
      <g key={i}>
        <line x1={l.at[0]} y1={l.at[1]} x2={lx} y2={y} stroke={l.color} strokeWidth={1.2} />
        <rect x={x} y={y - 11} width={w} height={22} rx={11} fill={l.color} />
        <text x={x + w / 2} y={y + 4} fontSize={11.5} fontWeight={700} textAnchor="middle" fill={l.color === '#F59E0B' || l.color === '#FFC809' ? '#111827' : '#fff'}>
          {l.text}
        </text>
      </g>
    );
  };

  return (
    <svg viewBox="-10 -70 320 620" className={className} role="img" aria-label={title ?? 'Body model'}>
      <defs>
        <radialGradient id="pf-floor" cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#111827" stopOpacity="0.12" />
          <stop offset="1" stopColor="#111827" stopOpacity="0" />
        </radialGradient>
      </defs>
      {pose?.seated ? (
        <rect x={84} y={312} width={132} height={14} rx={7} fill="#E5E7EB" stroke="#CBD5E1" />
      ) : (
        <ellipse cx={150} cy={528} rx={78} ry={8} fill="url(#pf-floor)" />
      )}
      {plumb && <line x1={view === 'front' ? 150 : j.p.an[0] + 4} y1={10} x2={view === 'front' ? 150 : j.p.an[0] + 4} y2={530} stroke="#9CA3AF" strokeDasharray="3 6" />}
      {g && (
        <g opacity={0.22}>
          {g.limbs
            .filter((l) => !ghostKeys || ghostKeys.includes(l.key))
            .map((l) => (
              <line key={l.key} x1={l.a[0]} y1={l.a[1]} x2={l.b[0]} y2={l.b[1]} stroke="#94A3B8" strokeWidth={l.w} strokeLinecap="round" fill="none" />
            ))}
        </g>
      )}
      {part(j, '#9CA3AF', 3, true, false)}
      {part(j, '#F1F3F6', 0, true, false)}
      {part(j, OUTLINE, 3.2, false, true)}
      {part(j, FILL, 0, false, true)}
      {TOP.length > 0 && part(j, OUTLINE, 3.2, false, false, TOP)}
      {TOP.length > 0 && part(j, FILL, 0, false, false, TOP)}
      {/* soft inner shading lines like an anatomy chart */}
      <g stroke="#CBD5E1" strokeWidth={1} fill="none" strokeDasharray="3 4">
        {view === 'front' ? (
          <>
            <path d={`M${j.p.shL[0] - 10},${j.p.shL[1] + 6} Q${150 + 22},176 ${150 + 16},236`} />
            <path d={`M${j.p.shR[0] + 10},${j.p.shR[1] + 6} Q${150 - 22},176 ${150 - 16},236`} />
            <path d={`M${j.p.hipR[0] - 6},${j.p.hipR[1] - 6} L150,${(j.p.hipL[1] + j.p.hipR[1]) / 2 + 22} L${j.p.hipL[0] + 6},${j.p.hipL[1] - 6}`} />
          </>
        ) : null}
      </g>
      {lines?.map((l, i) => (
        <line key={i} x1={l.a[0]} y1={l.a[1]} x2={l.b[0]} y2={l.b[1]} stroke={l.color} strokeWidth={l.width ?? 2.4} strokeDasharray={l.dashed ? '4 4' : undefined} strokeLinecap="round" />
      ))}
      {arcs?.map((a, i) => {
        const { d, mid } = arcPath(a);
        return (
          <g key={i}>
            <path d={d} fill={a.color} fillOpacity={0.16} stroke={a.color} strokeWidth={1.6} />
            {a.text && (
              <text x={mid[0]} y={mid[1]} dy={4} fontSize={14} fontWeight={800} textAnchor="middle" fill={a.color} stroke="#fff" strokeWidth={3} paintOrder="stroke">
                {a.text}
              </text>
            )}
          </g>
        );
      })}
      {(showJoints || dots) &&
        Object.entries(j.p)
          .filter(([k]) => k !== 'head' && k !== 'neck' && k !== 'toe')
          .map(([k, p]) => {
            const c = dots?.[k];
            if (!showJoints && !c) return null;
            return (
              <g key={k}>
                {c && <circle cx={p[0]} cy={p[1]} r={11} fill={c} opacity={0.18} />}
                <circle cx={p[0]} cy={p[1]} r={c ? 5.5 : 3.6} fill={c ?? '#fff'} stroke="#111827" strokeWidth={1.3} />
              </g>
            );
          })}
      {labels?.map(tag)}
    </svg>
  );
};
