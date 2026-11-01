import { describe, expect, it } from 'vitest';
import type { Exercise, ExerciseVideo } from '../../types';
import { searchExercises } from '../exerciseSearch';
import importedCatalog from '../../data/exerciseCatalog.json';
import { canViewExerciseVideo, countOwnCatalogVideos, hasApprovedVideo, needsApprovedVideo, videoLicense } from '../videoLicense';

const video = (kind: ExerciseVideo['kind'], license?: ExerciseVideo['license']): ExerciseVideo => ({
  kind, src: 'test-video', addedAt: '2026-11-01T00:00:00Z', license
});
const ex = (id: string, v?: ExerciseVideo): Exercise => ({
  id, name: `Test ${id}`, bodyPart: 'Lower', equipment: 'Bodyweight', cues: [], video: v
} as Exercise);

describe('commercial video policy', () => {
  it('defaults external catalog videos to unlicensed, and legacy coach uploads to own', () => {
    expect(videoLicense(video('youtube'))).toBe('unlicensed');
    expect(videoLicense(video('vimeo'))).toBe('unlicensed');
    expect(videoLicense(video('url'))).toBe('unlicensed');
    expect(videoLicense(video('storage'))).toBe('own');
    expect(videoLicense(video('file'))).toBe('own');
    expect(videoLicense(video('storage', 'unlicensed'))).toBe('unlicensed');
  });
  it('never shows unlicensed videos to clients, even when coach preview is on', () => {
    for (const kind of ['youtube', 'vimeo', 'url'] as const) {
      expect(canViewExerciseVideo(video(kind), 'client', true)).toBe(false);
      expect(canViewExerciseVideo(video(kind), 'client', false)).toBe(false);
      expect(canViewExerciseVideo(video(kind), 'coach', false)).toBe(false);
      expect(canViewExerciseVideo(video(kind), 'coach', true)).toBe(true);
    }
    expect(canViewExerciseVideo(video('storage', 'own'), 'client', false)).toBe(true);
    expect(canViewExerciseVideo(video('vimeo', 'licensed'), 'client', false)).toBe(true);
  });
  it('No video yet includes missing and unlicensed but not approved media', () => {
    const list = [ex('missing'), ex('external', video('vimeo')), ex('own', video('storage', 'own')), ex('licensed', video('youtube', 'licensed'))];
    expect(list.filter(needsApprovedVideo).map((e) => e.id)).toEqual(['missing', 'external']);
    expect(searchExercises(list, '', { scope: 'no-video' }).map((e) => e.id).sort()).toEqual(['external', 'missing']);
    expect(searchExercises(list, '', { scope: 'video' }).map((e) => e.id).sort()).toEqual(['licensed', 'own']);
  });
  it('all 1,221 imported YouTube/Vimeo links are unlicensed by default', () => {
    expect(importedCatalog).toHaveLength(1221);
    expect(importedCatalog.every((e) => videoLicense(e.video as ExerciseVideo) === 'unlicensed')).toBe(true);
  });
  it('counts only owned catalog videos (including aliased catalog ids)', () => {
    const map = new Map<string, Exercise>([
      ['a', ex('a', video('storage', 'own'))],
      ['b', ex('b', video('vimeo'))],
      ['c', ex('c', video('youtube', 'licensed'))]
    ]);
    expect(countOwnCatalogVideos([{ id: 'a' }, { id: 'a' }, { id: 'b' }, { id: 'c' }], (id) => map.get(id))).toBe(2);
    expect(hasApprovedVideo(map.get('b')?.video)).toBe(false);
  });
});
