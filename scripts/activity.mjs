// Builds assets/activity.svg from the GitHub GraphQL API. No dependencies (Node 20+).
// Usage: GITHUB_TOKEN=... node scripts/activity.mjs [login]
import fs from 'node:fs';

const LOGIN = process.argv[2] || process.env.GITHUB_REPOSITORY_OWNER || 'no-felix';
const TOKEN = process.env.GITHUB_TOKEN;
const OUT = new URL('../assets/activity.svg', import.meta.url);
if (!TOKEN) throw new Error('GITHUB_TOKEN is required');

const query = `query($login: String!, $cursor: String) {
  user(login: $login) {
    repositories(ownerAffiliations: OWNER, isFork: false, privacy: PUBLIC, first: 100, after: $cursor) {
      pageInfo { hasNextPage endCursor }
      nodes { languages(first: 100, orderBy: { field: SIZE, direction: DESC }) { edges { size node { name } } } }
    }
    contributionsCollection {
      totalPullRequestContributions
      contributionCalendar {
        totalContributions
        weeks { contributionDays { date contributionCount contributionLevel } }
      }
    }
  }
}`;

const repositories = [];
let user, cursor = null;
do {
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: { Authorization: `bearer ${TOKEN}`, 'Content-Type': 'application/json', 'User-Agent': 'profile-activity' },
    body: JSON.stringify({ query, variables: { login: LOGIN, cursor } }),
    signal: AbortSignal.timeout(30_000),
  });
  const json = await res.json();
  if (!res.ok || json.errors) throw new Error(JSON.stringify(json.errors || json));
  if (!json.data?.user) throw new Error(`GitHub user not found: ${LOGIN}`);
  user = json.data.user;
  repositories.push(...user.repositories.nodes);
  cursor = user.repositories.pageInfo.hasNextPage ? user.repositories.pageInfo.endCursor : null;
} while (cursor);

const calendar = user.contributionsCollection.contributionCalendar;
const days = calendar.weeks.flatMap((w) => w.contributionDays);
let longest = 0, run = 0;
for (const d of days) { run = d.contributionCount > 0 ? run + 1 : 0; longest = Math.max(longest, run); }

const langTotals = new Map();
for (const repo of repositories) {
  for (const { size, node } of repo.languages.edges) langTotals.set(node.name, (langTotals.get(node.name) || 0) + size);
}
const langSum = [...langTotals.values()].reduce((a, b) => a + b, 0);
const sorted = [...langTotals.entries()].sort((a, b) => b[1] - a[1]);
const top = sorted.slice(0, 5).map(([name, size]) => ({ name, share: size / langSum }));
const rest = 1 - top.reduce((a, l) => a + l.share, 0);
if (rest > 0 && sorted.length > top.length) top.push({ name: 'Other', share: rest });

// ---------- Render ----------
const W = 1200, PAD = 56, INNER = W - PAD * 2;
const C = { bg: '#0b0b10', border: '#1f1f29', text: '#f4f4f5', muted: '#a1a1aa', subtle: '#71717a' };
const SANS = `'Segoe UI', -apple-system, BlinkMacSystemFont, 'Helvetica Neue', Arial, sans-serif`;
const LEVELS = { NONE: '#16161f', FIRST_QUARTILE: '#3b1a66', SECOND_QUARTILE: '#6d28d9', THIRD_QUARTILE: '#9333ea', FOURTH_QUARTILE: '#c084fc' };
const LANG_COLORS = ['#a855f7', '#f97316', '#22d3ee', '#e879f9', '#facc15'];
const OTHER_COLOR = '#3f3f46';
const fmt = (n) => n.toLocaleString('en-US');
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const label = (x, y, text, anchor = 'start') =>
  `<text x="${x}" y="${y}" text-anchor="${anchor}" font-family="${SANS}" font-size="15" font-weight="600" letter-spacing="0.9" fill="${C.muted}">${esc(text)}</text>`;
const langColor = (l, i) => (l.name === 'Other' ? OTHER_COLOR : LANG_COLORS[i]);

const metrics = [
  [fmt(calendar.totalContributions), 'CONTRIBUTIONS'],
  [`${longest} days`, 'LONGEST STREAK'],
  [fmt(user.contributionsCollection.totalPullRequestContributions), 'PULL REQUESTS'],
  [fmt(days.filter((d) => d.contributionCount > 0).length), 'ACTIVE DAYS'],
];
const colW = INNER / metrics.length;
const metricSvg = metrics.map(([value, name], i) => {
  const x = PAD + i * colW;
  return `<text x="${x}" y="150" font-family="${SANS}" font-size="36" font-weight="600" letter-spacing="-0.5" fill="${C.text}">${esc(value)}</text>
  <text x="${x}" y="178" font-family="${SANS}" font-size="14" font-weight="600" letter-spacing="0.9" fill="${C.muted}">${name}</text>`;
}).join('\n  ');

const weeks = calendar.weeks;
const pitch = INNER / weeks.length;
const cell = pitch - 4;
const heatTop = 216;
const heatSvg = weeks.map((w, wi) => w.contributionDays.map((d) => {
  const row = new Date(d.date + 'T00:00:00Z').getUTCDay();
  return `<rect x="${(PAD + wi * pitch).toFixed(1)}" y="${(heatTop + row * pitch).toFixed(1)}" width="${cell.toFixed(1)}" height="${cell.toFixed(1)}" rx="4" fill="${LEVELS[d.contributionLevel]}"/>`;
}).join('')).join('\n  ');

const languageLabelY = Math.round(heatTop + 7 * pitch + 36);
const barY = languageLabelY + 24;
let bx = PAD;
const barSvg = top.map((l, i) => {
  const w = l.share * INNER;
  const seg = `<rect x="${bx.toFixed(1)}" y="${barY}" width="${Math.max(w - 3, 1).toFixed(1)}" height="8" fill="${langColor(l, i)}"/>`;
  bx += w;
  return seg;
}).join('');

let lx = PAD, legendY = barY + 40;
const legendSvg = top.map((l, i) => {
  const pct = `${(l.share * 100).toFixed(1)}%`;
  const width = 18 + (l.name.length + 1 + pct.length) * 8 + 32;
  if (lx + width > W - PAD) { lx = PAD; legendY += 28; }
  const item = `<circle cx="${lx + 5}" cy="${legendY - 4.5}" r="5" fill="${langColor(l, i)}"/>
  <text x="${lx + 18}" y="${legendY}" font-family="${SANS}" font-size="15" fill="${C.muted}">${esc(l.name)} <tspan fill="${C.subtle}">${pct}</tspan></text>`;
  lx += width;
  return item;
}).join('\n  ');

const H = legendY + 44;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" fill="none">
<defs>
  <clipPath id="card"><rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="20"/></clipPath>
  <clipPath id="bar"><rect x="${PAD}" y="${barY}" width="${INNER}" height="8" rx="4"/></clipPath>
</defs>
<g clip-path="url(#card)">
  <rect width="${W}" height="${H}" fill="${C.bg}"/>
  ${label(PAD, 64, 'ACTIVITY')}
  ${label(W - PAD, 64, 'LAST 12 MONTHS', 'end')}
  <rect x="${PAD}" y="80" width="${INNER}" height="1" fill="${C.border}"/>
  ${metricSvg}
  ${heatSvg}
  ${label(PAD, languageLabelY, 'LANGUAGES / OWNED PUBLIC REPOS')}
  <g clip-path="url(#bar)">${barSvg}</g>
  ${legendSvg}
  ${top.length ? '' : label(PAD, legendY, 'NO LANGUAGE DATA IN OWNED PUBLIC REPOS')}
</g>
<rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="20" stroke="${C.border}"/>
</svg>
`;

fs.writeFileSync(OUT, svg);
console.log(`activity.svg: ${calendar.totalContributions} contributions, longest streak ${longest} days, ${top.length} languages`);
