#!/usr/bin/env python3
"""Render a video spec with HyperFrames (HTML + GSAP motion graphics) + ffmpeg.

    python3 build_hf.py SPEC.json [--out OUT.mp4] [--quality draft|looks|delivery] [--snap]

Pipeline
  1. ffmpeg   cleans the voice segment (high-pass, denoise, compression, loudness)
  2. PIL      prepares photos (EXIF rotate, trims letterbox bars, crop, blurred fill)
  3. numpy    mixes a sound-effects track from ../sfx/*.wav, timed to the animations
  4. python   writes a HyperFrames project (index.html + GSAP timeline)
  5. hyperframes render  -> raw.mp4
  6. ffmpeg   final loudness (-14 LUFS with voice; peak-limited SFX-only) + faststart
  7. --snap   preview contact sheet (one frame per scene) for QC

The edit style follows spec["platform"]: "tiktok" (fast punch-ins, flashes, glitch,
slam text, big 1-2 word captions, louder SFX) or "reel" (smooth push/wipe
transitions, mask-rise text, 3-word captions, softer SFX). See ../SKILL.md.
"""
import argparse
import html
import json
import os
import re
import shutil
import subprocess
import sys
import wave
from pathlib import Path

import numpy as np
from PIL import Image, ImageEnhance, ImageFilter, ImageOps

SKILL = Path(__file__).resolve().parent.parent
HF_VERSION = "0.9.59"
SR = 48000

PRESETS = {
    "tiktok": {"hook": "slam", "tip": "pop", "quote": "type", "list": "pop",
               "transitions": ["punch", "glitch", "punch", "flash"], "cap_words": 2,
               "cap_size": 108, "sfx_gain": 0.9},
    "reel": {"hook": "rise", "tip": "rise", "quote": "type", "list": "slide",
             "transitions": ["push", "wipe", "zoom", "push"], "cap_words": 3,
             "cap_size": 88, "sfx_gain": 0.55},
}


def run(cmd, cwd=None, env=None):
    r = subprocess.run(cmd, cwd=cwd, env=env, capture_output=True, text=True)
    if r.returncode != 0:
        sys.exit(f"FAILED: {' '.join(map(str, cmd))}\n{r.stdout[-1500:]}\n{r.stderr[-2500:]}")
    return r.stdout


def duration(p):
    return float(run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                      "-of", "default=nw=1:nk=1", str(p)]).strip())


# ------------------------------------------------------------------ text helpers
def words_with_hl(text):
    """'Do *these 3* things.' -> [('Do',F),('these',T),('3',T),('things.',F)]"""
    out = []
    for k, seg in enumerate(re.split(r"\*", str(text))):
        for w in seg.split():
            out.append([w, k % 2 == 1])
    merged = []
    for w, hl in out:  # glue stray punctuation ('*word*.') onto the previous word
        if merged and re.fullmatch(r"[.,!?;:\"'”’)]+", w):
            merged[-1][0] += w
        else:
            merged.append([w, hl])
    return [(w, hl) for w, hl in merged]


def rich(text, chars=False):
    """Masked word spans (.m > .w); each highlighted phrase shares one .hlg box.
    chars=True also splits words into .c spans for the typewriter effect."""
    parts, group = [], []

    def flush():
        if group:
            parts.append('<span class="hlg">' + " ".join(group) + "</span>")
            group.clear()

    for w, hl in words_with_hl(text):
        inner = ("".join(f'<span class="c">{html.escape(ch)}</span>' for ch in w)
                 if chars else html.escape(w))
        span = f'<span class="m"><span class="w">{inner}</span></span>'
        if hl:
            group.append(span)
        else:
            flush()
            parts.append(span)
    flush()
    return " ".join(parts)


def plain_len(text):
    return len(str(text).replace("*", ""))


def size_for(text, base, per_char_drop, minimum):
    return max(minimum, int(base - max(0, plain_len(text) - 12) * per_char_drop))


# ------------------------------------------------------------------ assets
def prep_photo(src, dst, crop=None):
    im = ImageOps.exif_transpose(Image.open(src)).convert("RGB")
    gray = im.convert("L").point(lambda v: 255 if v > 18 else 0)
    bbox = gray.getbbox()
    if bbox and (bbox[2] - bbox[0]) * (bbox[3] - bbox[1]) > 0.4 * im.width * im.height:
        im = im.crop(bbox)
    if crop:  # fractions [left, top, right, bottom]
        l, t, r, b = crop
        im = im.crop((int(l * im.width), int(t * im.height), int(r * im.width),
                      int(b * im.height)))
    if im.width / im.height > 0.68:  # show wide photos whole on a blurred fill
        cw, ch = 1440, 2560
        bg = ImageOps.fit(im, (cw, ch), Image.LANCZOS).filter(ImageFilter.GaussianBlur(45))
        bg = ImageEnhance.Brightness(bg).enhance(0.45)
        fg = ImageOps.contain(im, (cw, ch), Image.LANCZOS)
        bg.paste(fg, ((cw - fg.width) // 2, (ch - fg.height) // 2))
        im = bg
    im.thumbnail((2000, 2600), Image.LANCZOS)
    im.save(dst, quality=92)


def load_words(voice, base, start, end):
    cands = [voice.get("transcript")] if voice.get("transcript") else []
    src = base / voice["src"]
    cands += [src.with_suffix(".words.json"), src.parent / (src.stem + ".words.json")]
    for c in cands:
        p = base / c if not Path(c).is_absolute() else Path(c)
        if p.exists():
            d = json.loads(p.read_text())
            ws = d["words"] if isinstance(d, dict) else d
            ws = [{"word": w.get("word", w.get("text", "")).strip(), "start": w["start"],
                   "end": w["end"]} for w in ws]
            return [w for w in ws if w["word"] and w["end"] > start and w["start"] < end]
    return None


def chunks(words, max_words):
    out, cur = [], []
    for w in words:
        cur.append(w)
        if len(cur) >= max_words or re.search(r"[.,!?;:]$", w["word"]):
            out.append(cur)
            cur = []
    if cur:
        out.append(cur)
    return out


def read_wav(p):
    with wave.open(str(p)) as w:
        x = np.frombuffer(w.readframes(w.getnframes()), dtype="<i2").astype(np.float32) / 32767
        if w.getnchannels() == 2:
            x = x.reshape(-1, 2).mean(axis=1)
        sr = w.getframerate()
    if sr != SR:  # simple resample
        x = np.interp(np.arange(0, len(x), sr / SR), np.arange(len(x)), x)
    return x


def mix_sfx(events, total, gain, path):
    sfx_dir = SKILL / "sfx"
    if not (sfx_dir / "click.wav").exists():
        run([sys.executable, str(SKILL / "scripts" / "make_sfx.py")])
    track = np.zeros(int(SR * (total + 0.5)), dtype=np.float32)
    cache = {}
    for name, at, g in events:
        if name not in cache:
            f = sfx_dir / f"{name}.wav"
            if not f.exists():
                print(f"WARNING: unknown sfx '{name}'", file=sys.stderr)
                continue
            cache[name] = read_wav(f)
        s = cache[name]
        i = int(max(at, 0) * SR)
        if i >= len(track):
            continue
        n = min(len(s), len(track) - i)
        track[i:i + n] += s[:n] * g * gain
    peak = np.max(np.abs(track)) or 1
    if peak > 0.95:
        track *= 0.95 / peak
    pcm = (track * 32767).astype("<i2")
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())


# ------------------------------------------------------------------ html/css
CURSOR_SVG = ('<svg viewBox="0 0 24 24" width="84" height="84"><path d="M3 2 L3 19 L8 14.5 '
              'L11.5 22 L14.5 20.7 L11 13.3 L18 13.3 Z" fill="#fff" stroke="#000" '
              'stroke-width="1.4" stroke-linejoin="round"/></svg>')

CSS = """
@font-face{font-family:MontX;src:url(fonts/Montserrat-ExtraBold.ttf);font-weight:800}
@font-face{font-family:MontS;src:url(fonts/Montserrat-SemiBold.ttf);font-weight:600}
@font-face{font-family:LatoB;src:url(fonts/Lato-Bold.ttf);font-weight:700}
@font-face{font-family:LatoK;src:url(fonts/Lato-Black.ttf);font-weight:900}
:root{--bg:%(primary)s;--surface:%(surface)s;--accent:%(accent)s;--cream:%(cream)s;--ink:%(text)s}
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:1080px;height:1920px;overflow:hidden;background:var(--bg)}
#root{position:relative;width:1080px;height:1920px;overflow:hidden;font-family:LatoB,'Noto Color Emoji',sans-serif;color:var(--ink)}
.clip{position:absolute;inset:0}
.scene{overflow:hidden;transform-origin:50%% 50%%}
.bgdark{background:radial-gradient(120%% 80%% at 50%% 35%%,var(--surface) 0%%,var(--bg) 70%%)}
.grid{position:absolute;inset:0;opacity:.07;background-image:linear-gradient(var(--cream) 2px,transparent 2px),linear-gradient(90deg,var(--cream) 2px,transparent 2px);background-size:90px 90px}
.stripe{position:absolute;left:-200px;width:1500px;height:26px;background:var(--accent);transform:rotate(-8deg)}
.m{display:inline-block;vertical-align:top;padding:0 .02em}
.rise .m{overflow:hidden;padding-bottom:.08em;margin-bottom:-.08em}
.w{display:inline-block;white-space:pre}
.c{display:none}
.hlg{color:var(--accent)}
.box .hlg{color:var(--bg);background:linear-gradient(var(--accent),var(--accent)) no-repeat;background-size:100%% 100%%;
  padding:0 .14em;border-radius:.1em;box-decoration-break:clone;-webkit-box-decoration-break:clone}
.head{font-family:MontX,'Noto Color Emoji';font-weight:800;line-height:1.1;letter-spacing:-.01em;text-align:center}
.kicker{display:inline-block;font-family:LatoK;font-weight:900;text-transform:uppercase;letter-spacing:.08em;
  background:var(--accent);color:var(--bg);font-size:42px;padding:14px 34px;border-radius:999px}
.center{position:absolute;left:90px;right:110px;top:0;bottom:0;display:flex;flex-direction:column;
  align-items:center;justify-content:center;gap:44px;padding-bottom:%(pad_bottom)spx}
.photo{position:absolute;inset:0;width:100%%;height:100%%;object-fit:cover;transform-origin:50%% 40%%}
.shade{position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.72) 0%%,rgba(0,0,0,0) 32%%,rgba(0,0,0,0) 58%%,rgba(0,0,0,.65) 100%%)}
.card{position:absolute;left:70px;right:110px;background:rgba(0,0,0,.84);border-left:14px solid var(--accent);
  border-radius:18px;padding:34px 40px;font-family:MontX;font-weight:800;line-height:1.12;text-align:left}
.list{display:flex;flex-direction:column;gap:30px;width:100%%}
.item{display:flex;align-items:center;gap:30px;font-family:LatoB;font-size:56px;line-height:1.15;color:var(--cream)}
.num{position:relative;flex:0 0 84px;height:84px;border-radius:50%%;background:var(--accent);color:var(--bg);font-family:MontX;
  font-size:46px;display:flex;align-items:center;justify-content:center}
.num .ok{position:absolute;inset:0;border-radius:50%%;background:#fff;color:#000;display:flex;align-items:center;justify-content:center;opacity:0}
.body{font-family:LatoB;font-size:54px;line-height:1.3;color:var(--cream);text-align:center}
.qmark{font-family:MontX;font-size:260px;line-height:.6;color:var(--accent)}
.caret{display:inline-block;width:8px;height:.9em;background:var(--accent);vertical-align:-.1em;margin-left:6px}
.logo{width:330px;height:330px;border-radius:50%%;object-fit:cover}
.pill{position:relative;font-family:MontX;font-size:76px;background:var(--accent);color:var(--bg);padding:18px 54px;border-radius:999px}
.pill.alt{background:transparent;color:var(--accent);border:5px solid var(--accent);font-size:62px;padding:12px 44px}
.small{font-family:LatoB;font-size:44px;color:var(--cream);text-align:center;line-height:1.35}
.foot{position:absolute;left:0;right:0;top:1545px;text-align:center;font-family:LatoB;font-size:30px;color:rgba(246,239,225,.75)}
.cursor{position:absolute;width:84px;height:84px;z-index:20;filter:drop-shadow(0 6px 10px rgba(0,0,0,.5))}
.ripple{position:absolute;width:140px;height:140px;margin:-70px 0 0 -70px;border-radius:50%%;border:8px solid #fff;opacity:0;z-index:19}
.flash{position:absolute;inset:0;background:#fff;opacity:0;z-index:30}
.wipe{position:absolute;top:-200px;bottom:-200px;width:1400px;background:var(--accent);z-index:30;transform:skewX(-12deg)}
.sticker{position:absolute;right:120px;top:300px;z-index:15;font-family:MontX;font-size:46px;background:var(--accent);color:#000;
  padding:16px 30px;border-radius:14px;transform:rotate(8deg);box-shadow:0 10px 30px rgba(0,0,0,.45);text-transform:uppercase}
/* chat */
.phone{position:absolute;left:90px;right:110px;top:250px;bottom:520px;background:#111114;border-radius:56px;border:4px solid #2f2f35;overflow:hidden}
.phead{height:150px;display:flex;align-items:center;gap:26px;padding:0 44px;background:#1b1b20;border-bottom:2px solid #2f2f35}
.avatar{width:84px;height:84px;border-radius:50%%;background:var(--accent);color:#000;font-family:MontX;font-size:40px;display:flex;align-items:center;justify-content:center}
.pname{font-family:MontS;font-size:44px}
.psub{font-family:LatoB;font-size:28px;color:#9a9aa3}
.msgs{position:absolute;left:0;right:0;top:150px;bottom:0;padding:40px 34px;display:flex;flex-direction:column;gap:22px;justify-content:flex-end}
.bub{max-width:80%%;font-family:LatoB,'Noto Color Emoji';font-size:44px;line-height:1.25;padding:22px 30px;border-radius:38px}
.bub.them{align-self:flex-start;background:#2c2c32;color:#fff;border-bottom-left-radius:10px}
.bub.me{align-self:flex-end;background:var(--accent);color:#000;border-bottom-right-radius:10px}
.dots{align-self:flex-start;background:#2c2c32;border-radius:38px;padding:26px 30px;display:flex;gap:12px}
.dots i{width:16px;height:16px;border-radius:50%%;background:#9a9aa3;display:block}
.ctitle{position:absolute;left:90px;right:110px;top:1440px;text-align:center}
/* search */
.sbar{position:relative;display:flex;align-items:center;gap:26px;width:100%%;background:#fff;color:#111;border-radius:999px;padding:32px 44px;
  font-family:LatoB;font-size:50px;box-shadow:0 20px 50px rgba(0,0,0,.5)}
.sbar svg{flex:0 0 52px}
.result{position:relative;width:100%%;background:#fff;color:#111;border-radius:34px;padding:38px 42px;display:flex;gap:30px;align-items:center;
  box-shadow:0 20px 50px rgba(0,0,0,.5);text-align:left}
.result img{width:150px;height:150px;border-radius:50%%;background:#000}
.rname{font-family:MontX;font-size:46px;line-height:1.1}
.rmeta{font-family:LatoB;font-size:34px;color:#555;margin-top:8px}
.rstars{font-family:LatoB;font-size:34px;color:#e0a800;margin-top:6px}
.rbtn{display:inline-block;margin-top:16px;font-family:MontX;font-size:34px;background:var(--accent);color:#000;border-radius:999px;padding:10px 30px}
/* call */
.callbg{position:absolute;inset:0;background:linear-gradient(180deg,#1d1d22,#000)}
.caller{position:absolute;left:0;right:0;top:330px;text-align:center}
.cav{width:260px;height:260px;border-radius:50%%;margin:0 auto 40px;background:var(--surface);border:6px solid var(--accent);overflow:hidden;
  display:flex;align-items:center;justify-content:center;font-family:MontX;font-size:110px;color:var(--accent)}
.cav img{width:100%%;height:100%%;object-fit:cover}
.cname{font-family:MontS;font-size:72px}
.csub{font-family:LatoB;font-size:40px;color:#a9a9b0;margin-top:14px}
.cring{position:absolute;left:50%%;top:460px;width:260px;height:260px;margin-left:-130px;border-radius:50%%;border:6px solid var(--accent);opacity:0}
.cbtns{position:absolute;left:0;right:0;top:1140px;display:flex;justify-content:center;gap:260px}
.cbtn{position:relative;width:160px;height:160px;border-radius:50%%;display:flex;align-items:center;justify-content:center}
.cbtn.no{background:#e5484d}.cbtn.yes{background:#30c35a}
.cbtn svg{width:80px;height:80px}
/* captions */
.cap{position:absolute;left:80px;right:120px;top:1210px;height:240px;display:flex;align-items:flex-end;
  justify-content:center;flex-wrap:wrap;gap:0 22px;text-align:center}
.cw{position:relative;display:inline-block;font-family:MontX;font-weight:800;font-size:%(cap_size)spx;line-height:1.05;
  text-transform:uppercase;color:#fff;-webkit-text-stroke:12px #000;paint-order:stroke fill;text-shadow:0 6px 18px rgba(0,0,0,.6)}
.cw .on{position:absolute;left:0;top:0;color:var(--accent);opacity:0}
"""

PHONE_SVG = ('<svg viewBox="0 0 24 24"><path fill="#fff" d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2'
             'c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1A17 17 0 0 1 3 4c0-.6.4-1 1-1'
             'h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1z"/></svg>')
SEARCH_SVG = ('<svg viewBox="0 0 24 24" width="52" height="52"><circle cx="10" cy="10" r="7" fill="none" '
              'stroke="#555" stroke-width="2.6"/><path d="M15.5 15.5 L21 21" stroke="#555" stroke-width="2.8" '
              'stroke-linecap="round"/></svg>')


class Builder:
    def __init__(self, brand, preset, total, captions_on):
        self.brand, self.p, self.total = brand, preset, total
        self.captions_on = captions_on
        self.tl, self.sfx = [], []

    # timeline / sfx helpers
    def add(self, js):
        self.tl.append(js)

    def s(self, name, at, gain=1.0):
        self.sfx.append((name, at, gain))

    def animate_head(self, sel, anim, at, sid):
        """Animate the words in `sel`; returns the time the text has landed."""
        w = f"#{sid} {sel} .w"
        if anim == "slam":
            self.add(f'tl.from("#{sid} {sel}",{{scale:2.6,opacity:0,duration:.32,ease:"power4.in"}},{at:.3f});')
            self.add(f'tl.fromTo("#{sid}",{{x:-14}},{{x:0,duration:.35,ease:"elastic.out(1.2,0.3)"}},{at + .32:.3f});')
            self.s("boom", at + .3, .9)
            end = at + .4
        elif anim == "rise":
            self.add(f'tl.from("{w}",{{yPercent:110,opacity:0,duration:.55,ease:"power3.out",stagger:.06}},{at:.3f});')
            self.s("swipe", at, .7)
            end = at + .55 + .06 * 6
        elif anim == "shake":
            self.add(f'tl.from("{w}",{{scale:0,duration:.35,ease:"back.out(2.4)",stagger:.06}},{at:.3f});')
            self.add(f'tl.to("#{sid} {sel}",{{x:12,duration:.05,repeat:7,yoyo:true,ease:"none"}},{at + .5:.3f});')
            self.s("glitch", at + .5, .8)
            end = at + .9
        elif anim == "slide":
            self.add(f'tl.from("{w}",{{x:-90,opacity:0,skewX:-12,duration:.4,ease:"power3.out",stagger:.05}},{at:.3f});')
            self.s("swipe", at, .7)
            end = at + .6
        else:  # pop
            self.add(f'tl.from("{w}",{{scale:0,opacity:0,duration:.38,ease:"back.out(2.2)",stagger:.07}},{at:.3f});')
            self.s("pop", at, .8)
            self.s("pop", at + .21, .6)
            end = at + .6
        # highlight box swipes in after the words land
        self.add(f'tl.from("#{sid} {sel}.box .hlg",{{backgroundSize:"0% 100%",color:"{self.brand['colors']['accent']}",duration:.35,ease:"power2.out"}},{end:.3f});')
        return end

    def cursor_click(self, sid, target_id, at, start_xy=(380, 420), tip=(0.7, 0.55)):
        """Cursor (child of the target) glides in and clicks it."""
        tx, ty = tip
        cur = (f'<div class="cursor" id="{sid}cur" style="left:{tx * 100:.0f}%;top:{ty * 100:.0f}%">{CURSOR_SVG}</div>'
               f'<div class="ripple" id="{sid}rip" style="left:{tx * 100:.0f}%;top:{ty * 100:.0f}%"></div>')
        sx, sy = start_xy
        self.add(f'tl.fromTo("#{sid}cur",{{x:{sx},y:{sy},opacity:0}},{{x:0,y:0,opacity:1,duration:.7,ease:"power2.inOut"}},{at:.3f});')
        self.add(f'tl.to("#{sid}cur",{{scale:.82,duration:.08,yoyo:true,repeat:1}},{at + .72:.3f});')
        self.add(f'tl.to("#{target_id}",{{scale:.93,duration:.08,yoyo:true,repeat:1}},{at + .72:.3f});')
        self.add(f'tl.fromTo("#{sid}rip",{{scale:.2,opacity:.9}},{{scale:1.4,opacity:0,duration:.45}},{at + .74:.3f});')
        self.s("click", at + .7, 1.0)
        return cur

    def transition(self, sid, kind, t0, idx):
        if kind == "punch":
            self.add(f'tl.from("#{sid}",{{scale:1.35,duration:.28,ease:"power3.out"}},{t0:.3f});')
            self.add(f'tl.fromTo("#flash",{{opacity:.85}},{{opacity:0,duration:.22,immediateRender:false}},{t0:.3f});')
            self.s("whoosh", t0 - .15, .8)
        elif kind == "flash":
            self.add(f'tl.fromTo("#flash",{{opacity:1}},{{opacity:0,duration:.3,immediateRender:false}},{t0:.3f});')
            self.s("shutter", t0 - .02, .9)
        elif kind == "glitch":
            self.add(f'tl.fromTo("#{sid}",{{x:-40,skewX:8}},{{x:0,skewX:0,duration:.25,ease:"steps(5)"}},{t0:.3f});')
            self.add(f'tl.fromTo("#{sid}",{{filter:"hue-rotate(90deg) saturate(3)"}},{{filter:"hue-rotate(0deg) saturate(1)",duration:.25,ease:"steps(4)"}},{t0:.3f});')
            self.s("glitch", t0 - .05, .8)
        elif kind == "push":
            self.add(f'tl.from("#{sid}",{{yPercent:100,duration:.5,ease:"power3.out"}},{t0:.3f});')
            self.s("whoosh", t0 - .2, .7)
        elif kind == "zoom":
            self.add(f'tl.from("#{sid}",{{scale:.75,opacity:0,duration:.5,ease:"power2.out"}},{t0:.3f});')
            self.s("swipe", t0 - .05, .6)
        elif kind == "wipe":
            self.add(f'tl.fromTo("#wipe",{{x:-1500}},{{x:1300,duration:.6,ease:"power2.inOut",immediateRender:false}},{t0 - .3:.3f});')
            self.s("whoosh", t0 - .3, .8)

    # ---------------------------------------------------------------- scenes
    def scene(self, i, sc, t0, dur, photos):
        b, p = self.brand, self.p
        sid = f"s{i}"
        typ = sc.get("type", "slide")
        style = sc.get("style", "tip") if typ == "slide" else typ
        attrs = (f'id="{sid}" class="clip scene" data-start="{t0:.3f}" '
                 f'data-duration="{dur:.3f}" data-track-index="0"')
        foot = (f'<div class="foot">{html.escape(b["business_name"])} • '
                f'{html.escape(b["license_line"])}</div>')
        a = t0 + 0.12
        if i > 0:
            kind = sc.get("transition") or p["transitions"][(i - 1) % len(p["transitions"])]
            self.transition(sid, kind, t0, i)
            a = t0 + 0.3
        kick = ""
        if sc.get("kicker"):
            kick = f'<div class="kicker" id="{sid}k">{html.escape(sc["kicker"])}</div>'
            self.add(f'tl.from("#{sid}k",{{scale:.3,opacity:0,rotation:-8,duration:.4,ease:"back.out(2.4)"}},{a:.3f});')
            self.s("pop", a, .7)
            a += .25
        sticker = ""
        if sc.get("sticker"):
            st = t0 + min(dur * .45, 1.6)
            sticker = f'<div class="sticker" id="{sid}st">{html.escape(sc["sticker"])}</div>'
            self.add(f'tl.from("#{sid}st",{{scale:0,rotation:-30,duration:.4,ease:"back.out(2.5)"}},{st:.3f});')
            self.s("pop", st, .9)

        anim = sc.get("anim") or p.get(style, "pop")
        bgslide = ('<div class="bgdark clip"></div><div class="grid"></div>'
                   '<div class="stripe" style="top:150px"></div>'
                   '<div class="stripe" style="top:1700px;opacity:.9"></div>')
        self.add(f'tl.from("#{sid} .stripe",{{x:-1600,duration:.6,ease:"power3.out",stagger:.1}},{t0:.3f});')

        if style == "photo":
            src = photos[i]
            motion = sc.get("motion", ["zoom_in", "pan_right", "zoom_out", "pan_left"][i % 4])
            frm, to = {"zoom_in": ("scale:1.0", "scale:1.14"),
                       "zoom_out": ("scale:1.16", "scale:1.0"),
                       "pan_left": ("scale:1.14,x:50", "scale:1.14,x:-50"),
                       "pan_right": ("scale:1.14,x:-50", "scale:1.14,x:50"),
                       "pan_up": ("scale:1.14,y:60", "scale:1.14,y:-60")}[motion]
            self.add(f'tl.fromTo("#{sid}p",{{{frm}}},{{{to},duration:{dur:.3f},ease:"none"}},{t0:.3f});')
            if p is PRESETS["tiktok"] and dur > 3.2:  # mid-scene punch-in
                mid = t0 + dur * .55
                self.add(f'tl.to("#{sid}p",{{scale:"+=0.12",duration:.12,ease:"power4.out"}},{mid:.3f});')
                self.s("swipe", mid - .05, .5)
            pos = sc.get("text_position", "top")
            top = {"top": 230, "center": 760, "bottom": 880 if self.captions_on else 1180}[pos]
            card = ""
            if sc.get("text"):
                fs = size_for(sc["text"], 82, 1.1, 58)
                cls = "card rise" if anim == "rise" else "card"
                chars = anim == "type"
                card = (f'<div class="{cls}" id="{sid}c" style="top:{top}px;font-size:{fs}px">'
                        f'{rich(sc["text"], chars)}</div>')
                self.add(f'tl.from("#{sid}c",{{x:-140,opacity:0,duration:.45,ease:"power3.out"}},{a:.3f});')
                self.s("swipe", a, .6)
                self.head_anim(f"#{sid}", ".card", anim, a + .2, sid, sc["text"])
            focus = sc.get("focus", "50% 35%")
            return (f'<div {attrs}><img id="{sid}p" class="photo" src="{src}" '
                    f'style="object-position:{focus}"><div class="shade"></div>{card}{sticker}</div>')

        if style == "chat":
            return self.chat(sid, sc, attrs, t0, dur, a, sticker)
        if style == "search":
            return self.search(sid, sc, attrs, t0, dur, a, bgslide, sticker)
        if style == "call":
            return self.call(sid, sc, attrs, t0, dur, a, sticker)

        title = sc.get("title", "")
        body = sc.get("body", [])
        body = [body] if isinstance(body, str) else body
        rcls = " rise" if anim == "rise" else ""
        chars = anim == "type"

        if style in ("hook", "quote"):
            fs = size_for(title, 132, 2.0, 84) if style == "hook" else size_for(title, 96, 1.2, 66)
            q = '<div class="qmark" id="%sq">“</div>' % sid if style == "quote" else ""
            caret = '<span class="caret" id="%scar"></span>' % sid if chars else ""
            inner = (f'{kick}{q}<div class="head box{rcls}" style="font-size:{fs}px">'
                     f'{rich(title, chars)}{caret}</div>')
            if q:
                self.add(f'tl.from("#{sid}q",{{scale:0,rotation:-40,duration:.45,ease:"back.out(2)"}},{a:.3f});')
                a += .2
            self.head_anim(f"#{sid}", ".head", anim, a, sid, title)
            if chars:
                self.add(f'tl.to("#{sid}car",{{opacity:0,duration:.01,repeat:{int(dur * 2)},yoyo:true,repeatDelay:.25}},{t0:.3f});')
            self.add(f'tl.fromTo("#{sid} .center",{{scale:1}},{{scale:1.05,duration:{dur:.3f},ease:"none"}},{t0:.3f});')
        elif style == "list":
            fs = size_for(title, 100, 1.5, 70)
            items = "".join(
                f'<div class="item" id="{sid}i{k}"><div class="num">{k + 1}<span class="ok">✓</span></div>'
                f'<div>{rich(t)}</div></div>' for k, t in enumerate(body))
            inner = (f'{kick}<div class="head{rcls}" style="font-size:{fs}px">{rich(title)}</div>'
                     f'<div class="list">{items}</div>')
            land = self.head_anim(f"#{sid}", ".head", anim if anim != "slide" else "rise", a, sid, title)
            gap = min(0.75, max(0.3, (dur - (land - t0) - 0.8) / max(len(body), 1)))
            for k in range(len(body)):
                at = land + .1 + k * gap
                if anim == "pop":
                    self.add(f'tl.from("#{sid}i{k}",{{scale:0,opacity:0,duration:.35,ease:"back.out(2)"}},{at:.3f});')
                    self.s("pop", at, .7)
                else:
                    self.add(f'tl.from("#{sid}i{k}",{{x:-160,opacity:0,duration:.4,ease:"power3.out"}},{at:.3f});')
                    self.s("swipe", at, .45)
                if sc.get("check", True):
                    self.add(f'tl.to("#{sid}i{k} .ok",{{opacity:1,duration:.15}},{at + .45:.3f});')
                    self.add(f'tl.fromTo("#{sid}i{k} .num",{{scale:1.35}},{{scale:1,duration:.3,ease:"back.out(3)"}},{at + .45:.3f});')
                    self.s("tick", at + .45, .8)
        elif style == "cta":
            fs = size_for(title or "Need help fast?", 104, 1.5, 76)
            alt = (f'<div class="pill alt" id="{sid}p2">{html.escape(b["phone_alt"])}</div>'
                   if b.get("phone_alt") else "")
            extra = "".join(f'<div class="small">{rich(x)}</div>' for x in body)
            click_at = a + 1.3
            cur = self.cursor_click(sid, f"{sid}p1", click_at) if dur >= 3 else ""
            inner = (f'<img class="logo" id="{sid}l" src="logo.png">'
                     f'<div class="head{rcls}" style="font-size:{fs}px">{rich(title or "Need help fast?")}</div>'
                     f'<div class="pill" id="{sid}p1">{html.escape(b["phone"])}{cur}</div>{alt}'
                     f'<div class="small">{html.escape(b["cta_primary"])}</div>{extra}'
                     f'<div class="small" style="font-size:34px;opacity:.85">'
                     f'{html.escape(b["legal_name"])} • {html.escape(b["license_line"])}<br>'
                     f'{html.escape(b["website"])}</div>')
            self.add(f'tl.from("#{sid}l",{{scale:0,rotation:-200,duration:.7,ease:"back.out(1.6)"}},{a:.3f});')
            self.s("whoosh", a - .1, .6)
            self.head_anim(f"#{sid}", ".head", "rise" if anim == "rise" else "pop", a + .35, sid, title)
            self.add(f'tl.from("#{sid}p1",{{scale:.5,opacity:0,duration:.45,ease:"back.out(2.2)"}},{a + .75:.3f});')
            self.s("pop", a + .75, .7)
            if alt:
                self.add(f'tl.from("#{sid}p2",{{scale:.5,opacity:0,duration:.45,ease:"back.out(2.2)"}},{a + .95:.3f});')
            if cur:
                self.s("ring", click_at + .95, .35)
            foot = ""
        else:  # tip
            fs = size_for(title, 104, 1.6, 70)
            bod = "".join(f'<div class="body" id="{sid}b{k}">{rich(x)}</div>' for k, x in enumerate(body))
            inner = f'{kick}<div class="head box{rcls}" style="font-size:{fs}px">{rich(title, chars)}</div>{bod}'
            land = self.head_anim(f"#{sid}", ".head", anim, a, sid, title)
            for k in range(len(body)):
                self.add(f'tl.from("#{sid}b{k}",{{y:40,opacity:0,duration:.5,ease:"power2.out"}},{land + .25 + k * .4:.3f});')
        return f'<div {attrs}>{bgslide}<div class="center">{inner}</div>{foot}{sticker}</div>'

    def head_anim(self, scope, sel, anim, at, sid, text):
        if anim == "type":
            n = plain_len(text)
            self.add(f'tl.set("{scope} {sel} .w",{{opacity:1}},0);')
            self.add(f'(function(){{var cs=document.querySelectorAll("{scope} {sel} .c");'
                     f'cs.forEach(function(c,i){{tl.set(c,{{display:"inline"}},{at:.3f}+i*0.045);}});}})();')
            k = 0
            while k < n:
                self.s("key", at + k * .045, .7)
                k += 2
            end = at + n * .045
            self.add(f'tl.from("{scope} {sel}.box .hlg",{{backgroundSize:"0% 100%",color:"{self.brand['colors']['accent']}",duration:.35,ease:"power2.out"}},{end:.3f});')
            return end
        # reuse animate_head with an id-scoped selector
        return self.animate_head(sel, anim, at, sid)

    def chat(self, sid, sc, attrs, t0, dur, a, sticker):
        msgs = sc.get("messages", [])
        contact = sc.get("contact", "Mom")
        initial = html.escape(contact[:1].upper())
        title = sc.get("title")
        per = max(0.55, min(1.2, (dur - 1.2) / max(len(msgs), 1)))
        bubbles = []
        at = a + .3
        for k, m in enumerate(msgs):
            who = "me" if m.get("from") == "me" else "them"
            if who == "them":
                bubbles.append(f'<div class="dots" id="{sid}d{k}"><i></i><i></i><i></i></div>')
                self.add(f'tl.set("#{sid}d{k}",{{display:"none"}},0);')
                self.add(f'tl.set("#{sid}d{k}",{{display:"flex"}},{at:.3f});')
                self.add(f'tl.fromTo("#{sid}d{k}",{{opacity:0,scale:.6}},{{opacity:1,scale:1,duration:.15}},{at:.3f});')
                self.add(f'tl.to("#{sid}d{k} i",{{y:-10,duration:.18,stagger:.08,yoyo:true,repeat:1}},{at + .05:.3f});')
                self.add(f'tl.set("#{sid}d{k}",{{display:"none"}},{at + per * .45:.3f});')
                show = at + per * .45
            else:
                show = at + .1
            bubbles.append(f'<div class="bub {who}" id="{sid}m{k}">{html.escape(m["text"])}</div>')
            self.add(f'tl.set("#{sid}m{k}",{{display:"none"}},0);')
            self.add(f'tl.set("#{sid}m{k}",{{display:"block"}},{show:.3f});')
            self.add(f'tl.from("#{sid}m{k}",{{scale:.4,opacity:0,y:40,duration:.3,ease:"back.out(2)",'
                     f'transformOrigin:"{"0% 100%" if who == "them" else "100% 100%"}"}},{show:.3f});')
            self.s("ding" if (k == 0 and who == "them") else ("pop" if who == "them" else "swipe"),
                   show, .55 if k == 0 else .7)
            at += per
        ttl = ""
        if title:
            fs = size_for(title, 84, 1.2, 60)
            ttl = f'<div class="ctitle head box" style="font-size:{fs}px">{rich(title)}</div>'
            self.animate_head(".ctitle", "pop", min(at, t0 + dur - 1.2), sid)
        self.add(f'tl.from("#{sid} .phone",{{y:180,opacity:0,duration:.45,ease:"power3.out"}},{t0 + .05:.3f});')
        return (f'<div {attrs}><div class="bgdark clip"></div><div class="grid"></div>'
                f'<div class="phone"><div class="phead"><div class="avatar">{initial}</div><div>'
                f'<div class="pname">{html.escape(contact)}</div><div class="psub">'
                f'{html.escape(sc.get("status", "now"))}</div></div></div>'
                f'<div class="msgs">{"".join(bubbles)}</div></div>{ttl}{sticker}</div>')

    def search(self, sid, sc, attrs, t0, dur, a, bgslide, sticker):
        b = self.brand
        q = sc.get("query", "bail bondsman near me")
        chars = "".join(f'<span class="c">{html.escape(ch)}</span>' for ch in q)
        type_at = a + .2
        for k in range(0, len(q), 2):
            self.s("key", type_at + k * .05, .7)
        self.add(f'(function(){{var cs=document.querySelectorAll("#{sid} .sbar .c");'
                 f'cs.forEach(function(c,i){{tl.set(c,{{display:"inline"}},{type_at:.3f}+i*0.05);}});}})();')
        typed = type_at + len(q) * .05
        self.s("click", typed + .15, .6)  # enter
        res_at = typed + .35
        self.add(f'tl.from("#{sid}res",{{y:80,opacity:0,duration:.45,ease:"back.out(1.6)"}},{res_at:.3f});')
        self.s("pop", res_at, .7)
        click_at = res_at + .5
        cur = self.cursor_click(sid, f"{sid}res", click_at, (320, 380), (0.8, 0.6)) \
            if click_at + 1 < t0 + dur else ""
        title = sc.get("title", "")
        ttl = ""
        if title:
            fs = size_for(title, 92, 1.4, 64)
            ttl = f'<div class="head box" id="{sid}h" style="font-size:{fs}px">{rich(title)}</div>'
            self.animate_head("#" + sid + "h", "pop", min(click_at + 1.0, t0 + dur - .9), sid)
        self.add(f'tl.from("#{sid} .sbar",{{scaleX:.3,opacity:0,duration:.4,ease:"power3.out"}},{a:.3f});')
        self.s("swipe", a, .6)
        return (f'<div {attrs}>{bgslide}<div class="center" style="gap:50px;justify-content:flex-start;padding-top:330px">'
                f'<div class="sbar">{SEARCH_SVG}<span>{chars}<span class="caret"></span></span></div>'
                f'<div class="result" id="{sid}res"><img src="logo.png"><div>'
                f'<div class="rname">{html.escape(b["business_name"])}</div>'
                f'<div class="rmeta">Bail bonds · Open 24 hours · Wilmington, DE</div>'
                f'<div class="rbtn">Call {html.escape(b["phone"])}</div></div>{cur}</div>'
                f'{ttl}</div>{sticker}</div>')

    def call(self, sid, sc, attrs, t0, dur, a, sticker):
        caller = sc.get("caller", "Unknown")
        sub = sc.get("sub", "incoming call…")
        title = sc.get("title", "")
        av = ('<img src="logo.png">' if sc.get("avatar") == "logo"
              else html.escape(caller[:1].upper()))
        self.s("ring", t0 + .1, .8)
        self.add(f'tl.fromTo("#{sid} .cring",{{scale:1,opacity:.8}},{{scale:1.6,opacity:0,duration:1,repeat:{max(int(dur), 1)},ease:"power1.out"}},{t0:.3f});')
        self.add(f'tl.to("#{sid} .cav",{{x:6,duration:.05,repeat:9,yoyo:true}},{t0 + .1:.3f});')
        self.add(f'tl.to("#{sid} .cav",{{x:6,duration:.05,repeat:9,yoyo:true}},{t0 + 1.3:.3f});')
        ans = sc.get("answer", True) and dur >= 3.2
        cur = ""
        if ans:
            click_at = t0 + 1.3
            cur = self.cursor_click(sid, f"{sid}yes", click_at, (-260, 360), (0.55, 0.6))
            self.add(f'tl.to("#{sid} .csub",{{opacity:0,duration:.1}},{click_at + .8:.3f});')
            self.add(f'tl.set("#{sid}conn",{{opacity:1}},{click_at + .9:.3f});')
        ttl = ""
        if title:
            fs = size_for(title, 84, 1.2, 60)
            ttl = f'<div class="ctitle head box" style="top:1420px;font-size:{fs}px">{rich(title)}</div>'
            self.animate_head(".ctitle", "slam" if self.p is PRESETS["tiktok"] else "rise",
                              t0 + min(dur - 1.0, 2.4 if ans else .8), sid)
        return (f'<div {attrs}><div class="callbg"></div><div class="cring"></div>'
                f'<div class="caller"><div class="cav">{av}</div><div class="cname">{html.escape(caller)}</div>'
                f'<div class="csub">{html.escape(sub)}</div>'
                f'<div class="csub" id="{sid}conn" style="opacity:0;color:#30c35a;margin-top:-52px">00:01</div></div>'
                f'<div class="cbtns"><div class="cbtn no">{PHONE_SVG}</div>'
                f'<div class="cbtn yes" id="{sid}yes">{PHONE_SVG}{cur}</div></div>{ttl}{sticker}</div>')


# ------------------------------------------------------------------ build
def build(spec_path, out, quality, snap):
    spec_path = spec_path.resolve()
    base = spec_path.parent
    spec = json.loads(spec_path.read_text())
    brand = json.loads((SKILL / "brand.json").read_text())
    sid = spec.get("id", spec_path.stem)
    platform = spec.get("platform") or ("tiktok" if "tiktok" in sid else "reel")
    preset = PRESETS[platform]
    proj = base / ".hf" / sid
    if proj.exists():
        shutil.rmtree(proj)
    (proj / "fonts").mkdir(parents=True)
    for f in (SKILL / "fonts").glob("*.ttf"):
        shutil.copy(f, proj / "fonts" / f.name)
    shutil.copy(SKILL / "vendor" / "gsap.min.js", proj / "gsap.min.js")
    shutil.copy(SKILL / brand["logo"], proj / "logo.png")

    scenes = spec["scenes"]
    voice = spec.get("voice")
    words = None
    vlen = 0
    if voice:
        vs = float(voice.get("start", 0))
        ve = float(voice.get("end") or duration(base / voice["src"]))
        run(["ffmpeg", "-y", "-v", "error", "-ss", str(vs), "-to", str(ve), "-i",
             str(base / voice["src"]), "-af",
             "highpass=f=80,afftdn=nf=-25,acompressor=threshold=-18dB:ratio=3:attack=5:release=120,"
             "loudnorm=I=-15:TP=-1.5:LRA=11", "-ar", "48000", "-ac", "1", str(proj / "voice.wav")])
        vlen = duration(proj / "voice.wav")
        total = vlen + float(voice.get("tail", 0.8))
        if spec.get("captions", "auto") == "auto":
            words = load_words(voice, base, vs, ve)
            if words is None:
                print("WARNING: no transcript (.words.json); rendering without captions.",
                      file=sys.stderr)
            else:
                words = [dict(w, start=max(w["start"] - vs, 0), end=w["end"] - vs) for w in words]
    else:
        total = sum(float(s.get("duration", 3)) for s in scenes)

    fixed = sum(float(s["duration"]) for s in scenes if "duration" in s)
    flex = [s for s in scenes if "duration" not in s]
    each = max((total - fixed) / len(flex), 1.2) if flex else 0
    durs = [float(s.get("duration", each)) for s in scenes]
    if voice:
        durs[-1] = max(total - sum(durs[:-1]), 1.5)
    total = sum(durs)

    photos = {}
    for i, s in enumerate(scenes):
        if s.get("type") == "photo":
            name = f"photo{i}.jpg"
            prep_photo(base / s["src"], proj / name, s.get("crop"))
            photos[i] = name

    bld = Builder(brand, preset, total, bool(words))
    parts, t = [], 0.0
    for i, (s, d) in enumerate(zip(scenes, durs)):
        parts.append(bld.scene(i, s, t, d, photos))
        for ev in s.get("sfx", []):  # extra per-scene sounds: {"name":"cash","at":1.2}
            bld.s(ev["name"], t + float(ev.get("at", 0)), float(ev.get("gain", 1)))
        t += d

    caps = []
    if words:
        tt = preset is PRESETS["tiktok"]
        cks = chunks(words, preset["cap_words"])
        for k, ch in enumerate(cks):
            cs = ch[0]["start"]
            nxt = cks[k + 1][0]["start"] if k + 1 < len(cks) else total
            ce = min(ch[-1]["end"] + 0.12, nxt, total)
            if ce <= cs:
                continue
            spans = []
            for j, w in enumerate(ch):
                txt = html.escape(w["word"].upper())
                spans.append(f'<span class="cw" id="c{k}w{j}">{txt}<span class="on">{txt}</span></span>')
                bld.add(f'tl.set("#c{k}w{j} .on",{{opacity:1}},{w["start"]:.3f});')
                bld.add(f'tl.fromTo("#c{k}w{j}",{{scale:1}},{{scale:1.12,duration:.08,yoyo:true,repeat:1}},{w["start"]:.3f});')
                if j + 1 < len(ch):
                    bld.add(f'tl.set("#c{k}w{j} .on",{{opacity:0}},{ch[j + 1]["start"]:.3f});')
            if tt:
                bld.add(f'tl.from("#c{k}",{{scale:.5,opacity:0,duration:.16,ease:"back.out(3)"}},{cs:.3f});')
            else:
                bld.add(f'tl.from("#c{k}",{{y:30,opacity:0,duration:.14}},{cs:.3f});')
            caps.append(f'<div id="c{k}" class="cap clip" data-start="{cs:.3f}" '
                        f'data-duration="{ce - cs:.3f}" data-track-index="2">{"".join(spans)}</div>')

    sfx_on = spec.get("sfx", True)
    if sfx_on and bld.sfx:
        gain = preset["sfx_gain"] * (0.45 if voice else 1.0) * float(spec.get("sfx_volume", 1))
        mix_sfx(bld.sfx, total, gain, proj / "sfx.wav")

    audio = []
    if voice:
        audio.append(f'<audio id="vo" src="voice.wav" data-start="0" data-duration="{vlen:.3f}" '
                     f'data-volume="1" data-track-index="3"></audio>')
    if sfx_on and bld.sfx:
        audio.append(f'<audio id="fx" src="sfx.wav" data-start="0" data-duration="{total:.3f}" '
                     f'data-volume="1" data-track-index="5"></audio>')
    music = spec.get("music")
    if music:
        shutil.copy(base / music["src"], proj / ("music" + Path(music["src"]).suffix))
        mv = float(music.get("volume", 0.10 if voice else 0.8))
        audio.append(f'<audio id="mu" src="music{Path(music["src"]).suffix}" data-start="0" '
                     f'data-duration="{total:.3f}" data-volume="{mv}" data-fade-in="0.5" '
                     f'data-fade-out="1.5" data-track-index="4"></audio>')

    css = CSS % dict(brand["colors"], pad_bottom=380 if words else 200,
                     cap_size=preset["cap_size"])
    doc = f"""<!doctype html>
<html lang="en" data-resolution="portrait">
<head><meta charset="UTF-8"><meta name="viewport" content="width=1080, height=1920">
<script src="gsap.min.js"></script><style>{css}</style></head>
<body>
<div id="root" data-composition-id="main" data-start="0" data-duration="{total:.3f}" data-width="1080" data-height="1920">
{chr(10).join(parts)}
{chr(10).join(caps)}
<div id="wipe" class="wipe" style="transform:translateX(-1500px) skewX(-12deg)"></div>
<div id="flash" class="flash"></div>
{chr(10).join(audio)}
</div>
<script>
window.__timelines = window.__timelines || {{}};
const tl = gsap.timeline({{ paused: true }});
{chr(10).join(bld.tl)}
window.__timelines["main"] = tl;
tl.seek(0);
</script>
</body></html>
"""
    (proj / "index.html").write_text(doc)
    (proj / "hyperframes.json").write_text(json.dumps({"paths": {"assets": "."}}))
    (proj / "meta.json").write_text(json.dumps({"id": sid, "name": sid}))

    env = dict(os.environ, NODE_USE_ENV_PROXY="1", HYPERFRAMES_SKIP_SKILLS="1",
               NODE_EXTRA_CA_CERTS=os.environ.get("NODE_EXTRA_CA_CERTS",
                                                  "/root/.ccr/ca-bundle.crt"))
    raw = proj / "raw.mp4"
    run(["npx", "--yes", f"hyperframes@{HF_VERSION}", "render", "-q", quality,
         "-o", str(raw)], cwd=proj, env=env)

    out = Path(out).resolve() if out else base / f"{sid}.mp4"
    has_audio = bool(voice or music or (sfx_on and bld.sfx))
    cmd = ["ffmpeg", "-y", "-v", "error", "-i", str(raw), "-c:v", "copy"]
    if has_audio:
        af = ("loudnorm=I=-14:TP=-1.5:LRA=11" if (voice or music)
              else "alimiter=limit=0.8:level=false")
        cmd += ["-af", af, "-c:a", "aac", "-b:a", "192k", "-ar", "48000"]
    cmd += ["-movflags", "+faststart", str(out)]
    run(cmd)
    if snap:
        times = [0.7] + [sum(durs[:i]) + durs[i] * 0.8 for i in range(len(durs))]
        frames = []
        for k, ts in enumerate(times):
            f = proj / f"snap{k}.jpg"
            run(["ffmpeg", "-y", "-v", "error", "-ss", f"{min(ts, total - 0.05):.2f}", "-i",
                 str(out), "-frames:v", "1", "-vf", "scale=360:-1", str(f)])
            frames.append(f)
        args = sum([["-i", str(f)] for f in frames], [])
        run(["ffmpeg", "-y", "-v", "error", *args, "-filter_complex",
             f"hstack={len(frames)}", str(out.with_name(out.stem + "_preview.jpg"))])
    print(f"OK {out} ({total:.1f}s, {platform}, {len(scenes)} scenes, "
          f"captions={'yes' if words else 'no'}, sfx={len(bld.sfx) if sfx_on else 0}, "
          f"music={'yes' if music else 'no'})")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("spec")
    ap.add_argument("--out")
    ap.add_argument("--quality", default="looks", choices=["draft", "looks", "delivery"])
    ap.add_argument("--snap", action="store_true", help="save a preview contact sheet")
    a = ap.parse_args()
    build(Path(a.spec), a.out, a.quality, a.snap)
