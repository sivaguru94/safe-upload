// Content for the static pages search engines index: the FAQ on the home page and the guides.
// scripts/site-pages.mjs renders the guides and the sitemap from this; vite.config.ts puts the FAQ into index.html.
// Keep every claim here something the tool itself shows or that the reader can check on their own phone.

export const SITE = {
  origin: 'https://reveal.shinigami-rog.cc',
  name: 'reveal',
  author: { name: 'Sivaguru Ravi', url: 'https://shinigami-rog.cc/sivaguru-ravi' },
  repo: 'https://github.com/sivaguru94/safe-upload',
};

/** Questions and answers shown on the home page and repeated as FAQPage structured data. Answers are HTML. */
export const FAQ = [
  {
    q: 'Is my photo uploaded anywhere?',
    a: 'No. The photo is read and cleaned by code running in your browser. The page’s Content-Security-Policy only allows connections back to this site, which has no way to receive files, and it keeps working in airplane mode once loaded.',
  },
  {
    q: 'Does removing metadata lower the picture quality?',
    a: 'No. The metadata blocks are cut out of the file and the compressed picture data is copied as it is, so the clean copy has exactly the same pixels. Only hiding faces or areas re-encodes the image.',
  },
  {
    q: 'Which formats does it handle?',
    a: 'JPEG, PNG, WebP, HEIC and AVIF. That covers photos from iPhones (HEIC or JPEG), Android phones, cameras, screenshots and most images saved from the web or from AI image generators.',
  },
  {
    q: 'What can a photo’s metadata give away?',
    a: 'Depending on the device and app: GPS position, the exact date and time, the phone or camera model and sometimes its serial number, the owner’s name, captions and people tags, an embedded preview that can show an uncropped version, edit history, AI prompts, and on some phones a hidden video clip. <a href="/guides/what-your-photo-metadata-reveals/">More in the guide</a>.',
  },
  {
    q: 'Do WhatsApp, Instagram and other apps remove it for me?',
    a: 'Many apps recompress photos sent the normal way and drop most metadata on the way, but a photo sent as a file or document, attached to an email, or shared through a cloud link usually arrives as the original. <a href="/guides/photos-sent-as-files-keep-metadata/">Why that matters</a>.',
  },
  {
    q: 'Does removing metadata stop reverse image search?',
    a: 'No. Reverse image search matches what the picture looks like, not the metadata. If the photo itself is already online, it can still be found. The result page explains this and lets you check, without the page contacting any search engine itself.',
  },
  {
    q: 'Can I use this in my own website or app?',
    a: 'Yes. The same engine is the MIT-licensed npm package <a href="https://www.npmjs.com/package/safe-upload" rel="noopener">safe-upload</a>: <code>inspect()</code> lists what a photo reveals and <code>strip()</code> removes it before upload, in the browser, a worker, Node, Deno or Bun.',
  },
];

/**
 * Guides. `body` is HTML inside <article>; use <h2> for sections.
 * `published` / `updated` are ISO dates: change `updated` when the content changes.
 */
export const GUIDES = [
  {
    slug: 'what-your-photo-metadata-reveals',
    title: 'What your photo’s metadata reveals (EXIF, XMP, GPS)',
    h1: 'What your photo’s metadata reveals',
    description: 'EXIF and XMP metadata can carry your GPS position, the time, your phone’s model and serial number, your name, an uncropped preview and even a hidden video. What each one is and how to check a photo.',
    published: '2026-11-16',
    updated: '2026-11-16',
    body: `
<p>Every photo is two things: the picture, and a set of notes the phone or app wrote into the file. Those notes are called metadata. The common formats are <strong>EXIF</strong> (written by cameras and phones), <strong>XMP</strong> (written by editing apps, Google and Adobe) and <strong>IPTC</strong> (used by photo agencies and newsrooms). You never see them in the picture, but anyone who gets the original file can read them.</p>

<h2>What is usually in there</h2>
<ul>
  <li><strong>Location.</strong> GPS latitude and longitude, often accurate to a few metres, sometimes with altitude and the direction the camera faced. A photo taken at home gives away where you live.</li>
  <li><strong>Date and time.</strong> When the photo was taken, often with the time zone, and when it was last edited.</li>
  <li><strong>Camera and device.</strong> The phone or camera make and model, the lens, the software version, and on many cameras a body or lens <em>serial number</em> that links every photo you ever took with it.</li>
  <li><strong>Names.</strong> The owner or artist name set in a camera, copyright lines, and people tags added by photo apps.</li>
  <li><strong>Embedded preview.</strong> A small copy of the picture stored for fast display. Some editors crop the main picture but leave the preview untouched, so the “cropped out” part is still in the file.</li>
  <li><strong>Edit history.</strong> Which apps touched the file and what they did.</li>
  <li><strong>AI generation data.</strong> Images made with Stable Diffusion tools and similar often carry the full prompt, the model and the settings in PNG text chunks.</li>
  <li><strong>Hidden video.</strong> Motion photos from Pixel and Samsung phones include a short video clip inside the same JPEG. <a href="/guides/hidden-video-in-motion-photos/">More on motion photos</a>.</li>
</ul>

<h2>Who can see it</h2>
<p>Anyone who receives the original file: the person you email it to, anyone with a cloud share link, buyers on a marketplace, a forum that keeps uploads as they are. Some large apps strip most of it when you send a photo the normal way, but <a href="/guides/photos-sent-as-files-keep-metadata/">sending it as a file keeps everything</a>.</p>

<h2>How to check a photo</h2>
<p>Open <a href="/">reveal</a> and drop the photo in. It lists everything it finds, grouped by what it gives away, shows the location on a map, and lets you download a clean copy. Nothing is uploaded: the reading and cleaning happen in your browser. Removing metadata is lossless, so the clean copy looks exactly the same.</p>

<h2>Stopping it at the source</h2>
<p>You can also stop your camera from recording location in the first place: see the guides for <a href="/guides/remove-location-from-iphone-photos/">iPhone</a> and <a href="/guides/remove-location-from-android-photos/">Android</a>. Device model and time are still written, so it is worth checking anything you post publicly.</p>
`,
  },
  {
    slug: 'remove-location-from-iphone-photos',
    title: 'How to remove the location from iPhone photos before sharing',
    h1: 'Remove the location from iPhone photos',
    description: 'Turn off location for one shared photo, remove it from photos already in your library, stop the Camera saving it, and check what an iPhone photo still contains, HEIC included.',
    published: '2026-11-16',
    updated: '2026-11-16',
    body: `
<p>By default the iPhone Camera saves the GPS position in every photo. Here are the ways to keep it out of what you share. Menu names are from recent iOS versions and can differ slightly on older ones.</p>

<h2>For one photo you are sharing</h2>
<ol>
  <li>In Photos, select the photo and tap <strong>Share</strong>.</li>
  <li>Tap <strong>Options</strong> at the top of the share sheet.</li>
  <li>Turn off <strong>Location</strong> and tap Done, then share as usual.</li>
</ol>
<p>This only applies to that share. The photo in your library keeps its location.</p>

<h2>For a photo already in your library</h2>
<p>Open the photo, swipe up or tap the <strong>ⓘ</strong> button, tap <strong>Adjust</strong> next to the location and choose <strong>No Location</strong>. You can select several photos and do the same from the ••• menu.</p>

<h2>Stop the Camera recording it</h2>
<p>Go to <strong>Settings → Privacy &amp; Security → Location Services → Camera</strong> and choose <strong>Never</strong>. New photos will have no GPS position. Older ones keep theirs.</p>

<h2>Uploading to a website from an iPhone</h2>
<p>When you pick a photo from the photo library in a browser, iOS usually hands the site a converted JPEG, and in our tests that copy still contained the GPS position. Picking the same photo from the <strong>Files</strong> app gives the website the original HEIC. Either way, the website may receive more than you expect.</p>

<h2>Check before you post</h2>
<p>Location is only one item. iPhone photos also carry the phone model, the lens, the exact time and, in HEIC files, an embedded preview. Drop the photo into <a href="/">reveal</a> to see everything in it and download a clean copy. It works on the iPhone in Safari, reads HEIC even though most browsers cannot display it, and nothing leaves the phone.</p>
`,
  },
  {
    slug: 'remove-location-from-android-photos',
    title: 'How to remove the location from Android photos (Pixel, Samsung)',
    h1: 'Remove the location from Android photos',
    description: 'Stop the camera saving GPS, remove the location when sharing from Google Photos or Samsung Gallery, and check what a Pixel or Galaxy photo still contains, including motion-photo video.',
    published: '2026-11-16',
    updated: '2026-11-16',
    body: `
<p>Most Android camera apps can save your GPS position in each photo. The exact menus depend on the phone maker and the Android version, so treat these as directions rather than exact paths.</p>

<h2>Stop the camera saving location</h2>
<ul>
  <li><strong>Pixel (Google Camera):</strong> open the camera settings and turn off <strong>Save location</strong>.</li>
  <li><strong>Samsung (Samsung Camera):</strong> open the camera settings and turn off <strong>Location tags</strong>.</li>
  <li>On any phone you can also deny the camera app the Location permission in <strong>Settings → Apps → Camera → Permissions</strong>.</li>
</ul>

<h2>When sharing</h2>
<ul>
  <li><strong>Samsung Gallery</strong> shows a <strong>Remove location data</strong> option in the share screen on recent One UI versions.</li>
  <li><strong>Google Photos</strong> lets you remove or edit the location of a photo from its info panel, and has a setting to remove location from photos shared by link. Check what applies to the way you share.</li>
</ul>

<h2>The hidden video in motion photos</h2>
<p>Pixel “Motion Photos” and Samsung “Motion photo” store a short video clip inside the JPEG. If you share the file, the clip can go with it, including the moments before and after the shot. <a href="/guides/hidden-video-in-motion-photos/">How motion photos work</a>.</p>

<h2>Check before you post</h2>
<p>Android photos also carry the phone model, the exact time and often the camera software version. Drop a photo into <a href="/">reveal</a> to see everything in it, watch any hidden clip, and download a clean copy with the location and video removed. It works in Chrome on the phone and nothing is uploaded.</p>
`,
  },
  {
    slug: 'hidden-video-in-motion-photos',
    title: 'The hidden video inside motion photos (Pixel, Samsung) and how to remove it',
    h1: 'The hidden video inside motion photos',
    description: 'Pixel Motion Photos and Samsung motion photos keep a short video inside the JPEG file. What it captures, where it goes when you share the file, and how to remove it without touching the picture.',
    published: '2026-11-16',
    updated: '2026-11-16',
    body: `
<p>Many Android phones record a second or two of video around every photo. Google calls it <strong>Motion Photos</strong> on Pixel phones, Samsung calls it <strong>Motion photo</strong>. Unlike Apple’s Live Photos, which are stored as a separate video file next to the picture, these phones put the video <em>inside the same JPEG file</em>, after the picture data.</p>

<h2>Why it matters</h2>
<ul>
  <li>The clip covers the moments before and after you pressed the shutter: people who stepped out of frame, a screen you turned away from, what was said if sound was recorded.</li>
  <li>The file still looks like an ordinary photo. Most viewers and websites only show the picture, so nobody notices the clip, but anyone who downloads the file can extract it.</li>
  <li>It makes the file noticeably larger, often by a few megabytes.</li>
</ul>

<h2>Turning it off</h2>
<p>In the camera app, the motion photo switch is usually an icon at the top of the viewfinder. Turning it off only affects new photos.</p>

<h2>Removing it from a photo you already have</h2>
<p>Drop the photo into <a href="/">reveal</a>. If it contains a clip, the result shows it under <strong>Hidden extra media</strong> so you can watch it, and the clean download removes it together with the location and other metadata. The picture itself is copied without re-compression, so it is unchanged. Nothing is uploaded.</p>

<h2>For developers</h2>
<p>The trailing video is described in the photo’s XMP (Google’s <code>Container</code> directory, or Samsung’s trailer) and simply appended to the JPEG. The <a href="https://www.npmjs.com/package/safe-upload" rel="noopener">safe-upload</a> package detects it as the <code>hidden</code> category and <code>strip()</code> drops it along with the XMP that points to it.</p>
`,
  },
  {
    slug: 'photos-sent-as-files-keep-metadata',
    title: 'Photos sent as files, documents or email keep their metadata',
    h1: 'Photos sent as files keep their metadata',
    description: 'Messaging apps often strip metadata from photos sent the normal way, but documents, email attachments, cloud links, AirDrop and many websites pass on the original file with its location and device details.',
    published: '2026-11-16',
    updated: '2026-11-16',
    body: `
<p>A common belief is that apps remove location and other metadata for you. Sometimes they do. It depends less on the app than on <em>how</em> the photo is sent.</p>

<h2>Usually stripped</h2>
<p>When a large messaging or social app sends a photo the normal way, it typically resizes and recompresses it to save data, and most metadata is lost along the way. This is a side effect of compression, not a privacy promise, and apps change how they handle it.</p>

<h2>Usually kept</h2>
<ul>
  <li><strong>Sent as a file or document</strong> in a messaging app, often chosen to keep full quality.</li>
  <li><strong>Email attachments.</strong></li>
  <li><strong>Cloud share links</strong> (Google Drive, Dropbox, OneDrive, iCloud links) unless the service has a setting to remove location.</li>
  <li><strong>AirDrop and Nearby Share</strong>, which send the original file (iPhone’s share Options can turn location off first).</li>
  <li><strong>Websites and forums</strong> that keep uploads as they are: marketplaces, small forums, self-hosted galleries and many contact or support forms.</li>
</ul>

<h2>Check the copy that actually went out</h2>
<p>The only reliable test is to look at the file the other person received: send it to yourself the same way, download it, and drop it into <a href="/">reveal</a>. You will see whether the location, device, time or any hidden video survived. If they did, download the clean copy and send that instead. Nothing is uploaded while you check.</p>

<h2>For site owners</h2>
<p>If your website accepts photos, you can strip metadata in the browser before the upload ever starts, so you never store your users’ locations. The <a href="https://www.npmjs.com/package/safe-upload" rel="noopener">safe-upload</a> npm package does this losslessly in a few lines.</p>
`,
  },
];
