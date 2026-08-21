"""Build a rekordbox device export (a CDJ-playable USB stick) from Mixxx crates.

Usage:
    python -m rbexport.export_usb <mixxxdb.sqlite> <target-drive> <crate_id> [crate_id ...]

Produces the layout a CDJ expects:
    <target>/Contents/<Artist>/<Album>/<file>          the audio
    <target>/PIONEER/rekordbox/export.pdb              the device database
    <target>/PIONEER/USBANLZ/<a>/<b>/ANLZ0000.DAT|EXT  per-track analysis

Unlike the XML export this needs no rekordbox in between - the stick is ready to
play. Path naming is kept in one place (see the "layout" section) because those
conventions are the part most likely to need adjusting against real hardware.
"""
import os
import re
import shutil
import sys
import time

from . import anlzwrite as A
from . import mixxxsrc as M
from . import pdbwrite as P
from . import waveform as W


# --- layout -----------------------------------------------------------------

_UNSAFE = re.compile(r'[<>:"/\\|?*\x00-\x1f]')
PATH_LIMIT = 48          # the limit a real rekordbox export applies


def _clip(text, limit):
    # Cut first, THEN strip trailing dots and spaces. The other order can leave
    # a trailing dot, which Windows silently drops when creating the file - the
    # name on the stick would then no longer match what export.pdb records.
    return text[:limit].rstrip(". ")


def sanitize(name, fallback="Unknown"):
    """FAT32-safe path component."""
    return _clip(_UNSAFE.sub("_", (name or "").strip()), PATH_LIMIT) or fallback


def sanitize_filename(name, fallback="track"):
    """Like sanitize(), but never truncates the extension away.

    A CDJ dispatches on the extension, so clipping "…Remix) VIP.flac" down to
    "…Remix) VIP." would break playback as well as the lookup.
    """
    cleaned = _UNSAFE.sub("_", (name or "").strip())
    stem, ext = os.path.splitext(cleaned)
    if len(ext) > 10 or " " in ext or ext == ".":
        stem, ext = cleaned, ""          # not really an extension
    stem = _clip(stem, max(1, PATH_LIMIT - len(ext)))
    return (stem or fallback) + ext


def content_rel_path(track):
    """/Contents/<Artist>/<Album>/<filename> as rekordbox lays it out."""
    artist = sanitize(track.artist, "UnknownArtist")
    album = sanitize(track.album, "UnknownAlbum")
    filename = sanitize_filename(os.path.basename(track.location))
    return "/".join(("Contents", artist, album, filename))


def anlz_rel_dir(rb_id):
    """/PIONEER/USBANLZ/<P-group>/<8 hex>/ - one directory per track.

    rekordbox derives these from an internal identifier; any stable unique pair
    works as long as the track row's analyze_path agrees with where we write.
    """
    return "PIONEER/USBANLZ/P%03X/%08X" % (rb_id & 0xFFF, (rb_id * 2654435761) & 0xFFFFFFFF)


# --- id assignment ----------------------------------------------------------

class IdTable:
    """Deduplicating name -> id map, ids starting at 1."""

    def __init__(self):
        self._ids = {}
        self.rows = []

    def get(self, name):
        if not name:
            return 0
        key = name.strip()
        if not key:
            return 0
        if key not in self._ids:
            self._ids[key] = len(self._ids) + 1
        return self._ids[key]

    def items(self):
        return sorted(self._ids.items(), key=lambda kv: kv[1])


# --- cue mapping ------------------------------------------------------------

def map_cues(track):
    """Split Mixxx cues into rekordbox memory and hot cue lists.

    Returns (memory, hot, memory_ext, hot_ext) ready for the anlzwrite tags.
    """
    sr = track.samplerate
    memory, hot, memory_ext, hot_ext = [], [], [], []

    for c in track.cues:
        start_ms = int(round(c.seconds(sr) * 1000))
        end_ms = int(round(c.end_seconds(sr) * 1000))
        is_loop = c.type == M.CUE_LOOP
        rgb = None
        if c.color is not None and c.color >= 0:
            rgb = ((c.color >> 16) & 255, (c.color >> 8) & 255, c.color & 255)

        if c.type == M.CUE_MAINCUE or (is_loop and c.hotcue is None) or \
                (c.hotcue is None or c.hotcue < 0):
            memory.append((0, is_loop, start_ms, end_ms))
            memory_ext.append((0, is_loop, start_ms, end_ms, c.label or "", rgb))
        else:
            slot = c.hotcue + 1          # rekordbox hot cues are 1-based (A=1)
            hot.append((slot, is_loop, start_ms, end_ms))
            hot_ext.append((slot, is_loop, start_ms, end_ms, c.label or "", rgb))

    return memory, hot, memory_ext, hot_ext


def build_beat_grid(track):
    """Turn a Mixxx beat grid into ANLZ (beat_number, bpm, ms) triples."""
    if not track.beats:
        return []
    bpm, first_frame, explicit = track.beats
    sr = float(track.samplerate)
    out = []
    if explicit:
        for i, frame in enumerate(explicit):
            ms = frame / sr * 1000.0
            # Local tempo from the gap to the next beat, so warped grids survive.
            if i + 1 < len(explicit):
                gap = (explicit[i + 1] - frame) / sr
                local = 60.0 / gap if gap > 0 else bpm
            else:
                local = bpm
            out.append((i % 4 + 1, local, ms))
        return out

    if bpm <= 0:
        return []
    interval = 60.0 / bpm
    duration = track.duration or 0
    t = first_frame / sr
    i = 0
    while t < duration:
        out.append((i % 4 + 1, bpm, t * 1000.0))
        i += 1
        t += interval
    return out


# --- main -------------------------------------------------------------------

def export(db_path, target, crate_ids, progress=print):
    con = M.open_library(db_path)

    track_ids, playlists = [], []
    for cid in crate_ids:
        members = M.crate_track_ids(con, cid)
        playlists.append((M.crate_name(con, cid), members))
        for tid in members:
            if tid not in track_ids:
                track_ids.append(tid)

    artists, albums, genres, keys, labels = (IdTable() for _ in range(5))
    track_rows, rb_ids, skipped = [], {}, []
    today = time.strftime("%Y-%m-%d")

    total = len(track_ids)
    for n, tid in enumerate(track_ids, 1):
        t = M.load_track(con, tid)
        if t is None:
            skipped.append((tid, "Datei fehlt"))
            continue
        rb_id = len(rb_ids) + 1
        rb_ids[tid] = rb_id
        progress("[%d/%d] %s - %s" % (n, total, t.artist or "?", t.title))

        rel = content_rel_path(t)
        dest = os.path.join(target, rel.replace("/", os.sep))
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        if not os.path.exists(dest) or os.path.getsize(dest) != t.filesize:
            shutil.copy2(t.location, dest)

        anlz_dir = anlz_rel_dir(rb_id)
        anlz_abs = os.path.join(target, anlz_dir.replace("/", os.sep))
        os.makedirs(anlz_abs, exist_ok=True)

        device_path = "/" + rel
        beats = build_beat_grid(t)
        memory, hot, memory_ext, hot_ext = map_cues(t)

        preview, tiny, scroll = [], [], []
        color_preview, color_scroll = [], []
        wf = W.analyze(t.location)
        if wf is None:
            progress("    Wellenform nicht erzeugbar - Track bleibt ohne Waveform")
            total_samples = 0
        else:
            preview, tiny, scroll = wf["preview"], wf["tiny"], wf["scroll"]
            color_preview, color_scroll = wf["color_preview"], wf["color_scroll"]
            # PVBR counts decoded samples at the file's own rate, in whole
            # MP3 frames of 1152.
            frames = int(round(wf["seconds"] * t.samplerate))
            total_samples = 1152 * (frames // 1152)

        with open(os.path.join(anlz_abs, "ANLZ0000.DAT"), "wb") as fh:
            fh.write(A.build_dat(device_path, beats, memory, hot, preview,
                                 tiny_heights=tiny, total_samples=total_samples))
        with open(os.path.join(anlz_abs, "ANLZ0000.EXT"), "wb") as fh:
            fh.write(A.build_ext(device_path, scroll, color_preview, color_scroll,
                                 memory_ext, hot_ext, beats=beats))

        strings = P.track_strings(
            title=t.title, filename=os.path.basename(rel),
            file_path=device_path, comment=t.comment,
            date_added=today, analyze_date=today,
            analyze_path="/" + anlz_dir + "/ANLZ0000.DAT",
            # release_date stays empty: rekordbox carries the year only in the
            # u2 field, and filling the string shifts every later offset.
            autoload_hot_cues="ON", kuvo_public="ON",
        )
        track_rows.append(P.row_track(dict(
            id=rb_id,
            sample_rate=t.samplerate,
            file_size=t.filesize,
            bitrate=t.bitrate,
            tempo=int(round((t.bpm or 0) * 100)),
            duration=t.duration,
            year=t.year or 0,
            track_number=t.tracknumber or 0,
            rating=t.rating or 0,
            artist_id=artists.get(t.artist),
            album_id=albums.get(t.album),
            genre_id=genres.get(t.genre),
            key_id=keys.get(t.key),
            strings=strings,
        )))

    playlist_rows, entry_rows = [], []
    for i, (name, members) in enumerate(playlists, 1):
        playlist_rows.append(P.row_playlist_tree(i, 0, i - 1, False, name))
        idx = 1
        for tid in members:
            if tid in rb_ids:
                entry_rows.append(P.row_playlist_entry(idx, rb_ids[tid], i))
                idx += 1

    tables = {
        P.T_TRACKS: track_rows,
        P.T_ARTISTS: [P.row_artist(i, n) for n, i in artists.items()],
        P.T_ALBUMS: [P.row_album(i, n) for n, i in albums.items()],
        P.T_GENRES: [P.row_simple_named(i, n) for n, i in genres.items()],
        P.T_KEYS: [P.row_key(i, n) for n, i in keys.items()],
        P.T_LABELS: [P.row_simple_named(i, n) for n, i in labels.items()],
        P.T_PLAYLIST_TREE: playlist_rows,
        P.T_PLAYLIST_ENTRIES: entry_rows,
        # The browse-menu vocabulary. A real export always carries these; a
        # player that builds its categories from them sees nothing without.
        P.T_COLUMNS: P.column_rows(),
        P.T_UNKNOWN_17: P.menu_rows_17(),
        P.T_UNKNOWN_18: P.menu_rows_18(),
        P.T_COLORS: P.color_rows(),
    }

    pdb_dir = os.path.join(target, "PIONEER", "rekordbox")
    os.makedirs(pdb_dir, exist_ok=True)
    with open(os.path.join(pdb_dir, "export.pdb"), "wb") as fh:
        fh.write(P.build(tables))

    con.close()
    progress("\nFertig: %d Tracks, %d Playlists -> %s" %
             (len(track_rows), len(playlist_rows), target))
    if skipped:
        progress("Uebersprungen:")
        for tid, why in skipped:
            progress("  Track %d: %s" % (tid, why))
    return len(track_rows), skipped


def main():
    if len(sys.argv) < 4:
        print(__doc__)
        return 2
    db, target = sys.argv[1], sys.argv[2]
    crates = [int(x) for x in sys.argv[3:]]
    export(db, target, crates)
    return 0


if __name__ == "__main__":
    sys.exit(main())
