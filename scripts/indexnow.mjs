// Submit every sitemap URL to IndexNow (Bing, Yandex, Seznam, Naver share submissions).
// The key is the name of the one-line <key>.txt file in site/public. Usage: node scripts/indexnow.mjs
import { readFileSync, readdirSync } from 'node:fs';

const host = 'reveal.shinigami-rog.cc';
const keyFile = readdirSync('site/public').find((f) => /^[0-9a-f]{32}\.txt$/.test(f));
if (!keyFile) throw new Error('no IndexNow key file in site/public');
const key = keyFile.slice(0, -4);
const urlList = [...readFileSync('site/dist/sitemap.xml', 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);

const res = await fetch('https://api.indexnow.org/indexnow', {
  method: 'POST',
  headers: { 'content-type': 'application/json; charset=utf-8' },
  body: JSON.stringify({ host, key, keyLocation: `https://${host}/${keyFile}`, urlList }),
});
console.log(`IndexNow: ${urlList.length} URLs -> HTTP ${res.status}`);
if (res.status >= 400) process.exitCode = 1;
