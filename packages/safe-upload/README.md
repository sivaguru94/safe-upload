# safe-upload

[![npm version](https://img.shields.io/npm/v/safe-upload.svg)](https://www.npmjs.com/package/safe-upload)
[![CI](https://github.com/sivaguru94/safe-upload/actions/workflows/ci.yml/badge.svg)](https://github.com/sivaguru94/safe-upload/actions/workflows/ci.yml)
[![zero dependencies](https://img.shields.io/badge/dependencies-0-brightgreen.svg)](https://www.npmjs.com/package/safe-upload?activeTab=dependencies)
[![types included](https://img.shields.io/npm/types/safe-upload.svg)](https://www.npmjs.com/package/safe-upload)
[![license: MIT](https://img.shields.io/npm/l/safe-upload.svg)](https://github.com/sivaguru94/safe-upload/blob/main/LICENSE)

**Inspect and remove the private data a photo carries, on the user's device, before it is uploaded.**

Photos routinely carry far more than the picture: the GPS position where they were taken, the capture time and
time zone, phone and lens serial numbers, owner names, people tagged by photo apps, edit history, embedded
previews of the uncropped image, hidden motion-photo video, and AI generation prompts. `safe-upload` finds all of
it, explains it in plain language, and removes what you choose without touching a single pixel.

**[Live demo: reveal.shinigami-rog.cc](https://reveal.shinigami-rog.cc)**, built on this package and running entirely in the browser.

## Contents

- [Features](#features)
- [Installation](#installation)
- [Quick start](#quick-start)
- [Usage](#usage)
- [API reference](#api-reference)
- [Categories](#categories)
- [Compatibility](#compatibility)
- [Testing and verification](#testing-and-verification)
- [Limitations](#limitations)
- [Privacy](#privacy)
- [Contributing](#contributing)
- [License](#license)

## Features

- **Lossless.** Metadata is cut out of the container; the compressed image data stays byte-for-byte identical. No re-encoding, no quality loss.
- **Selective.** Findings are grouped into 14 plain-language categories (`location`, `device`, `people`, `hidden`, …). Remove all of them or only some.
- **Broad format coverage.** JPEG, PNG, WebP, HEIC and AVIF; EXIF, XMP, IPTC/Photoshop, PNG text chunks, HEIF items, and data appended after the end of a JPEG (such as motion-photo video).
- **Zero dependencies, any runtime.** Browsers, Web Workers, Node.js ≥ 18, Deno and Bun. About 22 KB minified and gzipped.
- **File-name analysis.** Detects what camera and messenger file names reveal, and generates neutral names.
- **Optional on-device vision** (`safe-upload/browser`): face detection and redaction, plus hints for revealing objects such as screens, documents and vehicles, using MediaPipe models you host yourself.
- **Typed.** Written in TypeScript; type declarations are included.
- **Verifiable releases.** Published from GitHub Actions with [npm provenance](https://docs.npmjs.com/generating-provenance-statements).

## Installation

```bash
npm install safe-upload
```

The package is ESM-only. For the optional face and object detection, also install MediaPipe:

```bash
npm install safe-upload @mediapipe/tasks-vision
```

## Quick start

Strip private metadata from a file chosen in an `<input type="file">` before sending it to your server:

```js
import { strip } from 'safe-upload';

input.addEventListener('change', async () => {
  const file = input.files[0];
  const clean = await strip(file); // removes every category except camera settings and C2PA credentials

  const body = new FormData();
  body.append('photo', new Blob([clean.bytes], { type: clean.mime }), file.name);
  await fetch('/upload', { method: 'POST', body });
});
```

## Usage

### Inspect a photo

```js
import { inspect } from 'safe-upload';

const report = await inspect(file);

report.categories;            // ['location', 'people', 'thumbnail', 'device', 'time', ...]
report.summary.gps;           // { latitude: 29.55935, longitude: -95.09065, altitude: 12, direction: 271 }
report.summary.device;        // 'Canon EOS R5'
report.summary.serialNumbers; // ['DEMO-0123456789']
report.summary.people;        // names tagged in the photo
report.thumbnails;            // embedded preview images (Uint8Array JPEGs)
report.hidden;                // motion-photo video, depth maps, gain maps, …
report.findings;              // every item: { category, label, value, source, removable }
```

### Remove selected categories

```js
const result = await strip(file, { remove: ['location', 'people', 'hidden'] });

result.removed;  // categories that were present and are now gone
result.retained; // items this format cannot drop in place (for example HEIC thumbnails)
result.notes;    // for example "The XMP metadata block was removed as a whole."
```

Pass `remove: 'all'` to remove every category, including camera settings and content credentials.
`stripToBlob(input, options)` returns the result as a `Blob` with the correct MIME type.

### Check the file name

Browsers send the file name with every upload, and camera and messaging apps encode the date, device and app in
it. `PXL_20241016_103122123.MP.jpg`, for example, identifies a Google Pixel, a capture time of 16 October 2024
10:31 UTC, and a motion photo.

```js
import { inspectFileName, neutralFileName } from 'safe-upload';

inspectFileName('Screenshot_20241016-103122_WhatsApp.jpg').findings;
// [
//   { label: 'Screenshot', value: 'Android screenshot' },
//   { label: 'Taken (from file name)', value: '2024-10-16 10:31:22' },
//   { label: 'App on screen', value: 'WhatsApp' }
// ]

form.append('photo', cleanBlob, neutralFileName(clean.mime)); // "photo.jpg"
```

### Hide faces (browser)

```js
import { detectFaces, redact, pad } from 'safe-upload/browser';

const options = {
  wasmBaseUrl: '/mediapipe/',                            // self-hosted MediaPipe runtime
  modelAssetUrl: '/models/blaze_face_full_range.tflite', // self-hosted model
};

const faces = await detectFaces(imageElement, options);
const regions = faces.map((f) => pad(f, 0.22, imageElement.naturalWidth, imageElement.naturalHeight));
const { blob } = await redact(file, regions, { style: 'pixelate', remove: ['location', 'device'] });
```

`redact` re-encodes the image (the pixels change, so it has to) and carries over only the EXIF categories you
keep, with orientation reset to upright. Styles: `'pixelate'`, `'blur'`, `'solid'`. Detection can miss faces, so
always show the result and let users add regions themselves.

Copy `vision_wasm_internal.js` and `vision_wasm_internal.wasm` from `@mediapipe/tasks-vision/wasm`, and the model
from the [MediaPipe face detector page](https://ai.google.dev/edge/mediapipe/solutions/vision/face_detector), to
your own server so that no third party is contacted.

### Find revealing objects (browser)

Metadata is only half of the picture. `detectObjects` (EfficientDet-Lite0, 80 everyday classes, on-device) and
`objectHints` point out screens, documents, vehicles, home interiors, street signs and other things that can
identify a person or place:

```js
import { detectObjects, objectHints } from 'safe-upload/browser';

const objects = await detectObjects(imageElement, {
  wasmBaseUrl: '/mediapipe/',
  modelAssetUrl: '/models/efficientdet_lite0.tflite',
});

for (const hint of objectHints(objects)) {
  console.log(hint.title, '-', hint.hint); // "1 screen - Screens can show messages, emails, maps…"
}
```

## API reference

`Input` is `Uint8Array | ArrayBuffer | Blob` (a `File` is a `Blob`).

### `safe-upload`

| Export | Description |
|--------|-------------|
| `inspect(input): Promise<Report>` | Parse the file and report every finding, grouped by category. |
| `strip(input, options?): Promise<StripResult>` | Remove the selected categories losslessly. Returns `bytes`, `mime`, `removed`, `retained`, `notes`. |
| `stripToBlob(input, options?): Promise<Blob>` | Same as `strip`, returned as a `Blob`. |
| `carryExif(original, encoded, options)` | Copy the kept EXIF categories from an original onto a re-encoded image. |
| `inspectFileName(name): FileNameReport` | Report what a file name reveals (device, date, app, screenshot, motion photo). |
| `neutralFileName(mime, base?): string` | A neutral file name with the right extension, for example `photo.jpg`. |
| `detectFormat(bytes): Format` | Identify the container from its magic bytes. |
| `describeCategory(category)` | Human-readable title and description of a category. |
| `CATEGORY_INFO`, `CATEGORY_ORDER`, `DEFAULT_REMOVE` | Category metadata, display order, and the default removal set. |
| `UnsupportedFormatError` | Thrown for files that are not in a supported format. |

### `safe-upload/browser`

| Export | Description |
|--------|-------------|
| `detectFaces(source, options): Promise<FaceBox[]>` | On-device face detection (MediaPipe BlazeFace, full range). |
| `preloadFaceDetector(options)` | Download and initialise the face model ahead of time. |
| `detectObjects(source, options)`, `objectHints(objects)` | On-device object detection and privacy-oriented hints. |
| `redact(input, regions, options?): Promise<RedactResult>` | Pixelate, blur or fill regions and apply the metadata policy. |
| `pad(box, fraction, maxWidth, maxHeight)` | Grow a detection box by a margin, clamped to the image. |
| `faceDetectionSupported()`, `visionSupported()` | Feature detection (WebGL is required). |
| `decode(blob)`, `decodeImage(blob)`, `IOS_CANVAS_LIMIT` | Decoding helpers. Images above the iOS canvas limit are processed in strips. |

Full type definitions ship with the package.

## Categories

| Category | Removed by default | Examples |
|----------|:-:|----------|
| `location` | ✓ | GPS position, altitude, camera direction, city and country fields |
| `people` | ✓ | People tagged by photo apps (XMP regions, PersonInImage) |
| `hidden` | ✓ | Motion-photo video, depth maps, HDR gain maps, data after the image |
| `thumbnail` | ✓ | Embedded previews, which can show the picture before cropping |
| `author` | ✓ | Artist, owner, copyright, creator contact details |
| `device` | ✓ | Make, model, body and lens serial numbers, maker notes |
| `time` | ✓ | Capture and edit dates, time zone, GPS timestamp |
| `ai` | ✓ | Prompts and workflows written by image generators |
| `descriptions` | ✓ | Captions, keywords, titles, comments |
| `history` | ✓ | Edit history, document IDs, source documents |
| `software` | ✓ | Applications used to create or edit the picture |
| `other` | ✓ | Vendor-specific or unrecognised blocks |
| `provenance` |  | C2PA content credentials |
| `settings` |  | Exposure, aperture, ISO, focal length |

Orientation, colour profiles and everything else required to display the image correctly are always kept.

## Compatibility

| Environment | Core (`safe-upload`) | Vision (`safe-upload/browser`) |
|-------------|:-:|:-:|
| Chrome, Edge, Firefox, Safari (desktop and mobile) | ✓ | ✓ (WebGL required) |
| Web Workers | ✓ | n/a |
| Node.js ≥ 18, Deno, Bun | ✓ | n/a |

On iOS, a photo picked from the photo library reaches the page as a JPEG converted from the original HEIC, with
its location still included; picking it through **Files** provides the original HEIC. `safe-upload` handles both.

## Testing and verification

- **Independent oracles.** For every format, [exiftool](https://exiftool.org) must find none of the removed tags in
  the output, and ImageMagick's pixel signature must be identical before and after stripping.
- **End-to-end.** A Playwright suite runs the demo site in Chromium, Firefox, WebKit and a mobile profile, and fails
  if the page makes any request to another origin.
- **Real devices.** iPhone behaviour (HEIC originals and iOS-converted JPEGs) has been verified on hardware.

## Limitations

- XMP and IPTC blocks are removed as a whole when any category inside them is removed.
- The vendor MakerNote is dropped whenever EXIF has to be rewritten, because its internal offsets break when moved.
- In HEIC and AVIF, embedded thumbnails and auxiliary images (depth maps, gain maps) cannot be removed in place.
  They are reported in `retained`; convert the image to remove them.
- Information carried by the pixels themselves (visible content, watermarks, steganography) is outside the scope of
  metadata stripping. The optional vision helpers assist with faces and objects but can miss things.

## Privacy

All processing happens locally. The core makes no network requests. The browser helpers load only the runtime and
model URLs you pass to them; host those yourself to keep every request on your own origin.

## Contributing

Bug reports and pull requests are welcome on [GitHub](https://github.com/sivaguru94/safe-upload). Sample files that
are handled incorrectly are especially useful; please remove anything personal from them first. The
[repository README](https://github.com/sivaguru94/safe-upload#development) describes the development setup.

## License

[MIT](https://github.com/sivaguru94/safe-upload/blob/main/LICENSE) © [Sivaguru Ravi](https://shinigami-rog.cc/sivaguru-ravi)
