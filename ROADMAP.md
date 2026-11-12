# Roadmap

Ordered. One item in progress at a time.

## 1. Launch blockers
1. ~~**iPhone canvas limit.**~~ DONE 2026-11-10 in code: photos over 16,777,216 px are redacted in strips and
   encoded with @jsquash/jpeg (mozjpeg WASM) at full resolution; PNG/WebP over the limit are downscaled with a
   notice; e2e compares the strip path with the normal path pixel by pixel. STILL TO DO: try a 24 MP photo on a
   real iPhone. Same day: the iPhone "Take Photo" viewfinder was black because Permissions-Policy had camera=();
   now camera=(self).
   2026-11-12 on a real iPhone (Safari and Chrome): picking from Photos hands the page a JPEG converted by
   iOS (IMG_1234.jpeg) whatever `accept` says, and it KEEPS the GPS block; picking via Browse (Files, saved with
   "All Photos Data") gives the original HEIC, also with GPS. reveal showed location/model/date for the HEIC and
   the clean copy re-checked as no GPS. The page now notes the iOS conversion. Large-photo face hiding on the
   phone is still untested.
2. **Real-file corpus.** Run real files from the owner's devices through inspect/strip and the site:
   Pixel 7a motion photo (`.MP.jpg`), iPhone HEIC (thumbnail, depth, gain map), iPhone JPEG with gain map,
   WhatsApp-forwarded image, Android and macOS screenshots, Lightroom export. Turn each surprise into a
   fixture and a test, as was done for the Nikon empty GPS block and MPF previews.
3. **Exact privacy claim.** Turn off the nginx access log for this site; add a short privacy note saying
   Cloudflare (once public) sees connection details but never photos.
4. **Publish with provenance.** Publish to npm from GitHub Actions (trusted publishing / provenance) so the
   package links to the exact commit; deploy the site from the same pipeline so the live site matches the source.
5. **Launch steps (owner's go-ahead):** make the repo public, npm publish, reveal.shinigami-rog.cc via
   Cloudflare Tunnel, Uptime Kuma monitor, link from the portfolio site and resume.

## 2. Text finder (queued 2026-11-10)
Small on-device text-detection model (a few MB, self-hosted, no recognition needed) that boxes readable
text — house numbers, street and shop signs, name tags, school logos, letters, screens — so it can be
hidden like faces. Feeds the existing overlay and `redact()`; adds a "Readable text" group to the
"Visible in the picture" card. Must keep the no-outside-requests guarantee and the e2e test for it.

## 3. Later
- HEIC face hiding in Chrome/Firefox via libheif WASM decode (and convert-to-JPEG).
- Android share target: share a photo to reveal, clean it, share it on.
- Keyboard and screen-reader support for the overlay boxes.
- Opt-in "What could an AI work out from this picture?" card (small VLM on WebGPU, self-hosted, prompt
  limited to scene clues, never traits of people). Only after the text finder.
- Video metadata (MP4/MOV GPS), batch mode with zip, Uppy/FilePond plugins, portfolio write-up.
