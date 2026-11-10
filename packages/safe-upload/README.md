# safe-upload

See and remove what a photo reveals **before it leaves the device**: GPS position, capture time and time zone, phone and lens serial numbers, owner names, people tagged in the photo, edit history, embedded previews that still show the uncropped picture, hidden motion-photo video, and AI generation prompts.

- **Lossless.** Metadata is cut out of the file; the compressed picture stays byte-for-byte identical. No re-encoding, no quality loss.
- **Choose what goes.** Everything is grouped into 14 plain-language categories (`location`, `device`, `people`, `hidden`, …). Remove all of them, or only some.
- **JPEG, PNG, WebP, HEIC and AVIF.** EXIF, XMP, IPTC/Photoshop, PNG text chunks, HEIF items, and data stored after the end of a JPEG.
- **Zero dependencies, runs anywhere.** Browsers, Web Workers, Node ≥ 18, Deno, Bun. About 20 KB minified and gzipped.
- **Optional on-device face redaction** (`safe-upload/browser`), using MediaPipe if you install it.

Live demo: **https://reveal.shinigami-rog.cc**, which runs this package entirely in your browser.

## Install

```bash
npm install safe-upload
```

## Clean a photo before uploading it

```js
import { strip } from 'safe-upload';

input.addEventListener('change', async () => {
  const file = input.files[0];
  const clean = await strip(file); // default: remove everything except camera settings and C2PA credentials
  const body = new FormData();
  body.append('photo', new Blob([clean.bytes], { type: clean.mime }), file.name);
  await fetch('/upload', { method: 'POST', body });
});
```

## See what a photo reveals

```js
import { inspect } from 'safe-upload';

const report = await inspect(file);
report.categories;          // ['location', 'people', 'thumbnail', 'device', 'time', ...]
report.summary.gps;         // { latitude: 29.55935, longitude: -95.09065, altitude: 12, direction: 271 }
report.summary.device;      // 'Canon EOS R5'
report.summary.serialNumbers; // ['DEMO-0123456789']
report.summary.people;      // names tagged in the photo
report.thumbnails;          // embedded preview images (Uint8Array JPEGs)
report.hidden;              // motion-photo video, depth maps, gain maps…
report.findings;            // every item: { category, label, value, source, removable }
```

## Remove only some categories

```js
const r = await strip(file, { remove: ['location', 'people', 'hidden'] });
r.removed;   // categories that were present and are now gone
r.retained;  // items this format cannot drop in place (e.g. HEIC thumbnails)
r.notes;     // e.g. "The XMP metadata block was removed as a whole."
```

`remove: 'all'` removes every category, including camera settings and content credentials.

### Categories

| Category | Removed by default | Examples |
|----------|:-:|----------|
| `location` | ✓ | GPS position, altitude, camera direction, city/country fields |
| `people` | ✓ | People tagged by photo apps (XMP regions, PersonInImage) |
| `hidden` | ✓ | Motion-photo video, depth maps, HDR gain maps, data after the image |
| `thumbnail` | ✓ | Embedded previews, which can show the picture before cropping |
| `author` | ✓ | Artist, owner, copyright, creator contact |
| `device` | ✓ | Make, model, body and lens serial numbers, maker notes |
| `time` | ✓ | Capture/edit dates, time zone, GPS timestamp |
| `ai` | ✓ | Prompts and workflows written by image generators |
| `descriptions` | ✓ | Captions, keywords, titles, comments |
| `history` | ✓ | Edit history, document IDs, source documents |
| `software` | ✓ | Apps used to create or edit the picture |
| `other` | ✓ | Vendor or unrecognised blocks |
| `provenance` |  | C2PA content credentials |
| `settings` |  | Exposure, aperture, ISO, focal length |

Orientation, colour profiles and everything needed to display the picture are always kept.

## Hide faces on-device (browser)

```bash
npm install safe-upload @mediapipe/tasks-vision
```

```js
import { detectFaces, redact, pad } from 'safe-upload/browser';

const opts = { wasmBaseUrl: '/mediapipe/', modelAssetUrl: '/models/blaze_face_full_range.tflite' }; // self-host both
const faces = await detectFaces(imageElement, opts);
const regions = faces.map((f) => pad(f, 0.22, imageElement.naturalWidth, imageElement.naturalHeight));
const { blob } = await redact(file, regions, { style: 'pixelate', remove: ['location', 'device'] });
```

`redact` re-encodes the picture (it has to, the pixels change) and copies over only the EXIF categories you keep, with orientation reset to upright. Detection can miss faces, so always show the result and let people add boxes themselves. Copy `vision_wasm_internal.js` and `.wasm` from `@mediapipe/tasks-vision/wasm`, and the model from MediaPipe's model page, to your own server.

## How it is tested

Every format is checked against two independent tools: **exiftool** must find none of the removed tags in the output, and **ImageMagick's pixel signature** must be identical before and after. A Playwright suite runs the demo site in Chromium, Firefox, WebKit and a mobile profile, and fails if the page makes any request to another origin.

## Limits

- XMP and IPTC blocks are removed as a whole when any category inside them is removed.
- The vendor MakerNote is dropped whenever EXIF has to be rewritten, because its internal offsets break when moved.
- In HEIC and AVIF, embedded thumbnails and auxiliary images (depth, gain map) cannot be removed in place. They are reported in `retained`. Convert the photo to remove them.
- Metadata hidden in the pixels themselves (watermarks, steganography) is out of scope.

## Licence

MIT © Sivaguru Ravi
