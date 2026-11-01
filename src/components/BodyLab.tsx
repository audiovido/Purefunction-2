import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pause, Play, RotateCcw } from 'lucide-react';
import { ClientProfile, PostureAngles } from '../types';
import {
  MOVEMENTS,
  MovementDef,
  POSTURE,
  PostureDef,
  SEVERITY_COLOR,
  Severity,
  View,
  latestRom,
  postureToPose,
  ratePosture,
  rateRom,
  romFor,
  sideDifference,
  solve
} from '../lib/bodyModel';
import { BodyFigure, FigureArc, FigureLabel, FigureLine } from './BodyFigure';
import { todayISO } from '../lib/workouts';

const pill = 'px-3.5 py-1.5 rounded-full text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap';
const sevBg: Record<Severity, string> = { ok: 'bg-green-50 text-green-700', watch: 'bg-amber-50 text-amber-800', work: 'bg-red-50 text-red-700' };
const sevText: Record<Severity, string> = { ok: 'OK', watch: 'Watch', work: 'Work on' };

/** 0 → 1 → hold → 0 loop while playing. */
function useCycle(playing: boolean, resetKey: string) {
  const [t, setT] = useState(0);
  const start = useRef(0);
  useEffect(() => {
    start.current = performance.now();
    setT(0);
  }, [resetKey]);
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const UP = 1700, HOLD = 1400, DOWN = 1200, REST = 500, ALL = UP + HOLD + DOWN + REST;
    const ease = (x: number) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);
    const tick = (now: number) => {
      const e = (now - start.current) % ALL;
      const v = e < UP ? ease(e / UP) : e < UP + HOLD ? 1 : e < UP + HOLD + DOWN ? 1 - ease((e - UP - HOLD) / DOWN) : 0;
      setT(v);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, resetKey]);
  return [t, setT] as const;
}

const screenDeg = (from: [number, number], to: [number, number]) => (Math.atan2(to[1] - from[1], to[0] - from[0]) * 180) / Math.PI;

/**
 * Interactive body: posture in degrees on the figure, and movements that play
 * (arm, hip, ankle open and close) with the client’s real range vs normal.
 */
export const BodyLab: React.FC<{
  client: ClientProfile;
  onUpdateClient?: (c: ClientProfile) => void;
  compact?: boolean;
}> = ({ client, onUpdateClient, compact }) => {
  const rom = useMemo(() => latestRom(client), [client]);
  const posture = client.posture ?? {};
  const hasPosture = POSTURE.some((d) => posture[d.key] != null);
  const [mode, setMode] = useState<'posture' | 'movement'>(hasPosture || !rom.length ? 'posture' : 'movement');
  const [view, setView] = useState<View>('front');
  const movesWithData = MOVEMENTS.filter((m) => romFor(rom, m.romName));
  const [moveId, setMoveId] = useState<string>((movesWithData[0] ?? MOVEMENTS[0]).id);
  const move = MOVEMENTS.find((m) => m.id === moveId) ?? MOVEMENTS[0];
  const data = romFor(rom, move.romName);
  const worse: 'L' | 'R' = data ? (data.left <= data.right ? 'L' : 'R') : 'L';
  const [sideSel, setSideSel] = useState<'L' | 'R' | null>(null);
  const side = sideSel ?? worse;
  const [playing, setPlaying] = useState(true);
  const [t, setT] = useCycle(playing && mode === 'movement', `${moveId}-${side}`);

  const normal = data?.normalMax || move.normal;
  const target = data ? (side === 'L' ? data.left : data.right) : normal;

  const setPosture = (key: keyof PostureAngles, raw: string) => {
    if (!onUpdateClient) return;
    const v = raw === '' ? undefined : Number(raw);
    onUpdateClient({ ...client, posture: { ...posture, [key]: v, measuredOn: todayISO() } });
  };

  // ---------------- figure content
  let figure: React.ReactNode;
  if (mode === 'posture') {
    const pose = postureToPose(posture, view);
    const j = solve(view, pose);
    const labels: FigureLabel[] = [];
    const dots: Record<string, string> = {};
    const lines: FigureLine[] = [];
    const defs = POSTURE.filter((d) => d.view === view);
    const anchor: Record<string, { at: [number, number]; side: 'left' | 'right'; dots: string[]; dy?: number }> =
      view === 'front'
        ? {
            shoulderTilt: { at: j.p.shL, side: 'right', dots: ['shL', 'shR'], dy: -34 },
            pelvisTilt: { at: j.p.hipL, side: 'right', dots: ['hipL', 'hipR'], dy: -10 },
            headTilt: { at: [j.p.head[0] - 26, j.p.head[1]], side: 'left', dots: [], dy: -20 },
            kneeValgusL: { at: j.p.knL, side: 'right', dots: ['knL'] },
            kneeValgusR: { at: j.p.knR, side: 'left', dots: ['knR'] }
          }
        : {
            headForward: { at: [j.p.head[0] + 26, j.p.head[1]], side: 'right', dots: [], dy: -26 },
            roundedShoulders: { at: j.p.sh, side: 'right', dots: ['sh'], dy: 8 },
            trunkLean: { at: j.p.hip, side: 'right', dots: ['hip'], dy: 20 }
          };
    defs.forEach((d) => {
      const v = posture[d.key] as number | undefined;
      const sev = ratePosture(d, v);
      const a = anchor[d.key];
      if (!a || sev == null) return;
      const c = SEVERITY_COLOR[sev];
      a.dots.forEach((k) => (dots[k] = c));
      labels.push({ at: a.at, side: a.side, color: c, text: d.describe(v!), dy: a.dy });
    });
    if (view === 'front') {
      const sv = ratePosture(POSTURE[0], posture.shoulderTilt);
      if (sv) lines.push({ a: [j.p.shR[0] - 22, j.p.shR[1] - (j.p.shL[1] - j.p.shR[1]) * 0.4], b: [j.p.shL[0] + 22, j.p.shL[1] + (j.p.shL[1] - j.p.shR[1]) * 0.4], color: SEVERITY_COLOR[sv] });
      const pv = ratePosture(POSTURE[1], posture.pelvisTilt);
      if (pv) lines.push({ a: [j.p.hipR[0] - 26, j.p.hipR[1] - (j.p.hipL[1] - j.p.hipR[1]) * 0.45], b: [j.p.hipL[0] + 26, j.p.hipL[1] + (j.p.hipL[1] - j.p.hipR[1]) * 0.45], color: SEVERITY_COLOR[pv] });
      if (sv) lines.push({ a: [j.p.shR[0] - 22, j.p.shR[1]], b: [j.p.shL[0] + 22, j.p.shR[1]], color: '#CBD5E1', dashed: true, width: 1.2 });
    } else {
      lines.push({ a: [j.p.neck[0], j.p.neck[1]], b: [j.p.neck[0], j.p.neck[1] - 60], color: '#CBD5E1', dashed: true, width: 1.2 });
    }
    figure = <BodyFigure view={view} pose={pose} dots={dots} labels={labels} lines={lines} plumb showJoints className="w-full h-full" title="Posture" />;
  } else {
    const v = target * t;
    const pose = move.pose(v, side);
    const j = solve(move.view, pose);
    const arcs: FigureArc[] = [];
    const sideKey = (k: string) => (move.view === 'front' ? `${k}${side}` : k);
    if (move.pivot) {
      const c = j.p[sideKey(move.pivot)];
      const e = j.p[sideKey(move.end)];
      const sign = move.view === 'front' && side === 'R' ? -1 : 1;
      // zero direction: angle from straight down, toward +x for sign=1
      const zr = (move.zeroDown * Math.PI) / 180;
      const zeroScreen = (Math.atan2(Math.cos(zr), sign * Math.sin(zr)) * 180) / Math.PI;
      const sev = data ? rateRom(target, normal) : 'ok';
      arcs.push({ center: c, fromDeg: zeroScreen, toDeg: screenDeg(c, e), color: SEVERITY_COLOR[sev], r: move.id === 'shoulder-ir' ? 52 : 48, text: `${Math.round(v)}°` });
    }
    const ghostKeys = move.view === 'front' ? (move.pivot === 'sh' ? [`ua${side}`, `fa${side}`] : [`sh${side}`]) : move.pivot === 'an' ? ['th', 'sh'] : ['ua', 'fa'];
    const showGhost = data && target < normal * 0.97 && t > 0.98;
    figure = (
      <BodyFigure
        view={move.view}
        pose={pose}
        ghost={showGhost ? move.pose(normal, side) : undefined}
        ghostKeys={ghostKeys}
        arcs={arcs}
        className="w-full h-full"
        title={move.label}
      />
    );
  }

  // ---------------- side panel
  const postureRow = (d: PostureDef) => {
    const v = posture[d.key] as number | undefined;
    const sev = ratePosture(d, v);
    return (
      <div key={d.key} className="py-2.5 border-b border-gray-100 last:border-0">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-[#111827]">{d.label}</div>
            <div className="text-xs text-gray-500">{v != null ? d.describe(v) : 'Not measured'} · OK ≤ {d.ok}°</div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {sev && <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${sevBg[sev]}`}>{sevText[sev]}</span>}
            {onUpdateClient && (
              <label className="flex items-center border border-gray-200 rounded-full pl-3 pr-2 py-1 bg-white">
                <input
                  type="number"
                  step="0.5"
                  inputMode="decimal"
                  value={v ?? ''}
                  onChange={(e) => setPosture(d.key, e.target.value)}
                  aria-label={`${d.label} in degrees`}
                  className="w-12 text-sm font-semibold text-right focus:outline-none bg-transparent"
                />
                <span className="text-xs text-gray-400 ml-0.5">°</span>
              </label>
            )}
          </div>
        </div>
        {sev && sev !== 'ok' && <p className="text-xs text-gray-500 mt-1.5 leading-relaxed">{d.meaning}</p>}
      </div>
    );
  };

  const movePanel = (m: MovementDef) => {
    const sevL = data ? rateRom(data.left, normal) : null;
    const sevR = data ? rateRom(data.right, normal) : null;
    return (
      <div className="space-y-3">
        <div>
          <div className="text-base font-bold text-[#111827]">{m.label}</div>
          <div className="text-xs text-gray-500">Normal range: up to {normal}°</div>
          {m.setup && <div className="text-xs text-gray-500 mt-1">{m.setup}</div>}
        </div>
        {data ? (
          <div className="grid grid-cols-2 gap-2">
            {(['L', 'R'] as const).map((s) => {
              const val = s === 'L' ? data.left : data.right;
              const sev = s === 'L' ? sevL! : sevR!;
              return (
                <button
                  key={s}
                  onClick={() => setSideSel(s)}
                  className={`text-left rounded-2xl border px-4 py-3 cursor-pointer transition-colors ${side === s ? 'border-[#111827] bg-[#111827] text-white' : 'border-gray-200 bg-white'}`}
                >
                  <div className={`text-xs font-semibold ${side === s ? 'text-gray-300' : 'text-gray-500'}`}>{s === 'L' ? 'Left' : 'Right'}</div>
                  <div className="text-2xl font-bold tabular-nums">{val}°</div>
                  <span className={`inline-block mt-1 text-[10.5px] font-bold px-2 py-0.5 rounded-full ${sevBg[sev]}`}>{sevText[sev]}</span>
                </button>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-gray-500">Not measured yet — showing the normal range. Add it in “New assessment › Range of motion”.</p>
        )}
        {data && <div className="text-sm font-semibold text-[#111827]">{sideDifference(data.left, data.right)}</div>}
        <div className="rounded-2xl bg-amber-50/70 border border-amber-100 p-3.5">
          <div className="text-xs font-bold text-amber-900 mb-1">If it’s limited</div>
          <p className="text-[13px] text-amber-950/80 leading-relaxed">{m.limited}</p>
        </div>
        <div className="rounded-2xl bg-gray-50 border border-gray-100 p-3.5">
          <div className="text-xs font-bold text-gray-700 mb-1">What helps</div>
          <p className="text-[13px] text-gray-600 leading-relaxed">{m.tip}</p>
        </div>
      </div>
    );
  };

  return (
    <section className="bg-white rounded-[28px] border border-gray-100 shadow-[0_2px_14px_rgba(0,0,0,0.04)] p-4 sm:p-6 mb-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-lg font-bold text-[#111827]">Body map</h2>
          <p className="text-xs text-gray-500">
            {mode === 'posture' ? 'Standing posture in degrees' : 'Tap a movement to see it — client’s range vs normal'}
            {mode === 'posture' && posture.measuredOn ? ` · measured ${posture.measuredOn}` : ''}
          </p>
        </div>
        <div className="inline-flex bg-gray-100 rounded-full p-1">
          {(['posture', 'movement'] as const).map((m) => (
            <button key={m} onClick={() => setMode(m)} className={`${pill} ${mode === m ? 'bg-[#111827] text-white' : 'text-gray-600'}`}>
              {m === 'posture' ? 'Posture' : 'Movement'}
            </button>
          ))}
        </div>
      </div>

      {mode === 'movement' && (
        <div className="flex gap-2 overflow-x-auto pb-2 mb-2 -mx-1 px-1">
          {MOVEMENTS.map((m) => {
            const d = romFor(rom, m.romName);
            const sev = d ? rateRom(Math.min(d.left, d.right), d.normalMax || m.normal) : null;
            return (
              <button
                key={m.id}
                onClick={() => {
                  setMoveId(m.id);
                  setSideSel(null);
                  setPlaying(true);
                }}
                className={`${pill} border flex items-center gap-1.5 ${moveId === m.id ? 'bg-[#FFC809] border-[#FFC809] text-[#111827]' : 'bg-white border-gray-200 text-gray-600'}`}
              >
                {sev && <span className="w-2 h-2 rounded-full" style={{ background: SEVERITY_COLOR[sev] }} />}
                {m.label}
              </button>
            );
          })}
        </div>
      )}

      <div className={`grid gap-5 ${compact ? '' : 'lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]'}`}>
        <div className="relative rounded-[24px] border border-gray-100 bg-[radial-gradient(circle_at_50%_38%,#ffffff,#F1F3F6)] overflow-hidden">
          <div className="absolute left-3 top-3 z-10 flex gap-1.5">
            {mode === 'posture' ? (
              (['front', 'side'] as const).map((v) => (
                <button key={v} onClick={() => setView(v)} className={`${pill} border ${view === v ? 'bg-[#111827] border-[#111827] text-white' : 'bg-white border-gray-200 text-gray-600'}`}>
                  {v === 'front' ? 'Front' : 'Side'}
                </button>
              ))
            ) : (
              <span className={`${pill} bg-white border border-gray-200 text-gray-600`}>
                {move.view === 'front' ? `${side === 'L' ? 'Left' : 'Right'} side` : 'Side view'}
              </span>
            )}
          </div>
          {mode === 'movement' && (
            <div className="absolute right-3 top-3 z-10 flex gap-1.5">
              <button onClick={() => setPlaying(!playing)} aria-label={playing ? 'Pause' : 'Play'} className="w-9 h-9 rounded-full bg-[#111827] text-white flex items-center justify-center cursor-pointer">
                {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              </button>
              <button onClick={() => { setPlaying(false); setT(1); }} aria-label="Show end of range" className="w-9 h-9 rounded-full bg-white border border-gray-200 flex items-center justify-center cursor-pointer">
                <RotateCcw className="w-4 h-4" />
              </button>
            </div>
          )}
          <div className={`mx-auto ${compact ? 'h-[360px]' : 'h-[440px] sm:h-[520px]'} pt-10 pb-2`}>{figure}</div>
          {mode === 'movement' && (
            <div className="px-4 pb-4">
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={t}
                onChange={(e) => {
                  setPlaying(false);
                  setT(Number(e.target.value));
                }}
                aria-label="Scrub movement"
                className="w-full accent-[#111827]"
              />
              <div className="flex justify-between text-[11px] text-gray-500">
                <span>Start</span>
                <span>
                  {data ? `${side === 'L' ? 'Left' : 'Right'} ${target}°` : ''} · normal {normal}°
                </span>
              </div>
              {data && target < normal * 0.97 && <div className="text-[11px] text-gray-500 mt-1">Shaded limb = where a normal range would reach.</div>}
            </div>
          )}
        </div>

        <div className="min-w-0">
          {mode === 'posture' ? (
            <>
              <div className="flex gap-1.5 mb-2">
                <span className="flex items-center gap-1.5 text-[11px] text-gray-500"><i className="w-2 h-2 rounded-full bg-green-600 inline-block" /> OK</span>
                <span className="flex items-center gap-1.5 text-[11px] text-gray-500"><i className="w-2 h-2 rounded-full bg-amber-500 inline-block" /> Watch</span>
                <span className="flex items-center gap-1.5 text-[11px] text-gray-500"><i className="w-2 h-2 rounded-full bg-red-500 inline-block" /> Work on</span>
              </div>
              {POSTURE.filter((d) => d.view === view).map(postureRow)}
              {!hasPosture && (
                <p className="text-xs text-gray-500 mt-3">
                  {onUpdateClient ? 'Type the angles you measured (from the photo or by eye). The figure updates as you type.' : 'Your coach hasn’t measured posture yet.'}
                </p>
              )}
            </>
          ) : (
            movePanel(move)
          )}
        </div>
      </div>
    </section>
  );
};
