#!/usr/bin/env python3
"""Convert a normal song into a Native-Instruments .stem.mp4 that Mixxx can load.

Pipeline:  Demucs (4-source separation) -> ffmpeg mux (5 audio streams:
master + drums/bass/other/vocals) -> inject the `moov.udta.stem` JSON manifest.

Usage:  python song2stem.py <input-audio> [output.stem.mp4]
"""
import glob
import json
import os
import struct
import subprocess
import sys
import tempfile


def find_ffmpeg():
    """Locate ffmpeg.exe portably: env var, then bundled next to this script,
    then the dev machine's fixed path."""
    env = os.environ.get("MIXXX_FFMPEG")
    if env and os.path.exists(env):
        return env
    here = os.path.dirname(os.path.abspath(__file__))
    hits = glob.glob(os.path.join(here, "ffmpeg", "**", "ffmpeg.exe"),
            recursive=True)
    if hits:
        return hits[0]
    return r"C:\mixxx-build\ffmpeg\ffmpeg-8.1.1-essentials_build\bin\ffmpeg.exe"


FFMPEG = find_ffmpeg()
MODEL = "htdemucs"  # 4 stems: drums, bass, other, vocals
SR = 44100
BITRATE = "256k"

# Mixxx default stem colors (steminfoimporter.cpp) + NI stem order.
STEMS = [
    ("Drums", "#009E73"),
    ("Bass", "#D55E00"),
    ("Other", "#CC79A7"),
    ("Vocals", "#56B4E9"),
]


def run(cmd):
    print("  $", " ".join(str(c) for c in cmd))
    subprocess.run(cmd, check=True)


def separate(inp, workdir):
    """Run Demucs; return dict stemname->wavpath."""
    print("[1/3] Demucs-Trennung (kann einige Minuten dauern) ...")
    run([sys.executable, "-m", "demucs", "-n", MODEL, "-o", workdir, inp])
    base = os.path.splitext(os.path.basename(inp))[0]
    stemdir = os.path.join(workdir, MODEL, base)
    return {name: os.path.join(stemdir, f"{name.lower()}.wav")
            for name, _ in STEMS}


def mux(inp, stem_wavs, out_mp4):
    """Mux master + 4 stems into one mp4 with 5 audio streams (moov at end)."""
    print("[2/3] ffmpeg-Mux (5 Audiospuren) ...")
    cmd = [FFMPEG, "-y", "-i", inp]
    for name, _ in STEMS:
        cmd += ["-i", stem_wavs[name]]
    # map: stream 0 = original master, streams 1..4 = stems
    cmd += ["-map", "0:a:0"]
    for i in range(1, 5):
        cmd += ["-map", f"{i}:a:0"]
    # MP3 streams, not AAC: Mixxx's bundled FFmpeg has no internal AAC decoder
    # (only libfdk_aac, which Mixxx rejects for stems). MP3 decodes natively.
    cmd += ["-c:a", "libmp3lame", "-b:a", BITRATE, "-ar", str(SR),
            "-movflags", "-faststart",  # keep moov at END (mdat first)
            out_mp4]
    run(cmd)


def _boxes(data, start, end):
    out = []
    i = start
    while i + 8 <= end:
        size = struct.unpack(">I", data[i:i + 4])[0]
        typ = bytes(data[i + 4:i + 8])
        if size == 1:  # 64-bit extended size
            size = struct.unpack(">Q", data[i + 8:i + 16])[0]
            out.append((typ, i, size, True))
        elif size == 0:
            size = end - i
            out.append((typ, i, size, False))
        else:
            out.append((typ, i, size, False))
        i += size
    return out


def inject_stem_atom(mp4_path, out_path):
    """Insert the NI stem manifest as moov.udta.stem (JSON)."""
    print("[3/3] Stem-Manifest (moov.udta.stem) einfuegen ...")
    manifest = {"version": 1,
                "stems": [{"color": c, "name": n} for n, c in STEMS]}
    payload = json.dumps(manifest).encode("utf-8")
    stem_box = struct.pack(">I", 8 + len(payload)) + b"stem" + payload

    data = bytearray(open(mp4_path, "rb").read())
    top = _boxes(data, 0, len(data))
    moov = next(b for b in top if b[0] == b"moov")
    mdat = next((b for b in top if b[0] == b"mdat"), None)
    m_typ, m_start, m_size, m_ext = moov
    if m_ext:
        raise RuntimeError("moov uses 64-bit size; not supported by this POC")
    if mdat and mdat[1] > m_start:
        raise RuntimeError("moov is before mdat (faststart) — sample offsets "
                           "would break; re-mux without faststart")
    m_end = m_start + m_size
    inner = _boxes(data, m_start + 8, m_end)
    udta = next((b for b in inner if b[0] == b"udta"), None)

    if udta:
        u_typ, u_start, u_size, u_ext = udta
        u_end = u_start + u_size
        new = data[:u_end] + stem_box + data[u_end:]
        struct.pack_into(">I", new, u_start, u_size + len(stem_box))
        struct.pack_into(">I", new, m_start, m_size + len(stem_box))
    else:
        udta_box = struct.pack(">I", 8 + len(stem_box)) + b"udta" + stem_box
        new = data[:m_end] + udta_box + data[m_end:]
        struct.pack_into(">I", new, m_start, m_size + len(udta_box))

    open(out_path, "wb").write(new)


def convert(inp, out):
    """Full pipeline for one file: separate -> mux -> inject manifest."""
    with tempfile.TemporaryDirectory() as wd:
        stem_wavs = separate(inp, wd)
        for name, p in stem_wavs.items():
            if not os.path.exists(p):
                raise RuntimeError(f"Demucs-Ausgabe fehlt: {p}")
        tmp_mp4 = os.path.join(wd, "muxed.mp4")
        mux(inp, stem_wavs, tmp_mp4)
        inject_stem_atom(tmp_mp4, out)
    return out


def main():
    inp = os.path.abspath(sys.argv[1])
    out = os.path.abspath(sys.argv[2]) if len(sys.argv) > 2 else \
        os.path.splitext(inp)[0] + ".stem.mp4"
    convert(inp, out)
    print(f"\nFERTIG -> {out}")


if __name__ == "__main__":
    main()
