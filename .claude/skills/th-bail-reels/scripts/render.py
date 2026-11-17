#!/usr/bin/env python3
"""Render a faceless 9:16 short video (Reel / TikTok) from a JSON spec.

Usage:
    python3 render.py SPEC.json [--out OUT.mp4] [--preview]

Spec format: see ../SKILL.md ("Video spec"). Paths in the spec are resolved
relative to the spec file. Brand settings come from ../brand.json.
"""
import argparse
import json
import math
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageOps

SKILL_DIR = Path(__file__).resolve().parent.parent
W, H, FPS = 1080, 1920, 30
# Platform UI covers roughly the bottom 20% and the right edge; keep text inside.
SAFE_X = 90
SAFE_TOP = 220
SAFE_BOTTOM = 1500
CAPTION_BOTTOM = 1450  # voice captions sit just above the platform UI
CAPTION_TOP = 1270    # keep slide content above this when captions are on


# ---------------------------------------------------------------- helpers
def run(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        sys.exit(f"command failed: {' '.join(map(str, cmd))}\n{r.stderr[-2000:]}")
    return r.stdout


def probe_duration(path):
    out = run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
               "-of", "default=nw=1:nk=1", str(path)])
    return float(out.strip())


def hex_rgb(h, alpha=255):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4)) + (alpha,)


def ass_color(h):
    r, g, b = (int(h.lstrip("#")[i:i + 2], 16) for i in (0, 2, 4))
    return f"&H00{b:02X}{g:02X}{r:02X}"


def load_brand():
    brand = json.loads((SKILL_DIR / "brand.json").read_text())
    for k, v in brand["fonts"].items():
        if k.endswith("family"):
            continue
        p = SKILL_DIR / v
        brand["fonts"][k] = str(p if p.exists() else
                                "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf")
    return brand


def tokens(text):
    """Split text into (word, highlighted) pairs; *phrase* marks accent words."""
    out, hl = [], False
    for raw in str(text).replace("\n", " \n ").split(" "):
        if raw == "":
            continue
        if raw == "\n":
            out.append(("\n", False))
            continue
        start = raw.startswith("*")
        end = raw.endswith("*") and len(raw.strip("*")) > 0
        word = raw.strip("*")
        if start:
            hl = True
        out.append((word, hl))
        if end or (raw.endswith("*") and start and raw != "*"):
            hl = False
    return out


def wrap(draw, text, font, max_w):
    """Return lines, each a list of (word, highlighted)."""
    lines, cur = [], []
    space = draw.textlength(" ", font=font)

    def width(ws):
        return sum(draw.textlength(w, font=font) for w, _ in ws) + space * max(len(ws) - 1, 0)

    for w, hl in tokens(text):
        if w == "\n":
            lines.append(cur)
            cur = []
            continue
        if cur and width(cur + [(w, hl)]) > max_w:
            lines.append(cur)
            cur = []
        cur.append((w, hl))
    lines.append(cur)
    return lines


def line_text(line):
    return " ".join(w for w, _ in line)


def fit_font(draw, text, path, max_w, max_h, start, minimum=40, spacing=1.15):
    size = start
    while size > minimum:
        f = ImageFont.truetype(path, size)
        lines = wrap(draw, text, f, max_w)
        if len(lines) * size * spacing <= max_h:
            return f, lines
        size -= 4
    f = ImageFont.truetype(path, minimum)
    return f, wrap(draw, text, f, max_w)


def draw_lines(draw, lines, font, x_center, y, fill, spacing=1.15, hl_color=None,
               align="center", x_left=0):
    space = draw.textlength(" ", font=font)
    for line in lines:
        lw = draw.textlength(line_text(line), font=font)
        x = x_center - lw / 2 if align == "center" else x_left
        for w, hl in line:
            draw.text((x, y), w, font=font, fill=hl_color if (hl and hl_color) else fill)
            x += draw.textlength(w, font=font) + space
        y += font.size * spacing
    return y


# ---------------------------------------------------------------- graphics
def text_overlay_png(text, brand, path, position="top"):
    """Transparent 1080x1920 PNG with a boxed headline (for photo scenes)."""
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    font, lines = fit_font(d, text, brand["fonts"]["headline"], W - 2 * SAFE_X - 60,
                           420, 84)
    lh = font.size * 1.15
    box_h = len(lines) * lh + 70
    y0 = SAFE_TOP if position == "top" else (SAFE_BOTTOM - box_h if position == "bottom"
                                             else (H - box_h) / 2)
    d.rounded_rectangle([SAFE_X, y0, W - SAFE_X, y0 + box_h], radius=28,
                        fill=hex_rgb(brand["colors"]["primary"], 225))
    draw_lines(d, lines, font, W / 2, y0 + 30, hex_rgb(brand["colors"]["text"]),
               hl_color=hex_rgb(brand["colors"]["accent"]))
    img.save(path)


def slide_png(scene, brand, path):
    """Branded full-frame graphic slide: hook | tip | list | quote | cta."""
    c = brand["colors"]
    style = scene.get("style", "tip")
    bg = hex_rgb(c["primary"])
    img = Image.new("RGBA", (W, H), bg)
    d = ImageDraw.Draw(img)
    # subtle accent bars for brand feel
    d.rectangle([0, 0, W, 18], fill=hex_rgb(c["accent"]))
    d.rectangle([0, H - 18, W, H], fill=hex_rgb(c["accent"]))
    hf, bf = brand["fonts"]["headline"], brand["fonts"]["body"]
    max_w = W - 2 * SAFE_X
    white, accent = hex_rgb(c["text"]), hex_rgb(c["accent"])

    if scene.get("kicker"):
        kf = ImageFont.truetype(bf, 44)
        kt = scene["kicker"].upper()
        kw = d.textlength(kt, font=kf)
        d.rounded_rectangle([(W - kw) / 2 - 30, SAFE_TOP + 40, (W + kw) / 2 + 30,
                             SAFE_TOP + 120], radius=40, fill=accent)
        d.text(((W - kw) / 2, SAFE_TOP + 55), kt, font=kf, fill=hex_rgb(c["primary"]))

    title = scene.get("title", "")
    body = scene.get("body", [])
    if isinstance(body, str):
        body = [body]

    if style in ("hook", "quote"):
        tf, tl = fit_font(d, title, hf, max_w, 900, 120 if style == "hook" else 90)
        th = len(tl) * tf.size * 1.15
        y = (H - th) / 2 - 80
        if style == "quote":
            qf = ImageFont.truetype(hf, 220)
            d.text((SAFE_X, y - 230), "“", font=qf, fill=accent)
        draw_lines(d, tl, tf, W / 2, y, white, hl_color=accent)
    elif style == "list":
        tf, tl = fit_font(d, title, hf, max_w, 380, 92)
        y = draw_lines(d, tl, tf, W / 2, SAFE_TOP + 170, white, hl_color=accent) + 50
        bfont = ImageFont.truetype(bf, 58 if len(body) <= 4 else 48)
        for i, item in enumerate(body, 1):
            badge = 74
            d.ellipse([SAFE_X, y, SAFE_X + badge, y + badge], fill=accent)
            n = str(i)
            nf = ImageFont.truetype(hf, 44)
            d.text((SAFE_X + badge / 2 - d.textlength(n, font=nf) / 2, y + 10), n,
                   font=nf, fill=hex_rgb(c["primary"]))
            il = wrap(d, item, bfont, max_w - badge - 30)
            draw_lines(d, il, bfont, 0, y + 6, white, spacing=1.2, hl_color=accent,
                       align="left", x_left=SAFE_X + badge + 30)
            y += max(badge, len(il) * bfont.size * 1.2) + 40
            if y > SAFE_BOTTOM:
                break
    elif style == "cta":
        tf, tl = fit_font(d, title or "Need help fast?", hf, max_w, 500, 110)
        y = draw_lines(d, tl, tf, W / 2, 400, white, hl_color=accent) + 50
        pf = ImageFont.truetype(hf, 84)
        phone = brand["phone"]
        pw = d.textlength(phone, font=pf)
        d.rounded_rectangle([(W - pw) / 2 - 50, y, (W + pw) / 2 + 50, y + 140],
                            radius=70, fill=accent)
        d.text(((W - pw) / 2, y + 22), phone, font=pf, fill=hex_rgb(c["primary"]))
        y += 210
        sf = ImageFont.truetype(bf, 54)
        for ln in [brand["cta_primary"]] + body:
            y = draw_lines(d, wrap(d, ln, sf, max_w), sf, W / 2, y, white, spacing=1.3,
                           hl_color=accent)
        y += 40
        nf = ImageFont.truetype(hf, 60)
        nm = brand["business_name"]
        d.text(((W - d.textlength(nm, font=nf)) / 2, y), nm, font=nf, fill=accent)
    else:  # tip
        tf, tl = fit_font(d, title, hf, max_w, 520, 100)
        y = draw_lines(d, tl, tf, W / 2, SAFE_TOP + 200, white, hl_color=accent) + 60
        bfont = ImageFont.truetype(bf, 60)
        for item in body:
            y = draw_lines(d, wrap(d, item, bfont, max_w), bfont, W / 2, y, white,
                           hl_color=accent) + 30

    # compliance footer on every slide
    ff = ImageFont.truetype(bf, 34)
    foot = f"{brand['business_name']}  •  {brand['license_line']}"
    d.text(((W - d.textlength(foot, font=ff)) / 2, SAFE_BOTTOM + 40), foot, font=ff,
           fill=hex_rgb(c["text"], 170))
    if brand.get("logo"):
        lp = SKILL_DIR / brand["logo"]
        if lp.exists():
            logo = Image.open(lp).convert("RGBA")
            logo.thumbnail((260, 160))
            img.alpha_composite(logo, ((W - logo.width) // 2, 60))
    img.convert("RGB").save(path)


def prep_photo(src, path):
    """Cover-crop to 9:16 at 2x size so the Ken Burns move stays sharp."""
    im = ImageOps.exif_transpose(Image.open(src)).convert("RGB")
    im = ImageOps.fit(im, (W * 2, H * 2), method=Image.LANCZOS, centering=(0.5, 0.4))
    im.save(path, quality=95)


# ---------------------------------------------------------------- scenes
def motion_expr(motion, frames):
    z_end = 1.18
    p = f"(on/{max(frames - 1, 1)})"
    if motion == "zoom_out":
        return f"{z_end}-({z_end}-1)*{p}", "iw/2-(iw/zoom/2)", "ih/2-(ih/zoom/2)"
    if motion == "pan_left":
        return "1.15", f"(iw-iw/zoom)*(1-{p})", "ih/2-(ih/zoom/2)"
    if motion == "pan_right":
        return "1.15", f"(iw-iw/zoom)*{p}", "ih/2-(ih/zoom/2)"
    if motion == "pan_up":
        return "1.15", "iw/2-(iw/zoom/2)", f"(ih-ih/zoom)*(1-{p})"
    return f"1+({z_end}-1)*{p}", "iw/2-(iw/zoom/2)", "ih/2-(ih/zoom/2)"  # zoom_in


def render_scene(i, scene, brand, base, tmp, dur):
    frames = max(int(round(dur * FPS)), 2)
    out = tmp / f"scene_{i:02d}.mp4"
    stype = scene.get("type", "slide")
    if stype == "photo":
        src = tmp / f"photo_{i:02d}.jpg"
        prep_photo(base / scene["src"], src)
        motions = ["zoom_in", "pan_right", "zoom_out", "pan_left"]
        z, x, y = motion_expr(scene.get("motion", motions[i % 4]), frames)
        vf = (f"zoompan=z='{z}':x='{x}':y='{y}':d={frames}:s={W}x{H}:fps={FPS}")
        if scene.get("darken", True):
            vf += ",eq=brightness=-0.06:saturation=1.05"
        inputs = ["-loop", "1", "-i", str(src)]
        if scene.get("text"):
            ov = tmp / f"ov_{i:02d}.png"
            text_overlay_png(scene["text"], brand, ov, scene.get("text_position", "top"))
            inputs += ["-loop", "1", "-i", str(ov)]
            fc = f"[0:v]{vf}[bg];[bg][1:v]overlay=0:0:shortest=1,format=yuv420p[v]"
        else:
            fc = f"[0:v]{vf},format=yuv420p[v]"
    else:
        png = tmp / f"slide_{i:02d}.png"
        slide_png(scene, brand, png)
        # gentle 4% push-in keeps graphic slides from feeling static
        inputs = ["-loop", "1", "-i", str(png)]
        fc = (f"[0:v]scale={W*2}:{H*2},zoompan=z='1+0.04*on/{frames}':"
              f"x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d={frames}:s={W}x{H}:fps={FPS},"
              f"format=yuv420p[v]")
    fade = min(0.25, dur / 4)
    fc = fc.replace("[v]", f",fade=t=in:st=0:d={fade}[v]") if i > 0 else fc
    run(["ffmpeg", "-y", "-v", "error", *inputs, "-filter_complex", fc, "-map", "[v]",
         "-frames:v", str(frames), "-r", str(FPS), "-c:v", "libx264", "-preset",
         "veryfast", "-crf", "18", "-pix_fmt", "yuv420p", str(out)])
    return out


# ---------------------------------------------------------------- captions
def caption_chunks(words, max_words=3):
    """Group timed words into short on-screen chunks, breaking at punctuation."""
    chunks, cur = [], []
    for w in words:
        cur.append(w)
        if len(cur) >= max_words or re.search(r"[.,!?;:]$", w["word"]):
            chunks.append(cur)
            cur = []
    if cur:
        chunks.append(cur)
    return chunks


def write_ass(words, brand, path, offset=0.0):
    c = brand["colors"]
    font = brand["fonts"].get("caption_family", "Montserrat ExtraBold")
    head = f"""[Script Info]
ScriptType: v4.00+
PlayResX: {W}
PlayResY: {H}
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Cap,{font},96,{ass_color(c['text'])},{ass_color(c['caption_highlight'])},&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,7,2,2,{SAFE_X},{SAFE_X + 40},{H - CAPTION_BOTTOM},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""

    def ts(t):
        t = max(t, 0)
        return f"{int(t // 3600)}:{int(t % 3600 // 60):02d}:{t % 60:05.2f}"

    lines = []
    hl = ass_color(c["caption_highlight"])
    for chunk in caption_chunks(words):
        start, end = chunk[0]["start"] - offset, chunk[-1]["end"] - offset
        if end <= 0:
            continue
        # one event per word so the word being spoken is highlighted
        for k, w in enumerate(chunk):
            ws = w["start"] - offset
            we = chunk[k + 1]["start"] - offset if k + 1 < len(chunk) else end
            parts = []
            for m, x in enumerate(chunk):
                t = x["word"].upper().replace("{", "").replace("}", "")
                parts.append(f"{{\\c{hl}}}{t}{{\\r}}" if m == k else t)
            lines.append(f"Dialogue: 0,{ts(ws)},{ts(we)},Cap,,0,0,0,,{' '.join(parts)}")
    Path(path).write_text(head + "\n".join(lines) + "\n")


def load_words(voice, base, voice_start, voice_end):
    """Word timings from a transcript JSON produced by transcribe.py."""
    tpath = voice.get("transcript")
    if not tpath:
        cand = (base / voice["src"]).with_suffix(".words.json")
        tpath = cand if cand.exists() else None
    if not tpath:
        return None
    data = json.loads((base / tpath).read_text())
    return [w for w in data["words"]
            if w["end"] > voice_start and w["start"] < voice_end]


# ---------------------------------------------------------------- main
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("spec")
    ap.add_argument("--out")
    ap.add_argument("--preview", action="store_true",
                    help="also save 3 still frames next to the video for QC")
    args = ap.parse_args()

    spec_path = Path(args.spec).resolve()
    base = spec_path.parent
    spec = json.loads(spec_path.read_text())
    brand = load_brand()
    out = Path(args.out or base / f"{spec.get('id', spec_path.stem)}.mp4").resolve()
    scenes = spec["scenes"]

    voice = spec.get("voice")
    v_start = v_end = 0.0
    if voice:
        v_start = float(voice.get("start", 0))
        v_end = float(voice.get("end") or probe_duration(base / voice["src"]))
        total = v_end - v_start + float(voice.get("tail", 0.6))
    else:
        total = sum(float(s.get("duration", 3)) for s in scenes)

    # Distribute duration: fixed durations honoured, the rest split evenly.
    fixed = sum(float(s["duration"]) for s in scenes if "duration" in s)
    flex = [s for s in scenes if "duration" not in s]
    each = max((total - fixed) / len(flex), 1.2) if flex else 0
    durs = [float(s.get("duration", each)) for s in scenes]
    if voice:  # stretch/shrink last scene so picture == audio length
        durs[-1] = max(total - sum(durs[:-1]), 1.0)

    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td)
        clips = [render_scene(i, s, brand, base, tmp, d)
                 for i, (s, d) in enumerate(zip(scenes, durs))]
        lst = tmp / "list.txt"
        lst.write_text("".join(f"file '{c}'\n" for c in clips))
        silent = tmp / "silent.mp4"
        run(["ffmpeg", "-y", "-v", "error", "-f", "concat", "-safe", "0", "-i", str(lst),
             "-c", "copy", str(silent)])
        vlen = sum(durs)

        # ---- captions
        vf = []
        cap_mode = spec.get("captions", "auto" if voice else "none")
        words = None
        if voice and cap_mode == "auto":
            words = load_words(voice, base, v_start, v_end)
            if words is None:
                print("WARNING: no transcript found for voice; run transcribe.py first. "
                      "Rendering without captions.", file=sys.stderr)
        if words:
            ass = tmp / "caps.ass"
            write_ass(words, brand, ass, offset=v_start)
            fontsdir = SKILL_DIR / "fonts"
            vf.append(f"subtitles={ass}:fontsdir={fontsdir}")

        # ---- audio mix
        cmd = ["ffmpeg", "-y", "-v", "error", "-i", str(silent)]
        amix, maps = [], ["-map", "0:v"]
        idx = 1
        if voice:
            cmd += ["-ss", str(v_start), "-to", str(v_end), "-i", str(base / voice["src"])]
            amix.append(f"[{idx}:a]aresample=48000,highpass=f=80,"
                        f"acompressor=threshold=-18dB:ratio=3:attack=5:release=120,"
                        f"loudnorm=I=-14:TP=-1.5:LRA=11,apad[vo]")
            idx += 1
        music = spec.get("music")
        if music:
            vol = float(music.get("volume", 0.12 if voice else 0.8))
            cmd += ["-stream_loop", "-1", "-i", str(base / music["src"])]
            amix.append(f"[{idx}:a]aresample=48000,volume={vol},"
                        f"afade=t=out:st={max(vlen - 1.5, 0)}:d=1.5[mu]")
            idx += 1
        if voice and music:
            amix.append("[vo][mu]amix=inputs=2:duration=first:normalize=0[a]")
        elif voice:
            amix.append("[vo]anull[a]")
        elif music:
            amix.append("[mu]anull[a]")
        if amix:
            maps += ["-map", "[a]"]
        fc = ";".join(amix + ([f"[0:v]{','.join(vf)}[vout]"] if vf else []))
        if vf:
            maps[1] = "[vout]"
        if fc:
            cmd += ["-filter_complex", fc]
        cmd += maps + ["-t", f"{vlen:.3f}", "-c:v", "libx264", "-preset", "medium",
                       "-crf", "19", "-pix_fmt", "yuv420p", "-r", str(FPS),
                       "-movflags", "+faststart"]
        if amix:
            cmd += ["-c:a", "aac", "-b:a", "192k", "-ar", "48000"]
        cmd += [str(out)]
        out.parent.mkdir(parents=True, exist_ok=True)
        run(cmd)

    if args.preview:
        for k, frac in enumerate((0.1, 0.5, 0.9)):
            run(["ffmpeg", "-y", "-v", "error", "-ss", f"{vlen * frac:.2f}", "-i", str(out),
                 "-frames:v", "1", "-vf", "scale=540:-1",
                 str(out.with_name(f"{out.stem}_preview{k + 1}.jpg"))])
    print(f"OK {out} ({vlen:.1f}s, {len(scenes)} scenes, "
          f"captions={'yes' if words else 'no'}, music={'yes' if music else 'no'})")


if __name__ == "__main__":
    main()
