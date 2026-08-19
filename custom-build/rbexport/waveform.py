"""Generate rekordbox waveform data from audio, using ffmpeg + numpy.

What the ANLZ tags actually want, verified against a real rekordbox export:

  PWAV / PWV2 / PWV3  a 0-31 height per column
  PWV4                per column: signed positive and negative peaks, an
                      overall level, and ABSOLUTE low/mid/high band peaks,
                      all on a x128 scale. These are amplitudes, not colours -
                      the player derives the displayed colour itself.
  PWV5                a 0-31 height plus the three band amplitudes, each
                      quantised to 3 bits.

We decode once, split the signal into three bands with a single FFT pass, and
then reduce everything to the column counts each tag needs.
"""
import os
import subprocess

import numpy as np

SCROLL_COLUMNS_PER_SECOND = 150
PREVIEW_COLUMNS = 400
TINY_COLUMNS = 100
COLOR_PREVIEW_COLUMNS = 1200
DECODE_RATE = 22050          # plenty for waveform shape, keeps decoding fast

LOW_CROSSOVER = 200.0        # Hz
HIGH_CROSSOVER = 2000.0


def _ffmpeg():
    env = os.environ.get("RBEXPORT_FFMPEG")
    if env and os.path.exists(env):
        return env
    here = os.path.dirname(os.path.abspath(__file__))
    # here = <root>\mixxx\custom-build\rbexport, so the project root is 3 up.
    root = os.path.dirname(os.path.dirname(os.path.dirname(here)))
    bases = [os.path.join(root, "stem-tools", "ffmpeg"),
             os.path.join(os.path.dirname(here), "ffmpeg"),
             os.path.join(here, "ffmpeg")]
    for base in bases:
        if not os.path.isdir(base):
            continue
        for dirpath, _dirs, files in os.walk(base):
            for name in ("ffmpeg.exe", "ffmpeg"):
                if name in files:
                    return os.path.join(dirpath, name)
    return "ffmpeg"    # fall back to PATH


def decode_mono(path):
    """Decode to a mono float32 array at DECODE_RATE, or None on failure."""
    cmd = [_ffmpeg(), "-v", "error", "-i", path,
           "-f", "s16le", "-acodec", "pcm_s16le",
           "-ac", "1", "-ar", str(DECODE_RATE), "-"]
    try:
        proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    except OSError:
        return None
    if proc.returncode != 0 or not proc.stdout:
        return None
    return np.frombuffer(proc.stdout, dtype="<i2").astype(np.float32) / 32768.0


def _split_bands(samples):
    """Return (low, mid, high) band signals via one forward and three inverse FFTs."""
    n = samples.size
    spec = np.fft.rfft(samples)
    freqs = np.fft.rfftfreq(n, 1.0 / DECODE_RATE)
    out = []
    for lo, hi in ((0.0, LOW_CROSSOVER),
                   (LOW_CROSSOVER, HIGH_CROSSOVER),
                   (HIGH_CROSSOVER, float("inf"))):
        masked = np.where((freqs >= lo) & (freqs < hi), spec, 0)
        out.append(np.fft.irfft(masked, n).astype(np.float32))
    return out


def _edges(size, count):
    return np.linspace(0, size, count + 1).astype(np.int64)


def _column_heights(samples, count, peak):
    """0-31 heights from per-column RMS, normalised against the track peak."""
    edges = _edges(samples.size, count)
    heights = []
    for i in range(count):
        a, b = edges[i], edges[i + 1]
        if b <= a:
            heights.append(0)
            continue
        chunk = samples[a:b]
        rms = float(np.sqrt(np.mean(chunk * chunk)))
        heights.append(int(round(min(1.0, rms / peak * 2.2) * 31)))
    return heights


def _x128(value):
    """rekordbox scales amplitudes by 128 and truncates toward zero."""
    return min(127, int(abs(value) * 128.0))


def _color_preview_columns(samples, bands, count):
    """PWV4 columns: (peak_pos, peak_neg, level, low, mid, high)."""
    edges = _edges(samples.size, count)
    low_b, mid_b, high_b = bands
    cols = []
    for i in range(count):
        a, b = edges[i], edges[i + 1]
        if b <= a:
            cols.append((0, 0, 0, 0, 0, 0))
            continue
        chunk = samples[a:b]
        peak_pos = _x128(max(0.0, float(chunk.max())))
        peak_neg = -_x128(min(0.0, float(chunk.min())))
        # The exact level estimator is unresolved; a high percentile of the
        # absolute signal stays inside the observed bound of max(|peaks|).
        level = _x128(float(np.percentile(np.abs(chunk), 90)))
        level = min(level, max(peak_pos, -peak_neg))
        cols.append((peak_pos, peak_neg, level,
                     _x128(float(np.abs(low_b[a:b]).max())),
                     _x128(float(np.abs(mid_b[a:b]).max())),
                     _x128(float(np.abs(high_b[a:b]).max()))))
    return cols


def _color_scroll_columns(samples, bands, count, peak):
    """PWV5 columns: (height, (low, mid, high)) with bands on a 0-255 scale."""
    edges = _edges(samples.size, count)
    low_b, mid_b, high_b = bands
    heights = _column_heights(samples, count, peak)
    cols = []
    for i in range(count):
        a, b = edges[i], edges[i + 1]
        if b <= a:
            cols.append((heights[i], (0, 0, 0)))
            continue
        band = tuple(min(255, int(float(np.abs(x[a:b]).max()) / peak * 255))
                     for x in (low_b, mid_b, high_b))
        cols.append((heights[i], band))
    return cols


def analyze(path):
    """Return every waveform representation the ANLZ tags need, or None."""
    samples = decode_mono(path)
    if samples is None or samples.size == 0:
        return None

    peak = float(np.max(np.abs(samples))) or 1.0
    bands = _split_bands(samples)

    seconds = samples.size / float(DECODE_RATE)
    scroll_count = max(1, int(round(seconds * SCROLL_COLUMNS_PER_SECOND)))

    return {
        "preview": _column_heights(samples, PREVIEW_COLUMNS, peak),
        # PWV2 spans the whole track, not the first quarter of the preview.
        "tiny": _column_heights(samples, TINY_COLUMNS, peak),
        "scroll": _column_heights(samples, scroll_count, peak),
        "color_preview": _color_preview_columns(samples, bands, COLOR_PREVIEW_COLUMNS),
        "color_scroll": _color_scroll_columns(samples, bands, scroll_count, peak),
        "seconds": seconds,
        "total_samples": samples.size,
    }
