import { describe, expect, it, vi } from 'vitest';
const bridge = vi.hoisted(()=>({
  resolver: vi.fn(async (_url:string)=>({wasmLoaderPath:'local',wasmBinaryPath:'local'})),
  create: vi.fn(async (_fileset:unknown,_opts:unknown)=>({
    detect: vi.fn(()=>({landmarks:[Array.from({length:33},(_,i)=>({x:i/40,y:i/40,visibility:0.9,presence:0.9}))]})),
    close: vi.fn()
  }))
}));
vi.mock('@mediapipe/tasks-vision',()=>({
  FilesetResolver:{forVisionTasks:bridge.resolver},
  PoseLandmarker:{createFromOptions:bridge.create}
}));
import { detectPosturePhoto } from '../poseOnDevice';

describe('PoseLandmarker integration (mock; no network or model download)',()=>{
  it('loads same-origin assets and leaves points unconfirmed',async()=>{
    const result=await detectPosturePhoto({} as HTMLImageElement);
    expect(result).toHaveLength(33);
    expect(result.every(p=>!p.confirmed)).toBe(true);
    expect(bridge.resolver).toHaveBeenCalledOnce();
    expect(String(bridge.resolver.mock.calls[0][0])).toContain('mediapipe/wasm');
    const options=bridge.create.mock.calls[0][1] as {baseOptions:{modelAssetPath:string}};
    expect(options.baseOptions.modelAssetPath).toContain('mediapipe/models/pose_landmarker_lite.task');
    expect(options.baseOptions.modelAssetPath).not.toContain('https://');
  });
});
