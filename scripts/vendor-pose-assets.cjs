/* Build-time vendor only. Never called by the browser. Run after npm install.
 * Copies MediaPipe WASM from the installed npm package and obtains the official
 * Google Pose Landmarker Lite model. Commit public/mediapipe/ into the PR.
 */
const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');
const crypto = require('node:crypto');
const { pipeline } = require('node:stream/promises');
const { createWriteStream } = require('node:fs');
const root = path.resolve(__dirname, '..');
const dest = path.join(root, 'public', 'mediapipe');
const url = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';
async function fetchFile(address, destFile, hops = 0) {
  if (hops > 3 || !address.startsWith('https://')) throw Error('Invalid model download redirect');
  const response = await new Promise((resolve,reject)=>https.get(address,resolve).on('error',reject));
  if (response.statusCode === 301 || response.statusCode === 302 || response.statusCode === 307) {
    response.resume(); return fetchFile(new URL(response.headers.location,address).href,destFile,hops+1);
  }
  if (response.statusCode !== 200) {response.resume();throw Error(`Model HTTP ${response.statusCode}`);}
  await pipeline(response,createWriteStream(destFile,{flags:'wx'}));
}
async function main() {
  if (process.argv[2] !== '--vendor') throw Error('Pass --vendor to explicitly download assets during development (never at runtime)');
  const srcDir=path.join(root,'node_modules','@mediapipe','tasks-vision','wasm');
  if (!fs.existsSync(srcDir)) throw Error('MediaPipe npm wasm directory missing. Run npm install first.');
  const wasmNames = fs.readdirSync(srcDir).filter(n=>/\.(wasm|js|data)$/.test(n));
  if (!wasmNames.some(n=>n.endsWith('.wasm')) || !wasmNames.some(n=>n.endsWith('.js')))
    throw Error('MediaPipe WASM files missing');
  const stage = fs.mkdtempSync(path.join(root,'public','.mediapipe-stage-'));
  try {
    fs.mkdirSync(path.join(stage,'wasm'));
    fs.mkdirSync(path.join(stage,'models'));
    for (const n of wasmNames) fs.copyFileSync(path.join(srcDir,n),path.join(stage,'wasm',n));
    const model=path.join(stage,'models','pose_landmarker_lite.task');
    await fetchFile(url,model);
    if (fs.statSync(model).size < 1000000) throw Error('Downloaded model too small; refusing to vendor it');
    const all = [model,...wasmNames.map(n=>path.join(stage,'wasm',n))];
    const manifest = all.map(file=>({file:path.relative(stage,file).replaceAll('\\','/'),
      bytes:fs.statSync(file).size,sha256:crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')}));
    fs.writeFileSync(path.join(stage,'ASSETS.json'),JSON.stringify(manifest,null,2)+'\n');
    fs.writeFileSync(path.join(stage,'LICENSE-NOTICE.txt'),
      'MediaPipe Tasks Vision: Apache-2.0. Source: https://github.com/google-ai-edge/mediapipe\n'+
      'Pose Landmarker Lite task file from Google: '+url+'\n'+
      'Preserve license notices; verify model redistribution terms before publication.\n');
    if (fs.existsSync(dest)) throw Error(`Existing asset directory ${dest}; delete only after checking its hashes`);
    fs.renameSync(stage,dest);
    console.log('Local MediaPipe assets staged:');
    for(const x of manifest)console.log(`${x.file} ${x.bytes} bytes SHA256 ${x.sha256}`);
  } finally {if(fs.existsSync(stage))fs.rmSync(stage,{recursive:true,force:true});}
}
main().catch(e=>{console.error(e);process.exitCode=1});
