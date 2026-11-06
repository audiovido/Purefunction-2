/* Fail the production build if photo analysis is enabled but local assets are absent.
 * Runtime never downloads model or WASM from a CDN. */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
if (process.env.VITE_ENABLE_POSTURE_PHOTO === 'true') {
  const root = path.resolve(__dirname,'..','public','mediapipe');
  const manifestPath = path.join(root,'ASSETS.json');
  if (!fs.existsSync(manifestPath)) throw Error('Missing bundled MediaPipe assets. Run: node scripts/vendor-pose-assets.cjs --vendor');
  const manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
  if (!Array.isArray(manifest) || !manifest.some(x=>x.file==='models/pose_landmarker_lite.task'))throw Error('Missing model manifest entry');
  for(const x of manifest){
    if(typeof x.file!=='string'||!/^((wasm|models)\/)[a-zA-Z0-9._-]+$/.test(x.file))throw Error('Invalid asset path');
    const file=path.join(root,x.file);
    if(!fs.existsSync(file)||fs.statSync(file).size!==x.bytes)throw Error(`Missing/wrong-size local asset: ${x.file}`);
    const sha=crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
    if(sha!==x.sha256)throw Error(`Local asset integrity mismatch: ${x.file}`);
  }
  console.log(`Verified ${manifest.length} local MediaPipe model/WASM files`);
}
