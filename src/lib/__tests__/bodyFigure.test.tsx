import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BodyFigure } from '../../components/BodyFigure';
import { MOVEMENTS } from '../bodyModel';

// Guard for redesigns of the human drawing: it must render for every pose the app uses.
describe('BodyFigure', () => {
  it('renders standing front and side', () => {
    for (const view of ['front', 'side'] as const) {
      const html = renderToStaticMarkup(<BodyFigure view={view} />);
      expect(html).toContain('<svg');
    }
  });
  it('renders every movement at start, middle and end of range', () => {
    for (const m of MOVEMENTS) {
      for (const f of [0, 0.5, 1]) {
        for (const side of ['L', 'R'] as const) {
          const html = renderToStaticMarkup(
            <BodyFigure view={m.view} pose={m.pose(m.normal * f, side)} ghost={m.pose(m.normal, side)} arcs={[{ center: [150, 120], fromDeg: 90, toDeg: 150, color: '#F59E0B', text: '45°' }]} labels={[{ at: [150, 120], text: 'Test', color: '#EF4444', side: 'left' }]} />
          );
          expect(html).not.toContain('NaN');
        }
      }
    }
  });
});
