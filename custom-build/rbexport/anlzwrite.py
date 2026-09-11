"""Write Pioneer ANLZ analysis files (ANLZ0000.DAT / .EXT).

Layout follows lib/rekordbox-metadata/rekordbox_anlz.ksy, which is the
Deep-Symmetry crate-digger specification that Mixxx already uses for reading.
Everything here is big-endian.

.DAT is what every CDJ reads: path, beat grid, cue lists and the monochrome
waveforms. .EXT adds the nxs2-era extras: scrolling and colour waveforms plus
the extended cue entries that carry hot cue colours and names.
"""
import struct

# rekordbox cue kinds
CUE_KIND_MEMORY, CUE_KIND_HOTCUE = 0, 1
ENTRY_TYPE_POINT, ENTRY_TYPE_LOOP = 1, 2


def _utf16be_z(text):
    """UTF-16BE with a null terminator, as ANLZ stores its strings."""
    return text.encode("utf-16-be") + b"\x00\x00"


def _section(fourcc, len_header, body):
    """Frame a tag: fourcc, header length, total length, then the body."""
    len_tag = 12 + len(body)
    return fourcc + struct.pack(">II", len_header, len_tag) + body


# --- individual tags --------------------------------------------------------

def tag_path(device_path):
    """PPTH - the track's path on the device, e.g. /Contents/foo.mp3"""
    raw = _utf16be_z(device_path)
    return _section(b"PPTH", 16, struct.pack(">I", len(raw)) + raw)


def tag_beat_grid(beats):
    """PQTZ - beats as (beat_number 1-4, bpm, milliseconds)."""
    body = struct.pack(">III", 0, 0x80000, len(beats))
    for number, bpm, ms in beats:
        body += struct.pack(">HHI", number, int(round(bpm * 100)), int(ms))
    return _section(b"PQTZ", 24, body)


def _cue_entry(hot_cue, is_loop, time_ms, loop_time_ms):
    # status is 0 and the order fields are 0xFFFF on every reference entry -
    # rekordbox writes no chain at all, so we do not build one either.
    body = b"PCPT"
    body += struct.pack(">II", 0x1C, 0x38)
    body += struct.pack(">III", hot_cue, 0, 0x10000)
    body += struct.pack(">HH", 0xFFFF, 0xFFFF)
    body += struct.pack(">B", ENTRY_TYPE_LOOP if is_loop else ENTRY_TYPE_POINT)
    body += b"\x00\x03\xe8"        # decimal 1000, as the spec's comment says
    body += struct.pack(">II", int(time_ms), int(loop_time_ms) if is_loop else 0xFFFFFFFF)
    body += b"\x00" * 16
    return body


def tag_cues(kind, cues):
    """PCOB - the classic cue list. cues: (hot_cue, is_loop, start_ms, end_ms).

    Entries keep the caller's order; rekordbox does not sort them either.
    """
    entries = b"".join(_cue_entry(*c) for c in cues)
    body = struct.pack(">I", kind) + b"\x00\x00" + struct.pack(">H", len(cues))
    body += struct.pack(">I", 0xFFFFFFFF) + entries    # memory_count, always -1
    return _section(b"PCOB", 24, body)


def _cue_extended_entry(hot_cue, is_loop, time_ms, loop_time_ms, comment, rgb):
    # The comment is NUL-terminated and the terminator counts towards
    # len_comment; the entry ends in a 40-byte zero tail. Total 88 + comment,
    # which reproduces every reference entry size exactly.
    raw_comment = (comment or "").encode("utf-16-be") + b"\x00\x00"
    body = b"PCP2"
    len_entry = 88 + len(raw_comment)
    body += struct.pack(">II", 0x10, len_entry)
    body += struct.pack(">I", hot_cue)
    body += struct.pack(">B", ENTRY_TYPE_LOOP if is_loop else ENTRY_TYPE_POINT)
    body += b"\x00\x03\xe8"
    body += struct.pack(">II", int(time_ms), int(loop_time_ms) if is_loop else 0xFFFFFFFF)
    body += struct.pack(">B", 0) + b"\x01\x00\x00" + b"\x00" * 4   # color_id block
    body += struct.pack(">HH", 0, 0)          # loop numerator/denominator
    body += struct.pack(">I", len(raw_comment)) + raw_comment
    # No reference entry has rgb absent, so the all-zero case is unattested.
    r, g, b = rgb if rgb else (0, 0, 0)
    body += struct.pack(">BBBB", 0, r, g, b)
    body += b"\x00" * 40
    return body


def tag_cues_extended(kind, cues):
    """PCO2 - nxs2 cue list carrying colours and comments.

    cues: (hot_cue, is_loop, start_ms, end_ms, comment, (r,g,b) or None)
    """
    entries = b"".join(_cue_extended_entry(*c) for c in cues)
    body = struct.pack(">I", kind) + struct.pack(">H", len(cues)) + b"\x00\x00" + entries
    return _section(b"PCO2", 20, body)


def tag_cues_empty(kind):
    """An empty PCOB, as a real .EXT carries even when cues exist."""
    hdr = b"\x00\x00\x00\x01" if kind == CUE_KIND_HOTCUE else b"\x00\x00\x00\x00"
    return _section(b"PCOB", 24, hdr + b"\x00\x00\x00\x00\xff\xff\xff\xff")


def _preview_whiteness(h):
    """HEURISTIC. Whiteness is really driven by spectral content, which is not
    derived; height only correlates with it (-0.75 pooled). This descending ramp
    reproduces roughly 39% of reference bytes where an ascending one got 3%.
    Values 6 and 7 never occur in a reference PWAV, hence the cap at 5.
    """
    return 5 if h <= 8 else 4 if h <= 14 else 3 if h <= 18 else 2


def _scroll_whiteness(h):
    """HEURISTIC, shallower than the preview ramp. Same caveat applies."""
    return 5 if h <= 10 else 4 if h <= 20 else 3


def tag_wave_preview(heights):
    """PWAV - 400 columns, each byte: bits 0-4 height, bits 5-7 whiteness.

    Heights run at full resolution but whiteness is shared within each even
    column pair, which holds in 200/200 reference pairs.
    """
    # h==0 and h==1 never occur in a reference PWAV; the ceiling of 25 is
    # inferred from three loud tracks rather than verified.
    clipped = [max(2, min(25, int(h))) for h in heights[:400]]
    clipped += [2] * (400 - len(clipped))
    data = bytearray(400)
    for i in range(0, 400, 2):
        pair = clipped[i:i + 2]
        w = _preview_whiteness(max(pair))
        for j, h in enumerate(pair):
            data[i + j] = (w << 5) | h
    return _section(b"PWAV", 20, struct.pack(">II", len(data), 0x10000) + bytes(data))


def tag_wave_tiny(heights):
    """PWV2 - 100 columns spanning the whole track, low nibble only.

    The reference clips at 15 rather than rescaling from the 0-31 range.
    """
    data = bytes(min(15, max(0, int(h))) for h in heights[:100])
    data = data.ljust(100, b"\x00"[0:1])
    return _section(b"PWV2", 20, struct.pack(">II", len(data), 0x10000) + data)


def tag_wave_scroll(heights):
    """PWV3 - one byte per column at 150 columns/second, full 0-31 range."""
    data = bytes(((_scroll_whiteness(max(0, min(31, int(h)))) << 5)
                  | max(0, min(31, int(h)))) for h in heights)
    body = struct.pack(">III", 1, len(data), 0x960000) + data
    return _section(b"PWV3", 24, body)


def _color_entry(col):
    """Six-byte PWV4 column.

    These are not colours: byte 1 is a SIGNED negative peak, the rest are
    unsigned levels on a x128 scale. The player derives the on-screen colour
    from the three band amplitudes itself.
    """
    peak_pos, peak_neg, level, low, mid, high = col
    return struct.pack(">BbBBBB",
                       min(127, max(0, peak_pos)),
                       max(-128, min(0, peak_neg)),
                       min(127, max(0, level)),
                       min(127, max(0, low)),
                       min(127, max(0, mid)),
                       min(127, max(0, high)))


def tag_wave_color_preview(columns):
    """PWV4 - 1200 columns of (peak_pos, peak_neg, level, low, mid, high)."""
    cols = list(columns[:1200])
    cols += [(0, 0, 0, 0, 0, 0)] * (1200 - len(cols))
    data = b"".join(_color_entry(c) for c in cols)
    body = struct.pack(">III", 6, 1200, 0) + data
    return _section(b"PWV4", 24, body)


def tag_wave_color_scroll(columns):
    """PWV5 - two bytes per column: three 3-bit bands plus a 5-bit height.

    The bit packing below round-trips all 121k reference entries bit-exactly.
    The 3-bit quantisation of each band is NOT derived - rekordbox saturates far
    more often than a linear fraction does, so expect the colours to look
    duller than a real export until the transfer curve is known.
    """
    out = bytearray()
    for h, (low, mid, high) in columns:
        h = max(0, min(31, int(h)))
        packed = ((low >> 5) << 13) | ((mid >> 5) << 10) | ((high >> 5) << 7) | (h << 2)
        out += struct.pack(">H", packed & 0xFFFF)
    body = struct.pack(">III", 2, len(out) // 2, 0x00960305) + bytes(out)
    return _section(b"PWV5", 24, body)


# --- file assembly ----------------------------------------------------------

def build_file(sections):
    """Wrap tags in the PMAI container.

    The 16 bytes after len_file are not zero in a real export; every reference
    file carries the same four words.
    """
    body = b"".join(sections)
    header = b"PMAI" + struct.pack(">II", 28, 28 + len(body))
    header += struct.pack(">IIII", 1, 0x00010000, 0x00010000, 0)
    return header + body


def tag_beat_grid_ext(beats):
    """PQT2 - the extended beat grid.

    The 56-byte header is reproduced from the reference. The body carries one
    u2 per beat: the sub-millisecond part of the beat time in microseconds
    (0-999). PQTZ truncates each beat to whole milliseconds and this tag makes
    up the difference - a reference at 90 BPM shows the tell-tale 833, 500,
    166, 833 cycle of a 666.67 ms interval. Earlier we wrote zeros here, which
    is the right size and the wrong content.

    Header word 8 is a per-track value whose derivation is unknown (observed
    0x01188414, 0x09452ed2, ...); it stays 0 rather than being invented.
    """
    if not beats:
        return b""
    first, last = beats[0], beats[-1]
    body = struct.pack(">IIII", 0, 0x01000002, 0,
                       (first[0] << 16) | int(round(first[1] * 100)))
    body += struct.pack(">II", int(first[2]),
                        (last[0] << 16) | int(round(last[1] * 100)))
    body += struct.pack(">IIIII", int(last[2]), len(beats), 0, 0, 0)
    for _number, _bpm, ms in beats:
        frac = int((ms - int(ms)) * 1000.0)
        body += struct.pack(">H", max(0, min(999, frac)))
    return _section(b"PQT2", 56, body)


def tag_vbr(total_samples):
    """PVBR - a 1620-byte tag whose only decoded field is the sample count.

    The 400 words in between are zero in every reference file; the size is what
    matters, so do not shorten it.
    """
    body = struct.pack(">I", 0) + b"\x00" * 1600 + struct.pack(">I", int(total_samples))
    return _section(b"PVBR", 16, body)


def build_dat(device_path, beats, memory_cues, hot_cues, preview_heights,
              tiny_heights=None, total_samples=0):
    """Tag order follows the reference: PPTH PVBR PQTZ PWAV PWV2 PCOB(hot) PCOB(mem)."""
    sections = [tag_path(device_path), tag_vbr(total_samples)]
    if beats:
        sections.append(tag_beat_grid(beats))
    if preview_heights:
        sections.append(tag_wave_preview(preview_heights))
        sections.append(tag_wave_tiny(tiny_heights if tiny_heights is not None
                                      else preview_heights))
    sections.append(tag_cues(CUE_KIND_HOTCUE, hot_cues))
    sections.append(tag_cues(CUE_KIND_MEMORY, memory_cues))
    return build_file(sections)


def build_ext(device_path, scroll_heights, color_preview, color_scroll,
              memory_cues, hot_cues, beats=None):
    """Tag order follows the reference:
    PPTH PWV3 PCOB(1) PCOB(0) PCO2(1) PCO2(0) PQT2 PWV5 PWV4.

    Both PCOB tags are always present and always empty here - the real cue data
    lives in the .DAT PCOB and in the PCO2 tags below.
    """
    sections = [tag_path(device_path)]
    if scroll_heights:
        sections.append(tag_wave_scroll(scroll_heights))
    sections.append(tag_cues_empty(CUE_KIND_HOTCUE))
    sections.append(tag_cues_empty(CUE_KIND_MEMORY))
    sections.append(tag_cues_extended(CUE_KIND_HOTCUE, hot_cues))
    sections.append(tag_cues_extended(CUE_KIND_MEMORY, memory_cues))
    if beats:
        sections.append(tag_beat_grid_ext(beats))
    if color_scroll:
        sections.append(tag_wave_color_scroll(color_scroll))
    if color_preview:
        sections.append(tag_wave_color_preview(color_preview))
    return build_file(sections)
