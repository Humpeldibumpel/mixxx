"""Read the data a rekordbox device export needs out of mixxxdb.sqlite.

This is the input layer shared by the USB device export. It deliberately has no
dependency on the rekordbox side: everything here is plain Mixxx data.
"""
import os
import shutil
import sqlite3
import struct
import tempfile

# Mixxx cue types, see src/engine/cue.h CueType
CUE_HOTCUE, CUE_MAINCUE, CUE_LOOP = 1, 2, 4


# --- minimal protobuf reader ------------------------------------------------
# Mixxx stores beat grids as protobuf blobs (src/proto/beats.proto). Rather than
# depend on the protobuf runtime we read the handful of fields we need straight
# off the wire format.

def _varint(buf, i):
    shift = result = 0
    while True:
        b = buf[i]
        i += 1
        result |= (b & 0x7F) << shift
        if not b & 0x80:
            return result, i
        shift += 7


def _zigzag_to_signed(v):
    # int32 fields are stored as plain varints, not zigzag, but Mixxx never
    # writes negative frame positions, so a straight value is fine.
    return v


def _fields(buf):
    """Yield (field_number, wire_type, value) for one protobuf message."""
    i, n = 0, len(buf)
    while i < n:
        key, i = _varint(buf, i)
        fnum, wtype = key >> 3, key & 7
        if wtype == 0:
            val, i = _varint(buf, i)
        elif wtype == 1:
            val, i = buf[i:i + 8], i + 8
        elif wtype == 2:
            ln, i = _varint(buf, i)
            val, i = buf[i:i + ln], i + ln
        elif wtype == 5:
            val, i = buf[i:i + 4], i + 4
        else:
            raise ValueError("unsupported protobuf wire type %d" % wtype)
        yield fnum, wtype, val


def parse_beats(blob, version, samplerate):
    """Return (bpm, first_beat_frame, [beat_frames]) or None.

    BeatGrid-2.0 stores a constant bpm plus the first beat; BeatMap-1.0 stores
    every beat explicitly. Positions are frame indices, so seconds =
    frame / samplerate.
    """
    if not blob or not version:
        return None
    try:
        if version.startswith("BeatGrid"):
            bpm = None
            first = 0
            for fnum, wtype, val in _fields(blob):
                if fnum == 1 and wtype == 2:          # Bpm message
                    for f2, w2, v2 in _fields(val):
                        if f2 == 1 and w2 == 1:
                            bpm = struct.unpack("<d", v2)[0]
                elif fnum == 2 and wtype == 2:        # first Beat message
                    for f2, w2, v2 in _fields(val):
                        if f2 == 1 and w2 == 0:
                            first = _zigzag_to_signed(v2)
            if not bpm or bpm <= 0:
                return None
            return bpm, first, None
        if version.startswith("BeatMap"):
            beats = []
            for fnum, wtype, val in _fields(blob):
                if fnum == 1 and wtype == 2:          # repeated Beat
                    for f2, w2, v2 in _fields(val):
                        if f2 == 1 and w2 == 0:
                            beats.append(_zigzag_to_signed(v2))
            if len(beats) < 2:
                return None
            span = (beats[-1] - beats[0]) / float(samplerate)
            bpm = (len(beats) - 1) * 60.0 / span if span > 0 else 0
            return bpm, beats[0], beats
    except (IndexError, ValueError, struct.error):
        return None
    return None


# --- library access ---------------------------------------------------------

class Track:
    __slots__ = ("id", "artist", "title", "album", "genre", "comment", "year",
                 "duration", "bitrate", "samplerate", "bpm", "key", "filetype",
                 "tracknumber", "location", "filesize", "color", "rating",
                 "beats", "cues")

    def __init__(self, **kw):
        for k in self.__slots__:
            setattr(self, k, kw.get(k))


class Cue:
    __slots__ = ("type", "hotcue", "position", "length", "label", "color")

    def __init__(self, **kw):
        for k in self.__slots__:
            setattr(self, k, kw.get(k))

    def seconds(self, samplerate):
        # Mixxx stores cue positions in stereo samples (frames * 2).
        return self.position / (2.0 * samplerate)

    def end_seconds(self, samplerate):
        return (self.position + (self.length or 0)) / (2.0 * samplerate)


def leading_int(value, default=0):
    """Coerce a Mixxx text field to an int.

    `year` and `tracknumber` are varchar columns, so they arrive as strings and
    are not necessarily plain numbers - tags carry things like "2011-11-08",
    "20111108" or "3/12". Take the leading digit run and let the caller clamp.
    """
    if value is None:
        return default
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return int(value)
    digits = ""
    for ch in str(value).strip():
        if not ch.isdigit():
            break
        digits += ch
    return int(digits) if digits else default


def parse_year(value):
    """A four-digit year, even when the tag holds a full date."""
    n = leading_int(value)
    if n > 99999999:
        return 0
    if n > 9999:                 # 20111108 or 201111 -> 2011
        while n > 9999:
            n //= 100 if n > 999999 else 10
    return n if n <= 0xFFFF else 0


def open_library(db_path):
    """Copy the DB aside so we can read it while Mixxx holds it open."""
    tmp = os.path.join(tempfile.gettempdir(), "mixxx_rbexport_copy.sqlite")
    shutil.copy2(db_path, tmp)
    con = sqlite3.connect(tmp)
    con.row_factory = sqlite3.Row
    return con


def crate_name(con, crate_id):
    row = con.execute("SELECT name FROM crates WHERE id=?", (crate_id,)).fetchone()
    return row[0] if row else "Crate %d" % crate_id


def crate_track_ids(con, crate_id):
    return [r[0] for r in con.execute(
        "SELECT track_id FROM crate_tracks WHERE crate_id=? ORDER BY track_id",
        (crate_id,))]


def load_track(con, track_id):
    """Return a Track with cues and beat grid attached, or None if unusable."""
    r = con.execute("""
        SELECT l.id, l.artist, l.title, l.album, l.genre, l.comment, l.year,
               l.duration, l.bitrate, l.samplerate, l.bpm, l.key, l.filetype,
               l.tracknumber, l.rating, l.color, l.beats, l.beats_version,
               tl.location
        FROM library l JOIN track_locations tl ON l.location = tl.id
        WHERE l.id = ?""", (track_id,)).fetchone()
    if not r or not r["location"] or not os.path.exists(r["location"]):
        return None

    sr = r["samplerate"] or 44100
    t = Track(
        id=r["id"], artist=r["artist"] or "", title=r["title"] or os.path.basename(r["location"]),
        album=r["album"] or "", genre=r["genre"] or "", comment=r["comment"] or "",
        year=parse_year(r["year"]), duration=int(round(r["duration"] or 0)),
        bitrate=int(r["bitrate"] or 0), samplerate=sr, bpm=float(r["bpm"] or 0.0),
        key=r["key"] or "", filetype=(r["filetype"] or "").lower(),
        tracknumber=leading_int(r["tracknumber"]), location=r["location"],
        filesize=os.path.getsize(r["location"]), color=r["color"],
        rating=r["rating"] or 0,
        beats=parse_beats(r["beats"], r["beats_version"], sr),
    )

    t.cues = []
    for c in con.execute("""SELECT type, hotcue, position, length, label, color
                            FROM cues WHERE track_id=? ORDER BY type, hotcue, position""",
                         (track_id,)):
        if c["position"] is None or c["position"] < 0:
            continue
        if c["type"] not in (CUE_HOTCUE, CUE_MAINCUE, CUE_LOOP):
            continue  # intro/outro/auto markers have no rekordbox equivalent
        if c["type"] == CUE_LOOP and not c["length"]:
            continue
        t.cues.append(Cue(type=c["type"], hotcue=c["hotcue"], position=c["position"],
                          length=c["length"], label=c["label"] or "", color=c["color"]))
    return t
