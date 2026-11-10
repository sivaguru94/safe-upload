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
