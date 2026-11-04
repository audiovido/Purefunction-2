import { pointsFromDetection, type PhotoPoint, type RawPosePoint } from './posturePhoto';

/** Dynamic import happens only after the coach has opened the feature and selected a photo. */
export async function detectPosturePhoto(image: HTMLImageElement): Promise<PhotoPoint[]> {
  const { FilesetResolver, PoseLandmarker } = await import('@mediapipe/tasks-vision');
  const base = import.meta.env.BASE_URL;
  // Both URLs are same-origin. Never fall back to a third-party CDN.
  const assets = await FilesetResolver.forVisionTasks(`${base}mediapipe/wasm`);
  const landmarker = await PoseLandmarker.createFromOptions(assets, {
    baseOptions: { modelAssetPath: `${base}mediapipe/models/pose_landmarker_lite.task`, delegate: 'CPU' },
    runningMode: 'IMAGE', numPoses: 1, minPoseDetectionConfidence: 0.5,
    minPosePresenceConfidence: 0.5, outputSegmentationMasks: false
  });
  try {
    const result = landmarker.detect(image);
    if (!result.landmarks?.length) throw new Error('No single person detected. Use a full-body photo with clear lighting.');
    return pointsFromDetection(result.landmarks[0] as RawPosePoint[]);
  } finally {
    landmarker.close();
  }
}
