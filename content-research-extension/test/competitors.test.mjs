import assert from 'node:assert/strict';
import test from 'node:test';
import { parseCompetitor } from '../competitors.js';
import { commentInsights, competitorSummary, scoreItems } from '../lib/analyze.js';

test('parse competitor links and handles', () => {
  assert.equal(parseCompetitor('https://www.instagram.com/abcbail/?hl=en').id, 'instagram:abcbail');
  assert.equal(parseCompetitor('instagram.com/abcbail/reels/').handle, 'abcbail');
  assert.equal(parseCompetitor('https://www.tiktok.com/@bail.tx?lang=en').id, 'tiktok:bail.tx');
  assert.equal(parseCompetitor('https://www.facebook.com/profile.php?id=1000123').handle, 'profile.php?id=1000123');
  assert.equal(parseCompetitor('https://web.facebook.com/QuickBailFL').id, 'facebook:quickbailfl');
  assert.equal(parseCompetitor('@freedom_bail', 'tiktok').id, 'tiktok:freedom_bail');
  assert.equal(parseCompetitor('https://www.instagram.com/p/ABC123/'), null);
  assert.equal(parseCompetitor('not a link here'), null);
});

test('comment insights', () => {
  const posts = [{ url: 'a', topComments: [{ text: 'How much is the fee?', likes: 30 }, { text: 'Do you take payment plans?', likes: 50 }, { text: 'Thank you so much 🙏' }, { text: 'total scam' }] }];
  const r = commentInsights(posts);
  assert.equal(r.n, 4);
  assert.equal(r.intents[0].key, 'price');
  assert.equal(r.questions[0].text, 'Do you take payment plans?');
  assert.ok(r.intents.some((i) => i.key === 'complaint'));
});

test('competitor summary', () => {
  const day = 864e5;
  const posts = scoreItems([0, 2, 4, 6, 8].map((d, i) => ({ platform: 'tiktok', author: 'x', title: 'p' + i + ' #bail', url: 'u' + i, views: [1000, 2000, 50000, 1500, 1200][i], likes: 100, comments: 5, format: 'short', postedAt: new Date(Date.now() - d * day).toISOString(), durationSec: 30 })));
  const s = competitorSummary(posts, { followers: 10000 });
  assert.equal(s.posts, 5);
  assert.equal(s.medianViews, 1500);
  assert.ok(Math.abs(s.postsPerWeek - 3.5) < 0.01);
  assert.equal(s.best.views, 50000);
  assert.equal(s.hashtags[0].tag, 'bail');
  assert.equal(s.viewsPerFollower, 0.15);
});
