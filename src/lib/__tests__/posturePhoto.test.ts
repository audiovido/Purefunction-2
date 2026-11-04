import { describe, expect, it } from 'vitest';
import {
  POSE_LANDMARKS, createSavedPhotoReview, landmarkLabel, lineAngle,
  photoLines, pointsFromDetection, manualLandmarkPoints, thresholdColor, type PhotoPoint
} from '../posturePhoto';

const points = () => pointsFromDetection(Array.from({length:33},(_,i)=>({x:i/50,y:i/40,visibility:0.98,presence:0.99})))
  .map(p=>({...p,confirmed:true}));
const setPoint = (list:PhotoPoint[],key:PhotoPoint['key'],x:number,y:number): PhotoPoint[] =>
  list.map(p=>p.key===key?{...p,x,y}:p);

describe('coach-only photo observations — draft geometry',()=>{
  it('places view-specific manual landmarks without inventing measurements or confirmations',()=>{
    const front=manualLandmarkPoints('front','L',false);
    const rear=manualLandmarkPoints('rear','L',false);
    const mirrored=manualLandmarkPoints('front','L',true);
    const side=manualLandmarkPoints('side','R',false);
    expect(front).toHaveLength(POSE_LANDMARKS.length);
    expect(new Set(front.map(p=>p.key)).size).toBe(POSE_LANDMARKS.length);
    for (const group of [front,rear,mirrored,side]) {
      expect(group.every(p=>!p.confirmed && !p.adjusted && p.confidence===0)).toBe(true);
      expect(group.every(p=>p.x>=0 && p.x<=1 && p.y>=0 && p.y<=1)).toBe(true);
      expect(photoLines(group,'front','L',false)).toHaveLength(0);
    }
    const by=(list:PhotoPoint[],key:PhotoPoint['key'])=>list.find(p=>p.key===key)!;
    expect(by(front,'left_shoulder').x).toBeGreaterThan(by(front,'right_shoulder').x);
    expect(by(rear,'left_shoulder').x).toBeLessThan(by(rear,'right_shoulder').x);
    expect(by(mirrored,'left_shoulder').x).toBeLessThan(by(mirrored,'right_shoulder').x);
    expect(by(rear,'nose').visible).toBe(false);
    expect(by(side,'left_shoulder').visible).toBe(false);
    expect(by(side,'right_shoulder').visible).toBe(true);
    const coachReviewed=front.map(p=>p.key==='left_shoulder'||p.key==='right_shoulder'?{...p,confirmed:true}:p);
    expect(photoLines(coachReviewed,'front','L',false).map(l=>l.id)).toEqual(['shoulder']);
    expect(createSavedPhotoReview({id:'manual',view:'front',side:'L',mirrored:false,
      recordedAt:'2026-11-04T00:00:00Z',landmarks:front},1).lines).toHaveLength(0);
  });

  it('measures level and plumb angles using image aspect',()=>{
    expect(lineAngle({x:0.2,y:0.4},{x:0.8,y:0.4},'level',1.5)).toBe(0);
    expect(lineAngle({x:0.3,y:0.1},{x:0.3,y:0.8},'plumb',1)).toBe(0);
    expect(lineAngle({x:0.1,y:0.1},{x:0.6,y:0.6},'level',1)).toBe(45);
    expect(lineAngle({x:0.1,y:0.1},{x:0.6,y:0.6},'plumb',1)).toBe(45);
    expect(lineAngle({x:0.1,y:0.1},{x:0.6,y:0.6},'level',2)).toBe(26.6);
  });
  it('colors threshold boundary green and any exceedance red',()=>{
    expect(thresholdColor(3,3)).toBe('green');
    expect(thresholdColor(3.1,3)).toBe('red');
    expect(thresholdColor(0,3)).toBe('green');
  });
  it('uses anatomical viewerSide mapping for front, rear and side',()=>{
    expect(landmarkLabel('left_hip','front',false)).toContain('viewer-right');
    expect(landmarkLabel('left_hip','rear',false)).toContain('viewer-left');
    expect(landmarkLabel('right_hip','front',false)).toContain('viewer-left');
    expect(landmarkLabel('left_hip','side',false)).toContain('anatomical-side');
    expect(landmarkLabel('left_hip','front',true)).toContain('Client R');
  });
  it('never uses an invisible or unconfirmed endpoint and never assumes low-confidence detected points',()=>{
    const detected=pointsFromDetection(Array.from({length:33},()=>({x:0.4,y:0.5,visibility:0.1})));
    expect(detected.every(p=>p.confirmed===false)).toBe(true);
    expect(photoLines(detected,'front','L',false)).toHaveLength(0);
    let reviewed = points();
    reviewed=setPoint(reviewed,'left_shoulder',0.2,0.2);
    reviewed=setPoint(reviewed,'right_shoulder',0.8,0.2);
    expect(photoLines(reviewed,'front','L',false).some(l=>l.id==='shoulder')).toBe(true);
    reviewed=reviewed.map(p=>p.key==='right_shoulder'?{...p,visible:false}:p);
    expect(photoLines(reviewed,'front','L',false).some(l=>l.id==='shoulder')).toBe(false);
    reviewed=reviewed.map(p=>p.key==='right_shoulder'?{...p,visible:true,confirmed:false}:p);
    expect(photoLines(reviewed,'front','L',false).some(l=>l.id==='shoulder')).toBe(false);
  });
  it('draws precisely the expected front/rear 4 lines and side plumb 4 segments',()=>{
    expect(photoLines(points(),'front','L',false)).toHaveLength(4);
    expect(photoLines(points(),'rear','L',false)).toHaveLength(4);
    expect(photoLines(points(),'side','L',false)).toHaveLength(4);
    expect(photoLines(points(),'side','R',false)).toHaveLength(4);
  });
  it('explicitly whitelists saved fields: no image, object URL or base64',()=>{
    const unsafe = {id:'p-front',view:'front' as const,side:'L' as const,mirrored:false,
      recordedAt:'2026-11-04T18:00:00Z',landmarks:points(),
      image:'data:image/png;base64,SECRET', photoUrl:'blob:SECRET',exif:'SECRET'};
    const record=createSavedPhotoReview(unsafe,1.4);
    const serialized=JSON.stringify(record);
    expect(serialized).not.toMatch(/data:image|base64|blob:|photoUrl|exif|SECRET/);
    expect(record.landmarks).toHaveLength(POSE_LANDMARKS.length);
    expect(record.ruleVersion).toContain('PENDING-HAMOON');
    expect(record.lines).toHaveLength(4);
  });
});
