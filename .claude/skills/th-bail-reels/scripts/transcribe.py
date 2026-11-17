#!/usr/bin/env python3
"""Make word-level timings for a voice recording -> <audio>.words.json

    python3 transcribe.py VOICE.m4a                 # speech-to-text (HyperFrames whisper,
                                                    #   falls back to faster-whisper)
    python3 transcribe.py VOICE.m4a --text "..."    # you supply the words; timing is
    python3 transcribe.py VOICE.m4a --text-file t.txt  # estimated from pauses

Mode 1 runs `npx hyperframes transcribe` (whisper.cpp, model small.en). It needs
network access to huggingface.co, us.aws.cdn.hf.co and github.com the first time. If that is unavailable, it falls back to mode 2 when
text is supplied, otherwise it exits with instructions.

Output JSON: {"text": "...", "duration": 12.3,
              "words": [{"word": "Bail", "start": 0.42, "end": 0.71}, ...]}
"""
import argparse
import json
import re
import subprocess
import sys
from pathlib import Path


def duration(path):
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                          "-of", "default=nw=1:nk=1", str(path)],
                         capture_output=True, text=True, check=True).stdout
    return float(out)


def speech_segments(path, total, noise="-35dB", min_sil=0.35):
    """Return [(start, end)] of non-silent regions using ffmpeg silencedetect."""
    err = subprocess.run(["ffmpeg", "-i", str(path), "-af",
                          f"silencedetect=noise={noise}:d={min_sil}", "-f", "null", "-"],
                         capture_output=True, text=True).stderr
    starts = [float(x) for x in re.findall(r"silence_start: ([\d.]+)", err)]
    ends = [float(x) for x in re.findall(r"silence_end: ([\d.]+)", err)]
    segs, cur = [], 0.0
    for s, e in zip(starts, ends + [total] * (len(starts) - len(ends))):
        if s - cur > 0.15:
            segs.append((cur, s))
        cur = e
    if total - cur > 0.15:
        segs.append((cur, total))
    return segs or [(0.0, total)]


def align_text(text, segs):
    """Spread words over speech regions in proportion to their length."""
    words = text.split()
    speech = sum(e - s for s, e in segs)
    weights = [len(re.sub(r"\W", "", w)) + 2 for w in words]
    per = speech / sum(weights)
    out, si, pos = [], 0, segs[0][0]
    for w, wt in zip(words, weights):
        d = wt * per
        while si < len(segs) - 1 and pos + d * 0.5 > segs[si][1]:
            si += 1
            pos = max(pos, segs[si][0])
        out.append({"word": w, "start": round(pos, 3), "end": round(pos + d, 3)})
        pos += d
    return out


def hyperframes(path, model):
    import os
    import shutil
    import tempfile
    with tempfile.TemporaryDirectory() as td:
        tmp_audio = Path(td) / Path(path).name
        shutil.copy(path, tmp_audio)
        env = dict(os.environ, NODE_USE_ENV_PROXY="1", HYPERFRAMES_SKIP_SKILLS="1",
                   NODE_EXTRA_CA_CERTS=os.environ.get("NODE_EXTRA_CA_CERTS",
                                                      "/root/.ccr/ca-bundle.crt"))
        r = subprocess.run(["npx", "--yes", "hyperframes@0.9.59", "transcribe", str(tmp_audio),
                            "--model", model, "--json"], capture_output=True, text=True,
                           env=env, cwd=td)
        last = json.loads(r.stdout.strip().splitlines()[-1]) if r.stdout.strip() else {}
        if r.returncode != 0 or not last.get("ok"):
            raise RuntimeError(last.get("error") or r.stderr[-500:])
        ws = json.loads(Path(last["transcriptPath"]).read_text())
    return [{"word": w["text"].strip(), "start": w["start"], "end": w["end"]} for w in ws]


def whisper(path, model_size):
    from faster_whisper import WhisperModel  # noqa: import inside for optional dep
    model = WhisperModel(model_size, device="cpu", compute_type="int8")
    segments, _ = model.transcribe(str(path), word_timestamps=True, vad_filter=True)
    words = []
    for seg in segments:
        for w in seg.words or []:
            words.append({"word": w.word.strip(), "start": round(w.start, 3),
                          "end": round(w.end, 3)})
    return words


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("audio")
    ap.add_argument("--text")
    ap.add_argument("--text-file")
    ap.add_argument("--model", default="small.en")
    ap.add_argument("--out")
    a = ap.parse_args()
    audio = Path(a.audio)
    total = duration(audio)
    text = a.text or (Path(a.text_file).read_text() if a.text_file else None)

    words, method = None, None
    if not text:
        try:
            words, method = hyperframes(audio, a.model), f"hyperframes-whisper {a.model}"
        except Exception as e:
            print(f"hyperframes transcribe failed ({e}); trying faster-whisper", file=sys.stderr)
            try:
                words, method = whisper(audio, a.model.replace(".en", "")), "faster-whisper"
            except Exception as e2:
                e = e2
        if words is None:
            sys.exit(f"Speech-to-text unavailable ({type(e).__name__}: {e}).\n"
                     "Re-run with --text \"what she says\" (or --text-file) to time the "
                     "captions from pauses instead.")
    else:
        words, method = align_text(" ".join(text.split()), speech_segments(audio, total)), \
            "estimated-from-pauses"

    out = Path(a.out) if a.out else audio.with_suffix(".words.json")
    out.write_text(json.dumps({"text": " ".join(w["word"] for w in words),
                               "duration": round(total, 3), "method": method,
                               "words": words}, indent=1))
    print(f"OK {out} ({len(words)} words, {total:.1f}s, {method})")


if __name__ == "__main__":
    main()
