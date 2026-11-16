import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';
// @ts-expect-error plain ESM content module shared with scripts/site-pages.mjs
import { FAQ, SITE } from './content/pages.mjs';

const headers = JSON.parse(readFileSync(new URL('./security-headers.json', import.meta.url), 'utf8')) as Record<string, string>;

// Guide pages are rendered by scripts/site-pages.mjs (npm run prepare-assets) before Vite runs.
const guides = new URL('./guides/', import.meta.url);
const pages: Record<string, string> = { main: new URL('./index.html', import.meta.url).pathname };
if (existsSync(guides)) {
  pages.guides = new URL('index.html', guides).pathname;
  for (const d of readdirSync(guides, { withFileTypes: true })) if (d.isDirectory()) pages[d.name] = new URL(`${d.name}/index.html`, guides).pathname;
}

type Qa = { q: string; a: string };
const ld = (data: unknown) => `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`;
const text = (html: string) => html.replace(/<[^>]+>/g, '');

/** Fill the home page's FAQ and structured data from the shared content module, so both always match. */
function homeContent(): Plugin {
  return {
    name: 'reveal-home-content',
    transformIndexHtml: {
      order: 'pre',
      handler(html, ctx) {
        if (!ctx.path.endsWith('/index.html') || ctx.path.includes('/guides/')) return html;
        const faq = (FAQ as Qa[]).map(({ q, a }) => `<details><summary>${q}</summary><p>${a}</p></details>`).join('\n        ');
        const data = [
          {
            '@context': 'https://schema.org',
            '@type': 'WebApplication',
            name: 'reveal',
            url: `${SITE.origin}/`,
            description: 'See and remove the hidden data in a photo (location, device serials, names, hidden video) before sharing it. Runs entirely in the browser; nothing is uploaded.',
            applicationCategory: 'UtilitiesApplication',
            operatingSystem: 'Any (web browser)',
            browserRequirements: 'Requires JavaScript',
            isAccessibleForFree: true,
            offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
            author: { '@type': 'Person', name: SITE.author.name, url: SITE.author.url },
            sameAs: [SITE.repo, 'https://www.npmjs.com/package/safe-upload'],
          },
          {
            '@context': 'https://schema.org',
            '@type': 'FAQPage',
            mainEntity: (FAQ as Qa[]).map(({ q, a }) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: text(a) } })),
          },
        ];
        return html.replace('<!-- faq -->', faq).replace('<!-- structured-data -->', data.map(ld).join('\n    '));
      },
    },
  };
}

export default defineConfig({
  base: '/',
  define: { __CSP__: JSON.stringify(headers['Content-Security-Policy']) },
  plugins: [homeContent()],
  build: { target: 'es2022', outDir: 'dist', emptyOutDir: true, assetsInlineLimit: 0, sourcemap: false, rollupOptions: { input: pages } },
  // The dev server needs inline styles for HMR, so only preview mirrors production headers exactly.
  preview: { headers },
});
