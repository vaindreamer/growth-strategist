#!/usr/bin/env python3
"""Synthesize the sound-effect library into ../sfx/*.wav (48 kHz mono).

All sounds are generated from scratch (no samples), so there are no licensing
issues. To use better sounds, drop a WAV with the same name into ../sfx/ and
it will be used instead (re-running this script overwrites only with --force).

    python3 make_sfx.py [--force]
"""
import sys
import wave
from pathlib import Path

import numpy as np

SR = 48000
OUT = Path(__file__).resolve().parent.parent / "sfx"
rng = np.random.default_rng(7)


def t(d):
    return np.arange(int(SR * d)) / SR


def env(n, attack=0.002, decay=0.1):
    x = np.arange(n) / SR
    a = np.clip(x / max(attack, 1e-4), 0, 1)
    return a * np.exp(-np.maximum(x - attack, 0) / decay)


def lowpass(x, cutoff):
    """One-pole low-pass; cutoff may be an array (sweeping filter)."""
    cutoff = np.broadcast_to(np.asarray(cutoff, dtype=float), x.shape)
    a = np.exp(-2 * np.pi * cutoff / SR)
    y = np.empty_like(x)
    acc = 0.0
    for i in range(len(x)):
        acc = (1 - a[i]) * x[i] + a[i] * acc
        y[i] = acc
    return y


def highpass(x, cutoff):
    return x - lowpass(x, cutoff)


def noise(d):
    return rng.standard_normal(int(SR * d))


def pad(x, d):
    out = np.zeros(int(SR * d))
    out[:len(x)] += x[:len(out)]
    return out


def norm(x, peak=0.9):
    m = np.max(np.abs(x)) or 1
    return x / m * peak


# ------------------------------------------------------------------ sounds
def click():  # mouse click: press + release
    def tick(f, d=0.012):
        n = noise(d) * env(int(SR * d), 0.0003, 0.0025)
        return highpass(n, 1800) + 0.4 * np.sin(2 * np.pi * f * t(d)) * env(int(SR * d), 0.0002, 0.003)
    x = pad(tick(3200), 0.12)
    x[int(0.055 * SR):int(0.055 * SR) + int(0.012 * SR)] += 0.6 * tick(2600)
    return norm(x, 0.8)


def key():  # keyboard key
    d = 0.05
    n = highpass(noise(d), 1200) * env(int(SR * d), 0.0005, 0.006)
    body = 0.5 * np.sin(2 * np.pi * 420 * t(d)) * env(int(SR * d), 0.0005, 0.012)
    return norm(n + body, 0.6)


def typing():  # ~1.2 s of irregular key presses
    x = np.zeros(int(SR * 1.3))
    pos = 0.0
    k = key()
    while pos < 1.2:
        i = int(pos * SR)
        g = 0.6 + 0.4 * rng.random()
        x[i:i + len(k)] += g * k[:len(x) - i]
        pos += 0.06 + 0.07 * rng.random()
    return norm(x, 0.6)


def pop():  # bubble / message pop
    d = 0.09
    f = np.linspace(380, 980, int(SR * d))
    s = np.sin(2 * np.pi * np.cumsum(f) / SR) * env(int(SR * d), 0.002, 0.03)
    return norm(s, 0.8)


def whoosh(d=0.45, lo=300, hi=4500):
    n = noise(d)
    x = np.linspace(0, 1, len(n))
    cut = lo + (hi - lo) * np.sin(np.pi * x) ** 2
    s = lowpass(n, cut) * np.sin(np.pi * x) ** 1.5
    return norm(highpass(s, 120), 0.75)


def swipe():
    return whoosh(0.22, 800, 7000)


def ding():  # notification
    d = 0.9
    s = (np.sin(2 * np.pi * 1318.5 * t(d)) + 0.5 * np.sin(2 * np.pi * 2637 * t(d))) * env(int(SR * d), 0.002, 0.25)
    s2 = (np.sin(2 * np.pi * 1760 * t(d)) + 0.4 * np.sin(2 * np.pi * 3520 * t(d))) * env(int(SR * d), 0.002, 0.3)
    x = pad(s, 1.1)
    x[int(0.12 * SR):int(0.12 * SR) + len(s2)] += s2[:len(x) - int(0.12 * SR)]
    return norm(x, 0.6)


def ring():  # phone ring: two warbling bursts
    d = 0.9
    tone = np.sin(2 * np.pi * 1200 * t(d)) * (0.5 + 0.5 * np.sign(np.sin(2 * np.pi * 20 * t(d))))
    tone += 0.6 * np.sin(2 * np.pi * 1500 * t(d)) * (0.5 - 0.5 * np.sign(np.sin(2 * np.pi * 20 * t(d))))
    tone = lowpass(tone, 5000) * np.minimum(1, np.minimum(t(d) / 0.01, (d - t(d)) / 0.03))
    x = np.zeros(int(SR * 2.4))
    for start in (0.0, 1.2):
        i = int(start * SR)
        x[i:i + len(tone)] += tone
    return norm(x, 0.5)


def boom():  # impact / bass hit
    d = 1.0
    f = 110 * np.exp(-t(d) * 6) + 42
    s = np.sin(2 * np.pi * np.cumsum(f) / SR) * env(int(SR * d), 0.001, 0.35)
    thump = lowpass(noise(0.08), 900) * env(int(SR * 0.08), 0.0005, 0.02)
    s[:len(thump)] += 0.8 * thump
    return norm(s, 0.9)


def riser(d=1.2):
    x = np.linspace(0, 1, int(SR * d))
    f = 200 + 1400 * x ** 2
    tone = 0.35 * np.sin(2 * np.pi * np.cumsum(f) / SR)
    n = lowpass(noise(d), 600 + 8000 * x ** 2)
    s = (tone + n) * x ** 2
    s[-int(0.03 * SR):] *= np.linspace(1, 0, int(0.03 * SR))
    return norm(s, 0.6)


def tick():  # checkmark tick
    d = 0.12
    s = np.sin(2 * np.pi * 2093 * t(d)) * env(int(SR * d), 0.001, 0.03)
    s += 0.5 * np.sin(2 * np.pi * 3136 * t(d)) * env(int(SR * d), 0.001, 0.02)
    return norm(s, 0.6)


def glitch():
    d = 0.25
    s = np.sign(np.sin(2 * np.pi * 90 * t(d))) * 0.4 + noise(d) * 0.5
    gate = (np.floor(t(d) * 40) % 3 != 1).astype(float)
    return norm(highpass(s * gate, 300) * env(int(SR * d), 0.001, 0.12), 0.5)


def shutter():
    x = np.zeros(int(SR * 0.25))
    for st, g in ((0.0, 1.0), (0.07, 0.7)):
        n = highpass(noise(0.04), 1500) * env(int(SR * 0.04), 0.0005, 0.008) * g
        i = int(st * SR)
        x[i:i + len(n)] += n
    return norm(x, 0.7)


def cash():  # register "cha-ching"-like bell (short)
    d = 0.8
    s = sum(np.sin(2 * np.pi * f * t(d)) * env(int(SR * d), 0.001, dec)
            for f, dec in ((2637, 0.25), (3951, 0.18), (5274, 0.1)))
    return norm(s, 0.5)


SOUNDS = {"click": click, "key": key, "typing": typing, "pop": pop, "whoosh": whoosh,
          "swipe": swipe, "ding": ding, "ring": ring, "boom": boom, "riser": riser,
          "tick": tick, "glitch": glitch, "shutter": shutter, "cash": cash}


def write(path, x):
    pcm = (np.clip(x, -1, 1) * 32767).astype("<i2")
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())


if __name__ == "__main__":
    force = "--force" in sys.argv
    OUT.mkdir(exist_ok=True)
    for name, fn in SOUNDS.items():
        p = OUT / f"{name}.wav"
        if p.exists() and not force:
            continue
        write(p, fn())
        print("wrote", p.name)
