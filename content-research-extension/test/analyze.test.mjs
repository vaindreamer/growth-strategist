import assert from 'node:assert/strict';
import test from 'node:test';
import { scoreItems, research, toTemplate, remixIdeas, toCSV, summarize, fmt, median } from '../lib/analyze.js';

const mk = (title, views, ageHours, extra = {}) => ({ platform: 'youtube', title, url: 'https://y/' + title, author: 'coach', views, ageHours, format: 'video', ...extra });

test('median & fmt', () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([1, 2, 3, 4]), 2.5);
  assert.equal(fmt(1234), '1.2K');
  assert.equal(fmt(15_300_000), '15M');
});

test('outlier and tiers', () => {
  const items = [mk('a', 1000, 100), mk('b', 1200, 100), mk('c', 900, 100), mk('d', 1100, 100), mk('I tried 5 glute exercises for 30 days', 25000, 48, { likes: 2000, comments: 300 })];
  const s = scoreItems(items);
  const top = s.find((i) => i.views === 25000);
  assert.ok(top.outlier > 20, 'outlier vs creator median');
  assert.equal(top.tier, 'viral');
  assert.ok(s.filter((i) => i.tier === 'viral').length === 1);
  assert.equal(summarize(s).viral, 1);
});

test('shorts compared with shorts, engagement unknown when no interactions', () => {
  const vids = [1, 2, 3].map((n) => mk('v' + n, 10000, 100));
  const shorts = [1, 2, 3].map((n) => mk('s' + n, 300000, 100, { format: 'short' }));
  const s = scoreItems([...vids, ...shorts]);
  assert.ok(s.every((i) => Math.abs(i.outlier - 1) < 1e-9));
  assert.ok(s.every((i) => i.engagement === null));
});

test('reddit uses score as reach', () => {
  const s = scoreItems([{ platform: 'reddit', title: 'x', url: 'u1', score: 10, likes: 10, comments: 5, ageHours: 5 }, { platform: 'reddit', title: 'y', url: 'u2', score: 1000, likes: 1000, comments: 50, ageHours: 5 }, { platform: 'reddit', title: 'z', url: 'u3', score: 20, likes: 20, comments: 2, ageHours: 5 }]);
  assert.equal(s[1].reach, 1000);
  assert.equal(s[1].outlier, 50);
});

test('research finds winning patterns', () => {
  const titles = [
    ['5 glute mistakes killing your gains', 90000], ['Stop doing squats like this', 70000], ['3 mistakes beginners make in the gym', 80000],
    ['My Monday workout', 2000], ['Gym vlog day 4', 1500], ['Leg day', 1800], ['Morning routine', 2100], ['Chest and back session', 1900],
    ['Full body at home', 2500], ['Protein oats recipe', 2200], ['Never skip this glute exercise', 60000], ['Upper body pump', 1700]
  ];
  const s = scoreItems(titles.map(([t, v]) => mk(t, v, 200)));
  const r = research(s);
  assert.ok(r.enough);
  const neg = r.patterns.find((p) => p.key === 'negative');
  assert.ok(neg && neg.lift > 5, 'negative/mistake hooks over-perform');
  assert.ok(r.keywords.some((k) => k.word === 'mistakes' || k.word === 'glute'));
});

test('templates and remix', () => {
  assert.equal(toTemplate('I lost 20 lbs in 30 days doing pilates', ['pilates']), 'I lost [N LBS] in [N] days doing [TOPIC]');
  assert.equal(toTemplate('Stop doing squats like this'), 'Stop doing [TOPIC] like this');
  assert.equal(toTemplate('5 glute mistakes killing your gains'), '[N] [TOPIC] mistakes killing your [TOPIC]');
  const r = remixIdeas(mk('Stop doing crunches', 1000, 10), { niche: 'core training', audience: 'new moms' });
  assert.equal(r.ideas.length, 5);
  assert.ok(r.ideas.some((i) => i.includes('new moms')));
});

test('csv escaping', () => {
  const csv = toCSV([{ title: 'a, "b"', views: 3 }]);
  assert.ok(csv.split('\n')[1].includes('"a, ""b"""'));
});
