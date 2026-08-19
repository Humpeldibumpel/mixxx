"""Write a Pioneer DeviceSQL database (export.pdb).

Layout follows lib/rekordbox-metadata/rekordbox_pdb.ksy, the crate-digger
specification Mixxx already uses for reading rekordbox media. Everything here is
little-endian.

Structure recap: the file is a sequence of fixed-size pages. Page 0 holds the
header listing every table and the first/last page of its linked chain. Each
table page carries a 40-byte header, then a heap that grows forward while a row
index grows backwards from the end of the page in groups of sixteen.
"""
import struct

PAGE_SIZE = 4096
PAGE_HEADER_LEN = 40
ROW_GROUP_STRIDE = 0x24

# page_type values we populate; the rest are written as empty tables because
# rekordbox media always lists the full set.
T_TRACKS, T_GENRES, T_ARTISTS, T_ALBUMS, T_LABELS = 0, 1, 2, 3, 4
T_KEYS, T_COLORS, T_PLAYLIST_TREE, T_PLAYLIST_ENTRIES = 5, 6, 7, 8
T_UNKNOWN_9, T_UNKNOWN_10 = 9, 10
T_HISTORY_PLAYLISTS, T_HISTORY_ENTRIES, T_ARTWORK = 11, 12, 13
T_UNKNOWN_14, T_UNKNOWN_15, T_COLUMNS = 14, 15, 16
T_UNKNOWN_17, T_UNKNOWN_18, T_HISTORY = 17, 18, 19

ALL_TABLES = [T_TRACKS, T_GENRES, T_ARTISTS, T_ALBUMS, T_LABELS, T_KEYS,
              T_COLORS, T_PLAYLIST_TREE, T_PLAYLIST_ENTRIES, T_UNKNOWN_9,
              T_UNKNOWN_10, T_HISTORY_PLAYLISTS, T_HISTORY_ENTRIES, T_ARTWORK,
              T_UNKNOWN_14, T_UNKNOWN_15, T_COLUMNS, T_UNKNOWN_17,
              T_UNKNOWN_18, T_HISTORY]


# --- string encoding --------------------------------------------------------

def dsql(text):
    """Encode a device_sql_string.

    Short ASCII packs the length into one byte as ((len + 1) << 1) | 1. Anything
    non-ASCII or long goes out as UTF-16LE with a four-byte header.
    """
    if text is None:
        text = ""
    try:
        raw = text.encode("ascii")
        if len(raw) < 127:
            return struct.pack("<B", ((len(raw) + 1) << 1) | 1) + raw
    except UnicodeEncodeError:
        pass
    raw = text.encode("utf-16-le")
    return struct.pack("<BHB", 0x90, len(raw) + 4, 0) + raw


def dsql_ascii_long(text):
    raw = (text or "").encode("ascii", "replace")
    return struct.pack("<BHB", 0x40, len(raw) + 4, 0) + raw


# --- row builders -----------------------------------------------------------
# Each builder returns bytes for one row. Rows that carry strings inline simply
# append them; the track row instead stores 21 offsets relative to the row start.

def row_simple_named(row_id, name):
    """genres, labels: id then name."""
    return struct.pack("<I", row_id) + dsql(name)


def row_key(row_id, name):
    """keys: id twice, then name."""
    return struct.pack("<II", row_id, row_id) + dsql(name)


def row_color(row_id, name):
    """colors: 8-byte prefix, then the name (the ksy shows 7)."""
    return struct.pack("<IBHB", 0, row_id & 0xFF, row_id, 0) + dsql(name)


def row_artist(row_id, name):
    """artists: subtype, index_shift, id, unknown u1, name offset, name."""
    # subtype 0x60 keeps the name offset in a single byte, which is what the
    # fixed part below adds up to (10 bytes).
    return struct.pack("<HHIBB", 0x60, 0, row_id, 0x03, 10) + dsql(name)


def row_album(row_id, name, artist_id=0):
    """albums: unknown, index_shift, unknown, artist_id, id, unknown, u1, ofs."""
    return struct.pack("<HHIIIIBB", 0x80, 0, 0, artist_id, row_id, 0, 0x03, 22) + dsql(name)


def row_artwork(row_id, path):
    return struct.pack("<I", row_id) + dsql(path)


def row_playlist_tree(row_id, parent_id, sort_order, is_folder, name):
    # 20 fixed bytes, not the 16 the ksy lists: a real export has an extra u4
    # between parent_id and sort_order. Getting this wrong shifts id, is_folder
    # and the name, so no playlist_entry would resolve to its playlist.
    return struct.pack("<IIIII", parent_id, 0, sort_order, row_id,
                       1 if is_folder else 0) + dsql(name)


def row_playlist_entry(entry_index, track_id, playlist_id):
    return struct.pack("<III", entry_index, track_id, playlist_id)


TRACK_STRING_COUNT = 21
# Fixed part of a track row, before the 21 string offsets.
_TRACK_FIXED = "<HHIIIIIHHIIIIIIIIIIIIHHHHHHBBHH"


def row_track(t):
    """Build a track row.

    `t` is a dict with the ids resolved against the other tables plus the
    strings. String offsets are relative to the start of the row.
    """
    fixed = struct.pack(
        _TRACK_FIXED,
        0x24,                      # unknown, matches what rekordbox writes
        0,                         # index_shift, filled in by Page.render()
        t.get("bitmask", 0x000C0700),
        t["sample_rate"],
        t.get("composer_id", 0),
        t["file_size"],
        # A per-track u4 sits here (observed 0x01188414, 0x09452ed2, 0x02f0ab71,
        # 0x0186e16e). Its derivation is unknown, and a fabricated value is no
        # safer than zero.
        0,
        51096, 60247,              # observed constants; the ksy lists stale ones
        t.get("artwork_id", 0),
        t.get("key_id", 0),
        t.get("original_artist_id", 0),
        t.get("label_id", 0),
        t.get("remixer_id", 0),
        t.get("bitrate", 0),
        t.get("track_number", 0),
        t["tempo"],                # bpm * 100
        t.get("genre_id", 0),
        t.get("album_id", 0),
        t.get("artist_id", 0),
        t["id"],
        t.get("disc_number", 0),
        t.get("play_count", 0),
        t.get("year", 0),
        t.get("sample_depth", 16),
        t["duration"],
        41,                        # unknown u2, constant in the reference
        t.get("color_id", 0),
        t.get("rating", 0),
        1, 3,                      # observed; the ksy calls the second 2 or 3
    )
    header_len = len(fixed) + 2 * TRACK_STRING_COUNT

    strings = t["strings"]
    assert len(strings) == TRACK_STRING_COUNT, len(strings)
    offsets, blob = [], b""
    for s in strings:
        offsets.append(header_len + len(blob))
        blob += s
    return fixed + struct.pack("<%dH" % TRACK_STRING_COUNT, *offsets) + blob


def track_strings(isrc="", texter="", message="", kuvo_public="",
                  autoload_hot_cues="", date_added="", release_date="",
                  mix_name="", analyze_path="", analyze_date="", comment="",
                  title="", filename="", file_path=""):
    """Assemble the 21 track strings in their on-disk order."""
    empty = dsql("")
    return [
        dsql(isrc),            # 0
        dsql(texter),          # 1
        empty,                 # 2
        empty,                 # 3
        empty,                 # 4
        dsql(message),         # 5
        dsql(kuvo_public),     # 6
        dsql(autoload_hot_cues),  # 7
        empty,                 # 8
        empty,                 # 9
        dsql(date_added),      # 10
        dsql(release_date),    # 11
        dsql(mix_name),        # 12
        empty,                 # 13
        dsql(analyze_path),    # 14
        dsql(analyze_date),    # 15
        dsql(comment),         # 16
        dsql(title),           # 17
        empty,                 # 18
        dsql(filename),        # 19
        dsql(file_path),       # 20
    ]


# --- page assembly ----------------------------------------------------------

class Page:
    """One table page: a heap of rows plus the backwards-growing row index."""

    def __init__(self, index, page_type):
        self.index = index
        self.type = page_type
        self.rows = []

    def capacity_for(self, row):
        """Would `row` still fit, counting the index growth it causes?

        Rows are padded to four bytes in render(), so the padded length is what
        actually consumes the heap. The index reservation stays at the full
        36-byte group stride even though free_size reports the tighter figure -
        the rest of the group is physically reserved either way.
        """
        n = len(self.rows) + 1
        groups = (n + 15) // 16
        index_bytes = groups * ROW_GROUP_STRIDE
        heap_bytes = sum(_aligned(len(r)) for r in self.rows) + _aligned(len(row))
        return PAGE_HEADER_LEN + heap_bytes + index_bytes <= PAGE_SIZE

    def add(self, row):
        self.rows.append(row)

    def render(self, next_page_index):
        buf = bytearray(PAGE_SIZE)
        heap = bytearray()
        offsets = []
        for slot, row in enumerate(self.rows):
            # Only these three row types carry an index_shift halfword at [2:4];
            # elsewhere those bytes are the high half of an id and must not be
            # touched. The counter restarts on every page.
            if self.type in (T_TRACKS, T_ARTISTS, T_ALBUMS):
                row = bytearray(row)
                struct.pack_into("<H", row, 2, (32 * slot) & 0xFFFF)
                row = bytes(row)
            offsets.append(len(heap))
            heap += row
            # Rows are padded to a 4-byte boundary so following rows stay aligned.
            while len(heap) % 4:
                heap.append(0)

        num_rows = len(self.rows)
        struct.pack_into("<IIII", buf, 0, 0, self.index, self.type, next_page_index)
        struct.pack_into("<I", buf, 16, 0)          # sequence
        struct.pack_into("<I", buf, 20, 0)
        buf[24] = min(num_rows, 0xFF)               # num_rows_small
        # u2 at 25 is 32 * the number of present rows in a real export.
        struct.pack_into("<H", buf, 25, 32 * num_rows)
        buf[27] = 0x24                              # all rows present, none deleted
        groups = (num_rows + 15) // 16 if num_rows else 0
        used = len(heap)
        # free_size counts only the index bytes actually written (two per row
        # plus four flag bytes per group), not the full group stride.
        index_used = 2 * num_rows + 4 * groups
        free = PAGE_SIZE - PAGE_HEADER_LEN - used - index_used
        struct.pack_into("<HH", buf, 28, free, used)
        if num_rows <= 0xFF:
            # Verified invariant: num_rows_small == u2@32 + num_rows_large.
            struct.pack_into("<H", buf, 32, num_rows)
            struct.pack_into("<H", buf, 34, 0)
        else:
            # No reference page exceeds 27 rows, so this regime is unverified;
            # keep the encoding the spec describes for large row counts.
            struct.pack_into("<H", buf, 32, 0)
            struct.pack_into("<H", buf, 34, num_rows)
        struct.pack_into("<HH", buf, 36, 0, 0)

        buf[PAGE_HEADER_LEN:PAGE_HEADER_LEN + used] = heap

        # Row index: groups build backwards from the end of the page.
        for g in range(groups):
            base = PAGE_SIZE - (g * ROW_GROUP_STRIDE)
            present = 0
            for slot in range(16):
                idx = g * 16 + slot
                if idx >= num_rows:
                    break
                present |= 1 << slot
                struct.pack_into("<H", buf, base - (6 + 2 * slot), offsets[idx])
            struct.pack_into("<H", buf, base - 4, present)
        return bytes(buf)


def _aligned(n):
    return n + (-n % 4)


def _leading_page(index, page_type, next_index, is_terminal):
    """The head of every table chain.

    rekordbox does not put an empty data page here but a "strange" page: flags
    0x64 clears the is_data_page bit, so a reader never tries to parse a row
    group out of it. Reproduced byte for byte from the reference export.
    """
    buf = bytearray(PAGE_SIZE)
    struct.pack_into("<IIII", buf, 0, 0, index, page_type, next_index)
    struct.pack_into("<II", buf, 16, 1, 0)          # sequence, unknown
    buf[24] = 0
    buf[25] = 0
    buf[26] = 0
    buf[27] = 0x64                                  # non-data page
    struct.pack_into("<HHHHHH", buf, 28, 0, 0, 0x1FFF, 0x1FFF, 1004, 0)
    struct.pack_into("<IIII", buf, 40, index,
                     0x03FFFFFF if is_terminal else next_index, 0x03FFFFFF, 0)
    struct.pack_into("<HH", buf, 56, 0, 0x1FFF)
    struct.pack_into("<1004I", buf, 60, *([0x1FFFFFF8] * 1004))
    return bytes(buf)


def build(tables):
    """Render the whole database.

    `tables` maps page_type -> list of row bytes. Every type in ALL_TABLES gets
    a chain, empty ones included.
    """
    # Page 0 is the file header. Each table starts with a leading non-data page
    # followed by its data pages. An empty table is just the leading page, so
    # first_page == last_page - which is what a real export looks like.
    chains = {}
    next_index = 1
    for ttype in ALL_TABLES:
        rows = tables.get(ttype, [])
        head_index = next_index
        next_index += 1
        data_pages = []
        if rows:
            current = Page(next_index, ttype)
            next_index += 1
            for row in rows:
                if not current.capacity_for(row):
                    data_pages.append(current)
                    current = Page(next_index, ttype)
                    next_index += 1
                current.add(row)
            data_pages.append(current)
        chains[ttype] = (head_index, data_pages)

    total_pages = next_index
    out = bytearray()

    # --- file header page ---
    header = bytearray(PAGE_SIZE)
    struct.pack_into("<IIII", header, 0, 0, PAGE_SIZE, len(ALL_TABLES), total_pages)
    struct.pack_into("<I", header, 16, 0)
    struct.pack_into("<I", header, 20, 1)          # sequence
    struct.pack_into("<I", header, 24, 0)          # gap
    pos = 28
    for ttype in ALL_TABLES:
        head_index, data_pages = chains[ttype]
        last_index = data_pages[-1].index if data_pages else head_index
        struct.pack_into("<IIII", header, pos, ttype, 0, head_index, last_index)
        pos += 16
    out += header

    # --- table pages, in index order ---
    rendered = {}
    for ttype in ALL_TABLES:
        head_index, data_pages = chains[ttype]
        first_data = data_pages[0].index if data_pages else total_pages
        rendered[head_index] = _leading_page(head_index, ttype, first_data,
                                             is_terminal=not data_pages)
        for i, page in enumerate(data_pages):
            nxt = data_pages[i + 1].index if i + 1 < len(data_pages) else total_pages
            rendered[page.index] = page.render(nxt)
    for idx in range(1, total_pages):
        out += rendered[idx]
    return bytes(out)
