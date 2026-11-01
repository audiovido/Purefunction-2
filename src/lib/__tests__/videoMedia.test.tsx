import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ExerciseVideoPlayer } from '../../components/ExerciseMedia';

vi.mock('../../cloud/Session', () => ({
  useSession: () => ({ profile: { role: 'client' } })
}));
vi.mock('../../state/ExerciseLibrary', () => ({
  useExerciseLibrary: () => ({ showUnlicensedVideos: true })
}));

describe('client media safety', () => {
  it('renders cues instead of embedding an unlicensed YouTube video', () => {
    const html = renderToStaticMarkup(
      <ExerciseVideoPlayer
        video={{ kind: 'youtube', src: 'not-licensed-123', addedAt: '2026-11-01T00:00:00Z' }}
        title="Squat" viewer="client" cues={['Keep ribs stacked', 'Breathe out']}
      />
    );
    expect(html).toContain('Video coming soon');
    expect(html).toContain('Keep ribs stacked');
    expect(html).not.toContain('<iframe');
    expect(html).not.toContain('<video');
    expect(html).not.toContain('not-licensed-123');
  });
});
