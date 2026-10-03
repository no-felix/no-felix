import assert from 'node:assert/strict';
import test from 'node:test';
import { fetchViewCount, parseViewCount, renderViewCount } from './profile-views.mjs';

const badge = (count, shadow = count) => `<svg xmlns="http://www.w3.org/2000/svg">
  <text>Profile views</text><text>Profile views</text>
  <text>${shadow}</text><text>${count}</text>
</svg>`;

test('parses zero, plain and comma-separated counts', () => {
  assert.equal(parseViewCount(badge('0')), 0);
  assert.equal(parseViewCount(badge('1024')), 1024);
  assert.equal(parseViewCount(badge('1,024')), 1024);
});

test('rejects malformed or inconsistent counter responses', () => {
  for (const svg of [
    '', '<html>Error</html>', badge('-1'), badge('1.2k'),
    badge('1,02'), badge('100', '99'), badge('9007199254740992'),
    '<svg><text>100</text><text>100</text></svg>',
  ]) {
    assert.throws(() => parseViewCount(svg));
  }
});

test('fetches the existing profile counter with a timeout', async () => {
  const count = await fetchViewCount(async (url, options) => {
    assert.equal(new URL(url).searchParams.get('username'), 'no-felix');
    assert.ok(options.signal instanceof AbortSignal);
    return { ok: true, text: async () => badge('1024') };
  });
  assert.equal(count, 1024);
});

test('surfaces HTTP, network and invalid-response failures', async () => {
  await assert.rejects(fetchViewCount(async () => ({ ok: false, status: 429 })), /HTTP 429/);
  await assert.rejects(fetchViewCount(async () => { throw new Error('Network failure'); }), /Network failure/);
  await assert.rejects(fetchViewCount(async () => ({ ok: true, text: async () => 'Invalid response' })), /not return an SVG/);
});

test('renders a self-contained matching footer with a formatted count', () => {
  const svg = renderViewCount(1024);
  assert.match(svg, /viewBox="0 0 1200 64"/);
  assert.match(svg, /Profile views: 1,024/);
  assert.match(svg, />1,024<\/text>/);
  assert.match(svg, /Updated daily/);
  assert.match(svg, /not unique visitors/);
  assert.doesNotMatch(svg, /<image|<script|monospace|\u2014/);
});

test('does not render invalid counts as successful snapshots', () => {
  for (const count of [-1, NaN, Infinity, 1.5, '1024', Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => renderViewCount(count), /invalid profile view count/);
  }
});
