import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

const COUNTER_URL = 'https://komarev.com/ghpvc/?username=no-felix&label=Profile%20views&color=6d28d9&style=flat';

export function parseViewCount(svg) {
  if (!/^\s*<svg\b[\s\S]*<\/svg>\s*$/.test(svg)) {
    throw new Error('Profile counter did not return an SVG');
  }
  const texts = [...svg.matchAll(/<text\b[^>]*>([^<]*)<\/text>/g)].map((match) => match[1].trim());
  const [shadow, value] = texts.slice(-2);
  if (texts.length !== 4 || shadow !== value || !/^(?:\d+|\d{1,3}(?:,\d{3})+)$/.test(value)) {
    throw new Error('Profile counter SVG has an unexpected count format');
  }
  const count = Number(value.replaceAll(',', ''));
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new Error('Profile counter returned an invalid count');
  }
  return count;
}

export async function fetchViewCount(fetchCounter = fetch) {
  const response = await fetchCounter(COUNTER_URL, {
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    throw new Error(`Profile counter request failed: HTTP ${response.status}`);
  }
  return parseViewCount(await response.text());
}

export function renderViewCount(count) {
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new Error('Cannot render an invalid profile view count');
  }
  const formatted = count.toLocaleString('en-US');
  const font = "'Segoe UI', -apple-system, BlinkMacSystemFont, 'Helvetica Neue', Arial, sans-serif";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="64" viewBox="0 0 1200 64" fill="none" role="img" aria-labelledby="title description">
  <title id="title">Profile views: ${formatted}</title>
  <desc id="description">Daily snapshot of Komarev image requests, not unique visitors. Includes counter refresh requests.</desc>
  <rect x="0.5" y="0.5" width="1199" height="63" rx="20" fill="#0b0b10" stroke="#1f1f29"/>
  <text x="56" y="39" font-family="${font}" font-size="15" font-weight="600" letter-spacing="0.9" fill="#a1a1aa">PROFILE VIEWS</text>
  <text x="205" y="41" font-family="${font}" font-size="22" font-weight="600" fill="#f4f4f5">${formatted}</text>
  <text x="1144" y="39" text-anchor="end" font-family="${font}" font-size="15" fill="#a1a1aa">Updated daily</text>
</svg>
`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const count = await fetchViewCount();
  fs.writeFileSync(new URL('../assets/profile-views.svg', import.meta.url), renderViewCount(count));
  console.log(`profile-views.svg: ${count.toLocaleString('en-US')} image requests`);
}
