---
name: th-bail-reels
description: Daily faceless short-video production for T & H Bail Bond Agency (Wilmington, Delaware). Produces 4 distinct vertical videos per day (2 Instagram Reels + 2 TikToks) from owner Trisha's voice memos, her approved photos, and animated branded text slides, rendered with HyperFrames (HTML + GSAP) and ffmpeg, with word-by-word captions, plus ready-to-paste captions and hashtags. Use when the user asks for today's videos, reels, TikToks, a content batch, or a week of content for T&H / the bail bond client, or adds new voice recordings or photos.
---

# T & H Bail Bond Agency: daily faceless reels

You are the video editor and content strategist for **T & H Bail Bond Agency LLC**
(owner: Trisha · 625 N King St, Wilmington, DE · 24/7 · all 3 Delaware counties).
Instagram & TikTok: **@thbailbondagencyllc**.
Every day you deliver **4 distinct 9:16 videos**: **2 Instagram Reels** and
**2 TikToks**, each with its own script, edit and caption.

## Ground rules (never break these)
1. **No on-camera video of Trisha.** Photos of her from the Drive folder are fine;
   never request or generate AI likenesses or video of her.
2. **Her real voice only.** Use her memos exactly as spoken. Don't splice words into
   sentences she didn't say. Lines she hasn't recorded go in `needs-recording.md`.
3. **Compliance.** Read `references/content-playbook.md` § Compliance before
   writing. Every video ends on the CTA slide (logo, both phone numbers, DE license #).
4. **Clients stay anonymous.** No names, mugshots, booking records or case details.
5. **Never cover her face** with a text card or caption. Check every preview.

## Tools
| Path | What it is |
|---|---|
| `brand.json` | Business info, phones, license, colors, fonts, logo, Drive folder. **Edit only this to rebrand.** |
| `scripts/build_hf.py` | **Main renderer.** Spec → HyperFrames project (HTML+GSAP: kinetic text, Ken Burns, word-by-word captions) → ffmpeg (voice cleanup, photo prep, loudness −14 LUFS, faststart) → MP4 + preview sheet |
| `scripts/render.py` | Fallback renderer, ffmpeg + PIL only (no browser). Same spec format, simpler motion. Use if HyperFrames fails. |
| `scripts/transcribe.py` | Voice memo → `<name>.words.json` (HyperFrames whisper `small.en`; falls back to faster-whisper, then `--text` + pause timing) |
| `references/content-playbook.md` | Audience, pillars, weekly rotation, hooks, caption/hashtag rules, compliance |
| `examples/*.json` | Spec templates |
| `vendor/gsap.min.js`, `fonts/`, `logo/` | Bundled so renders work offline |

Repo working folders: `content/assets/{voice,photos,music}/` (media, git-ignored;
transcripts + `voice/index.md` are committed), `content/YYYY-MM-DD/` (specs,
`posting.md`, `needs-recording.md` committed; MP4s git-ignored),
`content/assets-log.json` (what was used when).

Requirements: Node 22+ (`npx hyperframes@0.9.59`, auto-installed), ffmpeg, Python 3 + Pillow.
The cloud environment `growth-strategist` allows the hosts this needs (Drive
downloads, Hugging Face for the whisper model, GitHub, the client website).

## Daily workflow

### 1. Sync new media from Google Drive
Folder id is in `brand.json → drive.folder_id`. Files currently sit loose in the folder root.
List them with the Google Drive search tool (`'<folder_id>' in ancestors`), compare
against `content/assets/`, and download new ones **with curl** (not the Drive
download tool, which returns huge base64):
```bash
curl -sSL -o content/assets/photos/NAME.jpeg "https://drive.usercontent.google.com/download?id=FILE_ID&export=download&confirm=t"
```
Images → `photos/` (name `th-photo-N.jpeg`), audio → `voice/` (kebab-case name).
Look at every new photo (make a contact sheet and Read it) and note what it shows.

### 2. Transcribe new voice memos
```bash
python3 .claude/skills/th-bail-reels/scripts/transcribe.py content/assets/voice/FILE.m4a
```
Read the transcript and add its usable segments (start/end seconds + topic) to
`content/assets/voice/index.md`. One memo can feed several videos via `start`/`end`.

### 3. Plan today's 4 videos
Follow the weekly rotation in the playbook. Check `assets-log.json`: no voice
segment reused within 30 days; vary photos (only a few exist, so reuse is OK, but not
the same photo + same motion two days running). Default mix:

| Slot | Platform | Format | Audio |
|---|---|---|---|
| 1 | Reel | Voice story/explainer (20–45 s), scenes timed to her words | her voice + captions + soft SFX |
| 2 | Reel | Animated tips / explainer (15–30 s) | voice segment if available, else text; IG audio added at posting |
| 3 | TikTok | Fast hook / chat POV / myth vs fact (8–18 s) | SFX; trending sound added in TikTok |
| 4 | TikTok | FAQ / services / "can you help with…" (10–20 s) | voice or text + trending sound |

When voice runs out, switch slots to text and add prompts to `needs-recording.md`.

### 4. Write specs
`content/YYYY-MM-DD/<slot>-<platform>-<slug>.json`. For voice videos, read the
`.words.json` and set each scene's `duration` so cuts land on her phrases.
Hook in the first 1.5 s; ≤ 8 words per photo card; ≤ 12 words per slide title.

### 5. Render and QC
```bash
cd content && python3 ../.claude/skills/th-bail-reels/scripts/build_hf.py YYYY-MM-DD/SPEC.json --snap
```
(~1.5 min per video.) **Read** `<id>_preview.jpg` (one frame per scene) and
check: no face covered, text not cut off, captions not overlapping cards, CTA has
logo + phones + license, highlight boxes look right. Fix the spec and re-render.
Use `--quality draft` while iterating.

### 6. Write `posting.md` and `needs-recording.md`
Per video: file, platform, post time, cover text, caption (hook → 2–3 lines → CTA
with phone), 3–5 hashtags, sound suggestion for text videos. See playbook.

### 7. Deliver
Send the MP4s to the user (SendUserFile). If they ask, upload to a
`finished-videos/YYYY-MM-DD` folder in Drive. Update `assets-log.json`, commit
specs/notes/log (not MP4s), and report the 4 titles plus anything Trisha must record or approve.

## Video spec
```jsonc
{
  "id": "2026-11-17-1-reel-take-a-breath",
  "voice": {"src": "../assets/voice/trisha-vm-1.m4a",
            "start": 0, "end": 23.7,      // optional segment
            "tail": 2.2},                 // seconds after she stops (room for CTA)
  "music": {"src": "../assets/music/bed.mp3", "volume": 0.08},  // optional, royalty-free only
  "captions": "auto",                     // auto (needs .words.json) | none
  "scenes": [
    {"type": "slide", "style": "hook", "kicker": "Just got the call?",
     "title": "*First,* take a breath.", "duration": 3.1},
    {"type": "photo", "src": "../assets/photos/th-photo-2.jpeg",
     "text": "You're *not alone* in this", "text_position": "top",
     "focus": "50% 30%", "motion": "zoom_in", "duration": 7.0},
    {"type": "photo", "src": "../assets/photos/th-photo-4.jpeg",
     "crop": [0, 0, 1, 0.78]},            // fractions l,t,r,b: crops out the finger
    {"type": "slide", "style": "list", "title": "Have this *ready*",
     "body": ["Where they're being held", "Their full name", "Date of birth"]},
    {"type": "slide", "style": "cta", "title": "We answer *24/7*",
     "body": ["All 3 Delaware counties"]}
  ]
}
```
- `*phrase*` → yellow highlight (boxed on hook/tip slides). Punctuation next to it is fine.
- Slide styles: `hook`, `tip` (title + body lines), `list` (numbered, ≤ 5), `quote`, `cta`.
- Photo: `motion` = zoom_in | zoom_out | pan_left | pan_right | pan_up; `text_position`
  = top | center | bottom; `focus` = CSS object-position for portrait photos.
  Landscape/square photos are shown whole on a blurred fill automatically.
- Scenes without `duration` split the remaining time. With voice, the video length
  = voice + `tail`, and the last scene stretches to fit.
- Text-only videos carry only sound effects: the trending sound is added in-app at
  posting (licensed music can't be baked in). In TikTok, keep "original sound" at ~50%.

## Edit styles: TikTok vs Reel (`"platform"`)
Set `"platform": "tiktok"` or `"reel"` on every spec (default: guessed from the id).
The two platforms must look different, even when they share a voice memo.

| | **tiktok** (fast, loud, playful) | **reel** (smooth, polished) |
|---|---|---|
| Transitions | punch-in + white flash, glitch, camera flash (rotates) | push-up, yellow wipe, zoom (rotates) |
| Hook text | `slam` (drops in huge + impact boom + screen shake) | `rise` (words slide up out of a mask) |
| Tips/lists | `pop` (words/items bounce in, pop sounds) | `rise` / `slide` |
| Photos | Ken Burns + mid-scene punch-in zoom | slow Ken Burns only |
| Captions | 2 words, 108px, bounce in | 3 words, 88px, slide up |
| SFX level | 0.9 | 0.55 (both ×0.45 under a voice) |

Override per scene with `"anim"`: `slam`, `rise`, `pop`, `slide`, `shake`, `type`
(typewriter with key clicks) and `"transition"`: `punch`, `flash`, `glitch`, `push`, `wipe`, `zoom`.

## Creative scene types
| type | What it shows | Key fields |
|---|---|---|
| `chat` | Phone text thread: typing dots, bubbles pop in (ding/pop/swipe SFX). Emoji OK. | `contact`, `status`, `messages: [{"from":"them"/"me","text"}]`, optional `title` |
| `search` | Search bar types the query (key clicks), result card for T&H appears, cursor glides in and **clicks** it | `query`, optional `title` |
| `call` | Incoming-call screen ringing (ring SFX, pulsing ring), cursor clicks **answer**, timer starts | `caller`, `sub`, `title`, `avatar: "logo"`, `answer: false` |
| `slide` `cta` | Logo spins in; cursor glides to the phone number and **clicks** it (click + ripple + ring) | `title`, `body` |
| `slide` `list` | Items pop/slide in, then numbers flip to ✓ with a tick sound | `check: false` to disable |
| any scene | `"sticker": "Save this"`: rotated yellow tag pops in (pop SFX) | |
| any scene | `"sfx": [{"name": "cash", "at": 1.2, "gain": 0.8}]`: extra sounds (seconds from scene start) | |

Spec-level: `"sfx": false` turns all effects off; `"sfx_volume": 0.7` scales them.

**Sound library** (`sfx/`, generated by `scripts/make_sfx.py`, original/royalty-free):
click, key, typing, pop, whoosh, swipe, ding, ring, boom, riser, tick, glitch, shutter, cash.
To upgrade a sound, drop a better royalty-free WAV with the same name into `sfx/`.

### Creative formats to rotate
- **Group chat POV** (`chat`): a relative texts in panic, "me" answers with the steps → "Send this to the group chat".
- **2 a.m. call** (`call` → `search` → `list`): the call, searching for help, what to have ready.
- **Typewriter quote** (`quote` + `anim: type`): one reassuring line from Trisha.
- **Same memo, two cuts**: a voice memo edited as a smooth Reel and as a punchy TikTok (different scenes, stickers, pacing).

## Current photo notes
| File | Shows | Tips |
|---|---|---|
| th-photo-1.jpeg | Trisha, event backdrop, close/medium | face at top: use `text_position: bottom` |
| th-photo-2.jpeg | Trisha at her office desk, T&H sign | landscape → blurred fill; card at top is safe |
| th-photo-3.jpeg | Trisha full-length, event backdrop | wide → blurred fill |
| th-photo-4.jpeg | Office storefront, 625 N King St | always `crop: [0,0,1,0.78]` (finger in frame) |
