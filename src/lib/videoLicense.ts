import { Exercise, ExerciseVideo } from '../types';

export type VideoViewer = 'coach' | 'client';

/** Unknown external links must never silently become licensed. */
export function videoLicense(video?: ExerciseVideo): 'own' | 'licensed' | 'unlicensed' | null {
  if (!video) return null;
  if (video.license === 'own' || video.license === 'licensed' || video.license === 'unlicensed') return video.license;
  // Pre-T7 files were uploaded by the coach to our own storage / browser.
  return video.kind === 'file' || video.kind === 'storage' ? 'own' : 'unlicensed';
}

export const hasApprovedVideo = (video?: ExerciseVideo): boolean =>
  !!video && (videoLicense(video) === 'own' || videoLicense(video) === 'licensed');

/** Even if a coach explicitly enables the preview, clients NEVER see unlicensed video. */
export function canViewExerciseVideo(video: ExerciseVideo | undefined, viewer: VideoViewer, showUnlicensedCoach: boolean): boolean {
  if (!video) return false;
  return hasApprovedVideo(video) || (viewer === 'coach' && showUnlicensedCoach);
}

/** A 'No video yet' filter means no approved video, regardless of the preview setting. */
export const needsApprovedVideo = (exercise: Pick<Exercise, 'video'>): boolean => !hasApprovedVideo(exercise.video);

/** Count imported catalog exercises (including aliases), not extra coach-added exercises. */
export function countOwnCatalogVideos(catalog: ReadonlyArray<Pick<Exercise, 'id'>>, find: (id: string) => Exercise | undefined): number {
  return catalog.filter((entry) => videoLicense(find(entry.id)?.video) === 'own').length;
}
