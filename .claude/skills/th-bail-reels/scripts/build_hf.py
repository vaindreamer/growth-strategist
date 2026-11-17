#!/usr/bin/env python3
"""Render a video spec with HyperFrames (HTML + GSAP motion graphics) + ffmpeg.

    python3 build_hf.py SPEC.json [--out OUT.mp4] [--quality draft|looks|delivery] [--snap]

Pipeline
  1. ffmpeg   cleans the voice segment (high-pass, compression, loudness) -> voice.wav
  2. PIL      prepares photos (EXIF rotate, trims black letterbox bars, optional crop)
  3. python   writes a HyperFrames project (index.html with GSAP timeline, fonts, logo)
  4. hyperframes render  -> raw.mp4  (animated text, Ken Burns, word-by-word captions)
  5. ffmpeg   final loudness normalisation (-14 LUFS) + faststart -> OUT.mp4
  6. --snap   saves preview frames next to OUT.mp4 for QC

Same spec format as render.py (see ../SKILL.md). render.py stays as the fast,
browser-free fallback.
"""
import argparse
import html
import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageEnhance, ImageFilter, ImageOps

SKILL = Path(__file__).resolve().parent.parent
HF_VERSION = "0.9.59"
W, H = 1080, 1920


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
    """'Do *these 3* things.' -> [('Do',False),('these',True),('3',True),('things.',False)]
    A *phrase* may sit next to punctuation: '*matters*.' or '"*9 to 5.*"'."""
    out = []
    for k, seg in enumerate(re.split(r"\*", str(text))):
        hl = k % 2 == 1
        for w in seg.split():
            out.append([w, hl])
    # glue punctuation-only tokens (from '*word*.') onto the previous word
    merged = []
    for w, hl in out:
        if merged and re.fullmatch(r"[.,!?;:\"'”’)]+", w):
            merged[-1][0] += w
        else:
            merged.append([w, hl])
    # punctuation split from the word it follows ('*word*.' -> 'word' + '.') has no
    # leading space in the source, so also re-join tokens that were split mid-word
    return [(w, hl) for w, hl in merged]


def rich(text, cls="w"):
    """Words as stagger-able spans; each highlighted phrase shares one accent box."""
    html_parts, group = [], []

    def flush():
        if group:
            html_parts.append('<span class="hlg">' + " ".join(group) + "</span>")
            group.clear()

    for w, hl in words_with_hl(text):
        span = f'<span class="{cls}">{html.escape(w)}</span>'
        if hl:
            group.append(span)
        else:
            flush()
            html_parts.append(span)
    flush()
    return " ".join(html_parts)


def size_for(text, base, per_char_drop, minimum):
    n = len(str(text).replace("*", ""))
    return max(minimum, int(base - max(0, n - 12) * per_char_drop))


# ------------------------------------------------------------------ assets
def prep_photo(src, dst, crop=None):
    im = ImageOps.exif_transpose(Image.open(src)).convert("RGB")
    # trim near-black letterbox bars (phone screenshots)
    gray = im.convert("L").point(lambda v: 255 if v > 18 else 0)
    bbox = gray.getbbox()
    if bbox and (bbox[2] - bbox[0]) * (bbox[3] - bbox[1]) > 0.4 * im.width * im.height:
        im = im.crop(bbox)
    if crop:  # fractions [left, top, right, bottom]
        l, t, r, b = crop
        im = im.crop((int(l * im.width), int(t * im.height), int(r * im.width),
                      int(b * im.height)))
    # Landscape / square photos: cropping to 9:16 would cut people out, so place the
    # whole photo on a blurred, darkened copy of itself (9:16 canvas).
    if im.width / im.height > 0.68:
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


def chunks(words, max_words=3):
    out, cur = [], []
    for w in words:
        cur.append(w)
        if len(cur) >= max_words or re.search(r"[.,!?;:]$", w["word"]):
            out.append(cur)
            cur = []
    if cur:
        out.append(cur)
    return out


# ------------------------------------------------------------------ html
CSS = """
@font-face{font-family:MontX;src:url(fonts/Montserrat-ExtraBold.ttf);font-weight:800}
@font-face{font-family:MontS;src:url(fonts/Montserrat-SemiBold.ttf);font-weight:600}
@font-face{font-family:LatoB;src:url(fonts/Lato-Bold.ttf);font-weight:700}
@font-face{font-family:LatoK;src:url(fonts/Lato-Black.ttf);font-weight:900}
:root{--bg:%(primary)s;--surface:%(surface)s;--accent:%(accent)s;--cream:%(cream)s;--ink:%(text)s}
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:1080px;height:1920px;overflow:hidden;background:var(--bg)}
#root{position:relative;width:1080px;height:1920px;overflow:hidden;font-family:LatoB,sans-serif;color:var(--ink)}
.clip{position:absolute;inset:0}
.scene{overflow:hidden}
.bgdark{background:radial-gradient(120%% 80%% at 50%% 35%%,var(--surface) 0%%,var(--bg) 70%%)}
.stripe{position:absolute;left:-200px;width:1500px;height:26px;background:var(--accent);transform:rotate(-8deg)}
.w{display:inline-block;white-space:pre}
.hlg{color:var(--accent)}
.box .hlg{color:var(--bg);background:var(--accent);padding:0 .14em;border-radius:.1em;box-decoration-break:clone;-webkit-box-decoration-break:clone}
.head{font-family:MontX;font-weight:800;line-height:1.08;letter-spacing:-.01em;text-align:center}
.kicker{display:inline-block;font-family:LatoK;font-weight:900;text-transform:uppercase;letter-spacing:.08em;
  background:var(--accent);color:var(--bg);font-size:42px;padding:14px 34px;border-radius:999px}
.center{position:absolute;left:90px;right:90px;top:0;bottom:0;display:flex;flex-direction:column;
  align-items:center;justify-content:center;gap:44px;padding-bottom:%(pad_bottom)spx}
.photo{position:absolute;inset:0;width:100%%;height:100%%;object-fit:cover;transform-origin:50%% 40%%}
.shade{position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.72) 0%%,rgba(0,0,0,0) 32%%,rgba(0,0,0,0) 58%%,rgba(0,0,0,.65) 100%%)}
.card{position:absolute;left:70px;right:70px;background:rgba(0,0,0,.82);border-left:14px solid var(--accent);
  border-radius:18px;padding:34px 40px;font-family:MontX;font-weight:800;line-height:1.1;text-align:left}
.list{display:flex;flex-direction:column;gap:30px;width:100%%}
.item{display:flex;align-items:center;gap:30px;font-family:LatoB;font-size:56px;line-height:1.15;color:var(--cream)}
.num{flex:0 0 84px;height:84px;border-radius:50%%;background:var(--accent);color:var(--bg);font-family:MontX;
  font-size:46px;display:flex;align-items:center;justify-content:center}
.body{font-family:LatoB;font-size:54px;line-height:1.3;color:var(--cream);text-align:center}
.qmark{font-family:MontX;font-size:260px;line-height:.6;color:var(--accent)}
.logo{width:330px;height:330px;border-radius:50%%;object-fit:cover}
.pill{font-family:MontX;font-size:76px;background:var(--accent);color:var(--bg);padding:18px 54px;border-radius:999px}
.pill.alt{background:transparent;color:var(--accent);border:5px solid var(--accent);font-size:62px;padding:12px 44px}
.small{font-family:LatoB;font-size:44px;color:var(--cream);text-align:center;line-height:1.35}
.foot{position:absolute;left:0;right:0;top:1545px;text-align:center;font-family:LatoB;font-size:30px;color:rgba(246,239,225,.75)}
.cap{position:absolute;left:80px;right:110px;top:1230px;height:220px;display:flex;align-items:flex-end;
  justify-content:center;flex-wrap:wrap;gap:0 22px;text-align:center}
.cw{position:relative;display:inline-block;font-family:MontX;font-weight:800;font-size:92px;line-height:1.05;
  text-transform:uppercase;color:#fff;-webkit-text-stroke:12px #000;paint-order:stroke fill;
  text-shadow:0 6px 18px rgba(0,0,0,.6)}
.cw .on{position:absolute;left:0;top:0;color:var(--accent);opacity:0}
"""


def scene_html(i, sc, brand, t0, dur, tl, photos, captions_on):
    sid = f"s{i}"
    style = sc.get("style", "tip") if sc.get("type", "slide") == "slide" else "photo"
    attrs = f'id="{sid}" class="clip scene" data-start="{t0:.3f}" data-duration="{dur:.3f}" data-track-index="0"'
    foot = (f'<div class="foot">{html.escape(brand["business_name"])} • '
            f'{html.escape(brand["license_line"])}</div>')
    kick = (f'<div class="kicker" id="{sid}k">{html.escape(sc["kicker"])}</div>'
            if sc.get("kicker") else "")
    a = t0 + 0.05  # animation anchor

    def stagger_words(sel, at, each=0.07):
        tl.append(f'tl.from("#{sid} {sel} .w",{{y:70,opacity:0,duration:.45,ease:"back.out(1.7)",stagger:{each}}},{at:.3f});')

    if style == "photo":
        src = photos[i]
        motion = sc.get("motion", ["zoom_in", "pan_right", "zoom_out", "pan_left"][i % 4])
        frm, to = {"zoom_in": ("scale:1.0", "scale:1.14"),
                   "zoom_out": ("scale:1.16", "scale:1.0"),
                   "pan_left": ("scale:1.14,x:50", "scale:1.14,x:-50"),
                   "pan_right": ("scale:1.14,x:-50", "scale:1.14,x:50"),
                   "pan_up": ("scale:1.14,y:60", "scale:1.14,y:-60")}[motion]
        tl.append(f'tl.fromTo("#{sid}p",{{{frm}}},{{{to},duration:{dur:.3f},ease:"none"}},{t0:.3f});')
        pos = sc.get("text_position", "top")
        top = {"top": 230, "center": 760, "bottom": 880 if captions_on else 1180}[pos]
        card = ""
        if sc.get("text"):
            fs = size_for(sc["text"], 82, 1.1, 58)
            card = (f'<div class="card" id="{sid}c" style="top:{top}px;font-size:{fs}px">'
                    f'{rich(sc["text"])}</div>')
            tl.append(f'tl.from("#{sid}c",{{x:-120,opacity:0,duration:.5,ease:"power3.out"}},{a + .15:.3f});')
            stagger_words(".card", a + .3, 0.05)
        focus = sc.get("focus", "50% 35%")
        return (f'<div {attrs}><img id="{sid}p" class="photo" src="{src}" '
                f'style="object-position:{focus}"><div class="shade"></div>{card}</div>')

    title = sc.get("title", "")
    body = sc.get("body", [])
    body = [body] if isinstance(body, str) else body
    stripes = ('<div class="stripe" style="top:150px"></div>'
               '<div class="stripe" style="top:1700px;opacity:.9"></div>')
    tl.append(f'tl.from("#{sid} .stripe",{{x:-1600,duration:.6,ease:"power3.out",stagger:.1}},{t0:.3f});')
    if kick:
        tl.append(f'tl.from("#{sid}k",{{scale:.4,opacity:0,duration:.4,ease:"back.out(2)"}},{a:.3f});')

    if style in ("hook", "quote"):
        fs = size_for(title, 132, 2.0, 84) if style == "hook" else size_for(title, 96, 1.2, 66)
        q = '<div class="qmark">“</div>' if style == "quote" else ""
        inner = f'{kick}{q}<div class="head box" style="font-size:{fs}px">{rich(title)}</div>'
        stagger_words(".head", a + (.25 if kick else .05), 0.09)
        # slow push-in keeps a static slide alive
        tl.append(f'tl.fromTo("#{sid} .center",{{scale:1}},{{scale:1.05,duration:{dur:.3f},ease:"none"}},{t0:.3f});')
    elif style == "list":
        fs = size_for(title, 100, 1.5, 70)
        items = "".join(f'<div class="item" id="{sid}i{k}"><div class="num">{k + 1}</div>'
                        f'<div>{rich(t)}</div></div>' for k, t in enumerate(body))
        inner = (f'{kick}<div class="head" style="font-size:{fs}px">{rich(title)}</div>'
                 f'<div class="list">{items}</div>')
        stagger_words(".head", a, 0.07)
        gap = min(0.7, max(0.25, (dur - 1.2) / max(len(body), 1)))
        for k in range(len(body)):
            tl.append(f'tl.from("#{sid}i{k}",{{x:-140,opacity:0,duration:.4,ease:"power3.out"}},{a + .5 + k * gap:.3f});')
    elif style == "cta":
        fs = size_for(title or "Need help fast?", 104, 1.5, 76)
        alt = (f'<div class="pill alt" id="{sid}p2">{html.escape(brand["phone_alt"])}</div>'
               if brand.get("phone_alt") else "")
        extra = "".join(f'<div class="small">{rich(b)}</div>' for b in body)
        inner = (f'<img class="logo" id="{sid}l" src="logo.png">'
                 f'<div class="head" style="font-size:{fs}px">{rich(title or "Need help fast?")}</div>'
                 f'<div class="pill" id="{sid}p1">{html.escape(brand["phone"])}</div>{alt}'
                 f'<div class="small">{html.escape(brand["cta_primary"])}</div>{extra}'
                 f'<div class="small" style="font-size:34px;opacity:.85">'
                 f'{html.escape(brand["legal_name"])} • {html.escape(brand["license_line"])}<br>'
                 f'{html.escape(brand["website"])}</div>')
        tl.append(f'tl.from("#{sid}l",{{scale:0,rotation:-25,duration:.6,ease:"back.out(1.8)"}},{a:.3f});')
        stagger_words(".head", a + .3, 0.07)
        tl.append(f'tl.from("#{sid}p1",{{scale:.5,opacity:0,duration:.45,ease:"back.out(2.2)"}},{a + .7:.3f});')
        if alt:
            tl.append(f'tl.from("#{sid}p2",{{scale:.5,opacity:0,duration:.45,ease:"back.out(2.2)"}},{a + .9:.3f});')
        tl.append(f'tl.to("#{sid}p1",{{scale:1.06,duration:.35,yoyo:true,repeat:3,ease:"sine.inOut"}},{a + 1.4:.3f});')
        foot = ""  # license already on the card
    else:  # tip
        fs = size_for(title, 104, 1.6, 70)
        bod = "".join(f'<div class="body" id="{sid}b{k}">{rich(b)}</div>' for k, b in enumerate(body))
        inner = f'{kick}<div class="head box" style="font-size:{fs}px">{rich(title)}</div>{bod}'
        stagger_words(".head", a + (.25 if kick else .05), 0.07)
        for k in range(len(body)):
            tl.append(f'tl.from("#{sid}b{k}",{{y:40,opacity:0,duration:.5,ease:"power2.out"}},{a + .8 + k * .4:.3f});')
    return f'<div {attrs}><div class="bgdark clip"></div>{stripes}<div class="center">{inner}</div>{foot}</div>'


def build(spec_path, out, quality, snap):
    spec_path = spec_path.resolve()
    base = spec_path.parent
    spec = json.loads(spec_path.read_text())
    brand = json.loads((SKILL / "brand.json").read_text())
    sid = spec.get("id", spec_path.stem)
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
                print("WARNING: no transcript (.words.json) for the voice file; run "
                      "transcribe.py. Rendering without captions.", file=sys.stderr)
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

    tl, parts, t = [], [], 0.0
    for i, (s, d) in enumerate(zip(scenes, durs)):
        parts.append(scene_html(i, s, brand, t, d, tl, photos, bool(words)))
        t += d

    caps = []
    if words:
        for k, ch in enumerate(chunks(words)):
            cs = ch[0]["start"]
            ce = min(ch[-1]["end"] + 0.12, total)
            if ce <= cs:
                continue
            spans = []
            for j, w in enumerate(ch):
                txt = html.escape(w["word"].upper())
                spans.append(f'<span class="cw" id="c{k}w{j}">{txt}<span class="on">{txt}</span></span>')
                tl.append(f'tl.set("#c{k}w{j} .on",{{opacity:1}},{w["start"]:.3f});')
                tl.append(f'tl.fromTo("#c{k}w{j}",{{scale:1}},{{scale:1.12,duration:.08,yoyo:true,repeat:1}},{w["start"]:.3f});')
                if j + 1 < len(ch):
                    tl.append(f'tl.set("#c{k}w{j} .on",{{opacity:0}},{ch[j + 1]["start"]:.3f});')
            tl.append(f'tl.from("#c{k}",{{y:30,opacity:0,duration:.12}},{cs:.3f});')
            caps.append(f'<div id="c{k}" class="cap clip" data-start="{cs:.3f}" '
                        f'data-duration="{ce - cs:.3f}" data-track-index="2">{"".join(spans)}</div>')

    audio = []
    if voice:
        audio.append(f'<audio id="vo" src="voice.wav" data-start="0" data-duration="{vlen:.3f}" '
                     f'data-volume="1" data-track-index="3"></audio>')
    music = spec.get("music")
    if music:
        shutil.copy(base / music["src"], proj / ("music" + Path(music["src"]).suffix))
        mv = float(music.get("volume", 0.10 if voice else 0.8))
        audio.append(f'<audio id="mu" src="music{Path(music["src"]).suffix}" data-start="0" '
                     f'data-duration="{total:.3f}" data-volume="{mv}" data-fade-in="0.5" '
                     f'data-fade-out="1.5" data-track-index="4"></audio>')

    css = CSS % dict(brand["colors"], pad_bottom=380 if words else 200)
    doc = f"""<!doctype html>
<html lang="en" data-resolution="portrait">
<head><meta charset="UTF-8"><meta name="viewport" content="width=1080, height=1920">
<script src="gsap.min.js"></script><style>{css}</style></head>
<body>
<div id="root" data-composition-id="main" data-start="0" data-duration="{total:.3f}" data-width="1080" data-height="1920">
{chr(10).join(parts)}
{chr(10).join(caps)}
{chr(10).join(audio)}
</div>
<script>
window.__timelines = window.__timelines || {{}};
const tl = gsap.timeline({{ paused: true }});
{chr(10).join(tl)}
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
    has_audio = bool(voice or music)
    cmd = ["ffmpeg", "-y", "-v", "error", "-i", str(raw), "-c:v", "copy"]
    if has_audio:
        cmd += ["-af", "loudnorm=I=-14:TP=-1.5:LRA=11", "-c:a", "aac", "-b:a", "192k",
                "-ar", "48000"]
    cmd += ["-movflags", "+faststart", str(out)]
    run(cmd)
    if snap:
        times = [0.6] + [sum(durs[:i]) + durs[i] * 0.7 for i in range(len(durs))]
        frames = []
        for k, ts in enumerate(times):
            f = proj / f"snap{k}.jpg"
            run(["ffmpeg", "-y", "-v", "error", "-ss", f"{min(ts, total - 0.05):.2f}", "-i",
                 str(out), "-frames:v", "1", "-vf", "scale=360:-1", str(f)])
            frames.append(f)
        args = sum([["-i", str(f)] for f in frames], [])
        run(["ffmpeg", "-y", "-v", "error", *args, "-filter_complex",
             f"hstack={len(frames)}", str(out.with_name(out.stem + "_preview.jpg"))])
    print(f"OK {out} ({total:.1f}s, {len(scenes)} scenes, captions={'yes' if words else 'no'}, "
          f"music={'yes' if music else 'no'})")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("spec")
    ap.add_argument("--out")
    ap.add_argument("--quality", default="looks", choices=["draft", "looks", "delivery"])
    ap.add_argument("--snap", action="store_true", help="save a preview contact sheet")
    a = ap.parse_args()
    build(Path(a.spec), a.out, a.quality, a.snap)
