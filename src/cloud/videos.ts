import { supabase } from './supabase';

const BUCKET = 'exercise-videos';
/** Cloud storage limit per file (Supabase free plan). */
export const CLOUD_VIDEO_MAX_BYTES = 50 * 1024 * 1024;

const signed = new Map<string, { url: string; expires: number }>();

export async function uploadExerciseVideo(exerciseId: string, file: File): Promise<string> {
  if (!supabase) throw new Error('Cloud is not configured');
  const ext = (file.name.match(/\.(mp4|m4v|mov|webm)$/i)?.[1] ?? 'mp4').toLowerCase();
  const path = `${exerciseId}/${Date.now().toString(36)}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: file.type || (ext === 'mov' ? 'video/quicktime' : ext === 'webm' ? 'video/webm' : 'video/mp4'),
    upsert: false
  });
  if (error) throw error;
  return path;
}

/** Short-lived link for playing a private video (cached until shortly before it expires). */
export async function videoUrl(path: string): Promise<string | null> {
  if (!supabase) return null;
  const hit = signed.get(path);
  if (hit && hit.expires > Date.now() + 60_000) return hit.url;
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 60);
  if (error || !data) return null;
  signed.set(path, { url: data.signedUrl, expires: Date.now() + 60 * 60 * 1000 });
  return data.signedUrl;
}

export async function deleteExerciseVideo(path: string): Promise<void> {
  if (!supabase) return;
  signed.delete(path);
  await supabase.storage.from(BUCKET).remove([path]);
}
