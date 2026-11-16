// Render the static guide pages and the sitemap from site/content/pages.mjs.
// Output (all generated, gitignored): site/guides/**/index.html, site/public/sitemap.xml. Vite builds the HTML like index.html.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GUIDES, SITE } from '../site/content/pages.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const site = join(root, 'site');

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/** JSON-LD inside <script>: `<` escaped so no string can close the element. */
export const ldJson = (data) => `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`;

function page({ path, title, description, h1, lede, body, ld, type = 'article' }) {
  const url = SITE.origin + path;
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${esc(title)} · reveal</title>
    <meta name="description" content="${esc(description)}" />
    <meta name="theme-color" content="#050705" />
    <meta property="og:title" content="${esc(title)}" />
    <meta property="og:description" content="${esc(description)}" />
    <meta property="og:type" content="${type}" />
    <meta property="og:url" content="${url}" />
    <meta property="og:image" content="${SITE.origin}/og.png" />
    <meta name="twitter:card" content="summary_large_image" />
    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
    <link rel="canonical" href="${url}" />
    ${ld.map(ldJson).join('\n    ')}
  </head>
  <body>
    <div class="scanlines" aria-hidden="true"></div>
    <header class="top">
      <a class="brand" href="/">reveal<span class="cursor">_</span></a>
      <nav>
        <a href="/">check a photo</a>
        <a href="/guides/">guides</a>
        <a href="${SITE.repo}" rel="noopener">github</a>
        <button id="theme" class="ghost" type="button" aria-label="Switch colour theme">◐</button>
      </nav>
    </header>

    <main>
      <article class="guide">
        <p class="crumbs"><a href="/">reveal</a> / <a href="/guides/">guides</a></p>
        <h1>${esc(h1)}</h1>
        ${lede ? `<p class="lede">${esc(lede)}</p>` : ''}
        ${body.trim()}
        <p class="cta"><a class="primary" href="/">Check a photo now →</a> <span class="dim">Runs on your device. Nothing is uploaded.</span></p>
      </article>
    </main>

    <footer class="foot">
      <p>Built by <a href="${SITE.author.url}" rel="noopener">${SITE.author.name}</a> · <a href="${SITE.repo}" rel="noopener">source (MIT)</a> · <a href="/guides/">guides</a></p>
    </footer>
    <script type="module" src="/src/guide.ts"></script>
  </body>
</html>
`;
}

const author = { '@type': 'Person', name: SITE.author.name, url: SITE.author.url };
const crumbs = (items) => ({
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: items.map(([name, path], i) => ({ '@type': 'ListItem', position: i + 1, name, item: SITE.origin + path })),
});

rmSync(join(site, 'guides'), { recursive: true, force: true });

for (const g of GUIDES) {
  const path = `/guides/${g.slug}/`;
  const html = page({
    path,
    title: g.title,
    description: g.description,
    h1: g.h1,
    body: g.body,
    ld: [
      {
        '@context': 'https://schema.org',
        '@type': 'Article',
        headline: g.title,
        description: g.description,
        datePublished: g.published,
        dateModified: g.updated,
        author,
        image: `${SITE.origin}/og.png`,
        mainEntityOfPage: SITE.origin + path,
      },
      crumbs([['reveal', '/'], ['Guides', '/guides/'], [g.h1, path]]),
    ],
  });
  mkdirSync(join(site, 'guides', g.slug), { recursive: true });
  writeFileSync(join(site, 'guides', g.slug, 'index.html'), html);
}

const list = GUIDES.map((g) => `<li><a href="/guides/${g.slug}/"><strong>${esc(g.h1)}</strong></a><br /><span class="dim">${esc(g.description)}</span></li>`).join('\n  ');
writeFileSync(
  join(site, 'guides', 'index.html'),
  page({
    path: '/guides/',
    type: 'website',
    title: 'Photo privacy guides: location, EXIF, hidden video',
    h1: 'Photo privacy guides',
    lede: 'What a photo gives away when you share the original file, and how to stop it on iPhone and Android.',
    description: 'Short guides on photo metadata: what EXIF reveals, removing the location on iPhone and Android, hidden motion-photo video, and which ways of sharing keep the original file.',
    body: `<ul class="guide-list">\n  ${list}\n</ul>`,
    ld: [crumbs([['reveal', '/'], ['Guides', '/guides/']])],
  }),
);

const newest = GUIDES.map((g) => g.updated).sort().at(-1);
const urls = [
  ['/', newest],
  ['/guides/', newest],
  ...GUIDES.map((g) => [`/guides/${g.slug}/`, g.updated]),
];
writeFileSync(
  join(site, 'public', 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(([p, d]) => `  <url><loc>${SITE.origin}${p}</loc><lastmod>${d}</lastmod></url>`).join('\n')}
</urlset>
`,
);
console.log(`rendered ${GUIDES.length} guides, guides index and sitemap.xml`);
