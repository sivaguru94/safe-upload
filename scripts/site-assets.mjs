// Copy MediaPipe's WASM runtime into site/public so the page never loads code from a CDN.
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'node_modules/@mediapipe/tasks-vision/wasm');
const dst = join(root, 'site/public/mediapipe');
mkdirSync(dst, { recursive: true });
for (const f of ['vision_wasm_internal.js', 'vision_wasm_internal.wasm']) copyFileSync(join(src, f), join(dst, f));
console.log('copied MediaPipe runtime to site/public/mediapipe');

// Same for onnxruntime-web (text detection). Single-threaded SIMD build; no CDN.
const ortSrc = join(root, 'node_modules/onnxruntime-web/dist');
const ortDst = join(root, 'site/public/ort');
mkdirSync(ortDst, { recursive: true });
for (const f of ['ort-wasm-simd-threaded.mjs', 'ort-wasm-simd-threaded.wasm']) copyFileSync(join(ortSrc, f), join(ortDst, f));
console.log('copied onnxruntime-web runtime to site/public/ort');
