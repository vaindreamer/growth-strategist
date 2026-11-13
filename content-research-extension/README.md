# Viral Lens – Content Research Chrome Extension

Find out **what content is working for other creators**, how viral it really is, and turn it into ideas for your own brand.

Works on **YouTube, TikTok, Instagram, Facebook, X (Twitter), Reddit and LinkedIn**. On any other website it takes a competitor/landing-page snapshot instead.

## What it does

| Feature | What you get |
|---|---|
| **🕵️ Deep competitor research** | Give it a keyword (e.g. *bail bonds* + city) and it finds competitors on Instagram, TikTok and Facebook — or paste their profile links. It then opens each competitor, scrolls their profile and opens their posts one by one to collect views, likes, comments, shares, saves, captions, dates, video length, sounds, hashtags **and the top comments**. You get a side-by-side competitor report, each competitor's best posts, how often they post, and what the audience asks and complains about |
| **Scan any page** | Pulls every post on the page with views, likes, comments, shares, age |
| **Viral numbers** | **Outlier score** (how many × better than the creator's normal post), **velocity** (views per hour), **engagement rate**, **views ÷ followers**, and a 0–100 **Viral score** (🔥 Viral · 🚀 Outlier · 📈 Above avg) |
| **Badges on the page** | Each post on the page gets a badge like `🔥 12.4x` so you can spot winners while you scroll |
| **Replicate** | For any post: why it's working (hook patterns), a reusable fill-in-the-blank hook template, and 5 ways to remake it for *your* niche |
| **Market research** | Combines your scans (latest, last 7 days, last 30 days, or your swipe file) into: winning hook patterns, words that show up in winners, best formats, best title length, best posting windows, creators to watch, and top posts |
| **Find content** | Type a keyword → one click opens YouTube (sorted by most viewed), TikTok, Instagram hashtag, X (500+ likes only), Reddit (top this month), LinkedIn posts or Google Trends |
| **Saved posts (swipe file)** | Save posts, add notes and #tags, search, export to CSV (Google Sheets / Excel), back up and import as JSON |
| **✨ AI briefs (optional)** | With your own Claude API key: a full market-research brief + 10 content ideas tailored to your brand, a detailed breakdown + 5 scripts for any single post, and competitor-page breakdowns |

Everything except the ✨ buttons works **without AI and without any account**. All data stays in your browser.

## Install (2 minutes)

1. Download this folder (`content-research-extension`) to your computer.
2. In Chrome go to `chrome://extensions`.
3. Turn on **Developer mode** (top-right switch).
4. Click **Load unpacked** and pick the `content-research-extension` folder.
5. Pin the extension (puzzle-piece icon → 📌 next to **Viral Lens**). Click it to open the side panel.

Works in Chrome, Edge, Brave and other Chromium browsers (Chrome 116+).

## Set up your brand (do this once)

Open the side panel → **⚙** tab → fill in your niche, audience, offer, brand voice and platforms → **Save settings**. This makes the remix ideas and AI briefs about *your* business.

**Optional AI:** paste a Claude API key from [console.anthropic.com](https://console.anthropic.com/settings/keys) and click **Test key**. The key is stored only in this browser (`chrome.storage.local`) and is only sent to `api.anthropic.com`. You pay Anthropic directly per use; one market brief is usually a few cents. You can pick Opus (best), Sonnet (faster/cheaper) or Haiku (cheapest).

## How to use it – a 10-minute research routine

1. **Research tab** → type a topic (e.g. `glute workout`) → click **YouTube · most viewed**.
2. On the results page, click **Deep scan** (it scrolls to load more posts, then scans).
3. Repeat on **TikTok**, **Instagram #tag** and **Reddit · top month** for the same topic.
4. Open a few competitor profiles (their *Videos*, *Shorts*, *Reels* or *Posts* tab) and scan them — this is where the **outlier score** is most accurate, because it compares each post with that creator's own normal post.
5. **Scan tab** → filter to **🚀 Outliers & viral** → hit **♻ Replicate** on the best ones, or **☆ Save** them.
6. **Research tab** → *Analyse: All scans – last 7 days* → read the patterns. Click **✨ AI brief + 10 ideas** for a full content plan.
7. **Swipe file** → add notes, then **Export CSV** to plan your content calendar.

### Best pages to scan

| Platform | Scan these pages |
|---|---|
| YouTube | Channel **Videos** or **Shorts** tab, search results (use *Sort by → View count*), home feed |
| TikTok | Creator profile, search → **Videos** tab, hashtag pages |
| Instagram | Creator **Reels** tab (shows view counts), hashtag pages. The normal post grid only shows likes on hover, so Reels tabs give much better data |
| X | Search (Top), a creator's profile |
| Reddit | Any subreddit (best: **Top → This month**), search results, user profiles |
| LinkedIn | Your feed, a creator's **Activity → Posts**, content search |

## Deep competitor research (Competitors tab)

**Before you start:** log in to **Instagram** and **Facebook** in this Chrome browser (TikTok works logged out). Use your normal account.

1. **Find competitors** – type what they do (e.g. `bail bonds`) and optionally a city (`Houston`), tick the platforms, click **Find**. Tick the accounts that are real competitors → **Add ticked to my list**.
   - Or paste profile links / @handles (one per line) and click **Add**, or open a competitor's profile and click **+ Current tab**.
2. **Choose depth** – *Deep* (default) also opens each post and reads the top ~15 comments; *Fast* only collects stats and captions (about 3× quicker).
3. Click **▶ Start deep research**. A research tab opens and you'll see it scroll profiles and open posts. **Keep that tab and the side panel open.** You can click **■ Stop** anytime – results so far are kept.
   - If TikTok shows a "verify you're human" puzzle, or a site asks you to log in, the research **pauses** – solve it/log in in the research tab and it continues by itself.
4. Read the **Competitor report**:
   - **Comparison table** – followers, typical views, engagement, posts per week, best post.
   - **What people say in the comments** – how many comments are about price, how the process works, wanting to contact/buy, praise, complaints and personal stories, plus the **exact questions people ask**. Each question is a video idea.
   - **Each competitor** (click to expand) – their numbers, best format, typical video length, hashtags, and their 5 best posts (♻ Replicate / ☆ Save work here too).
   - **See winning patterns →** opens the Research tab with hooks, words and formats that win across all competitors.
   - **✨ AI competitor report + content plan** – (needs API key) what's working for each competitor, gaps you can own, 15 content ideas, a 30-day posting plan, and compliance watch-outs for regulated industries like bail bonds.
   - **Export CSV** – every post with its numbers and comments, for Google Sheets.

**Time:** about 10 seconds per post in Deep mode (≈ 4 min per competitor at 24 posts), 3 seconds per post in Fast mode. The pauses between steps are deliberate so it browses at a human pace.

**Good to know:** this uses your own logged-in account to look at public profiles, just like you would by hand. Instagram, TikTok and Facebook don't allow heavy automated collection, so keep runs modest (a handful of competitors, not hundreds) — very large or frequent runs could get your account rate-limited or asked to verify. Facebook support is best-effort (Facebook's page layout is hard to read automatically, and it doesn't open individual Facebook posts).

## How the numbers work

- **Outlier** = this post's views ÷ the median views of comparable posts. Comparable means *same creator and same format* (Shorts are compared with Shorts) when the scan has at least 3 of them; otherwise it falls back to the same creator, then the same format on the page, then the whole page. `5x` = five times a normal post.
- **Velocity** = views per hour since it was posted — finds content that is blowing up *right now*.
- **Engagement** = (likes + comments + shares) ÷ views. On Reddit it's comments ÷ upvotes (how much discussion a post sparks).
- **Viral score (0–100)** = up to 60 pts for the outlier multiple (10x = full marks), 25 pts for velocity rank, 15 pts for engagement rank, plus a bonus when a post got more views than the creator has followers.
- **Pattern lift** (Research tab) = median outlier of posts using a pattern ÷ posts not using it. With small samples the numbers swing a lot — scan more pages for reliable results.

## Good to know

- The extension reads only what's already visible on the page you're looking at (plus Reddit's public `.json` listing). It doesn't log in anywhere, doesn't use private APIs, and doesn't send your data anywhere except to Claude when you click a ✨ button.
- Social sites change their layouts often. If a platform suddenly finds 0 posts or no numbers, scroll a bit and scan again; if it keeps failing, the page selectors in `content.js` need updating.
- Some numbers simply aren't shown on some pages (e.g. likes on YouTube listing pages, view counts on Instagram photo posts). Those show as `–` and the score uses whatever is available.
- Use what you learn to make **original** content: copy the format, hook structure and idea — not someone's words, footage or audio.

## Files

```
manifest.json      Chrome extension manifest (MV3, side panel)
background.js      Opens the side panel when you click the toolbar icon
content.js         Page scanner for each platform + on-page badges
sidepanel.*        The side-panel app (Scan, Competitors, Research, Saved, Settings)
competitors.js     Deep competitor research: discovery, profile + post crawling, report
lib/analyze.js     Scoring, market-research patterns, templates, CSV export
lib/ai.js          Optional Claude API calls + prompt templates
test/              Unit tests (npm test), scanner tests (node test/scanner.test.cjs) and the
                   competitor end-to-end test (node test/competitors.e2e.cjs) – the last two need Playwright
```
