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


# --- browse menu vocabulary -------------------------------------------------
# Tables 16/17/18 describe the player's browse categories: 16 names them, 17 and
# 18 carry a visibility flag and a display order for the browse and sort menus.
# A real export always fills them; we left them empty, which is the leading
# suspect for a player showing an otherwise valid library as empty.
#
# The rows are reproduced verbatim from a rekordbox 6 export. They are entirely
# track-independent - no ids, paths or names of the exported library appear in
# them - so copying them is safe. Their internal meaning is only partly
# understood, which is exactly why they are copied rather than modelled.

# (column_id, menu_id, label)
COLUMN_DEFS = [
    (0x01, 0x80, "GENRE"), (0x02, 0x81, "ARTIST"), (0x03, 0x82, "ALBUM"),
    (0x04, 0x83, "TRACK"), (0x05, 0x85, "BPM"), (0x06, 0x86, "RATING"),
    (0x07, 0x87, "YEAR"), (0x08, 0x88, "REMIXER"), (0x09, 0x89, "LABEL"),
    (0x0A, 0x8A, "ORIGINAL ARTIST"), (0x0B, 0x8B, "KEY"), (0x0C, 0x8D, "CUE"),
    (0x0D, 0x8E, "COLOR"), (0x0E, 0x92, "TIME"), (0x0F, 0x93, "BITRATE"),
    (0x10, 0x94, "FILE NAME"), (0x11, 0x84, "PLAYLIST"),
    (0x12, 0x98, "HOT CUE BANK"), (0x13, 0x95, "HISTORY"),
    (0x14, 0x91, "SEARCH"), (0x15, 0x96, "COMMENTS"),
    (0x16, 0x8C, "DATE ADDED"), (0x17, 0x97, "DJ PLAY COUNT"),
    (0x18, 0x90, "FOLDER"), (0x19, 0xA1, "DEFAULT"),
    (0x1A, 0xA2, "ALPHABET"), (0x1B, 0xAA, "MATCHING"),
]

# Tables 17 and 18, one 8-byte row each: column_id, menu_id, and two bytes plus
# an order word whose exact semantics are not derived.
MENU_ROWS_17 = [
    (0x01, 0x01, 0x63, 1, 0), (0x05, 0x06, 0x05, 1, 0), (0x06, 0x07, 0x63, 1, 0),
    (0x07, 0x08, 0x63, 1, 0), (0x08, 0x09, 0x63, 1, 0), (0x09, 0x0A, 0x63, 1, 0),
    (0x0A, 0x0B, 0x63, 1, 0), (0x0D, 0x0F, 0x63, 1, 0), (0x0E, 0x13, 0x04, 1, 0),
    (0x0F, 0x14, 0x06, 1, 0), (0x10, 0x15, 0x63, 1, 0), (0x12, 0x17, 0x63, 1, 0),
    (0x02, 0x02, 0x02, 0, 1), (0x03, 0x03, 0x03, 0, 2), (0x04, 0x04, 0x01, 0, 3),
    (0x0B, 0x0C, 0x63, 0, 4), (0x11, 0x05, 0x63, 0, 5), (0x13, 0x16, 0x63, 0, 6),
    (0x14, 0x12, 0x63, 0, 7), (0x1B, 0x1A, 0x63, 2, 8), (0x18, 0x11, 0x63, 0, 9),
    (0x16, 0x1B, 0x63, 0, 10),
]

MENU_ROWS_18 = [
    (0x01, 0x06, 0x01, 0, 0), (0x15, 0x07, 0x01, 0, 0), (0x0E, 0x08, 0x01, 0, 0),
    (0x08, 0x09, 0x01, 0, 0), (0x09, 0x0A, 0x01, 0, 0), (0x0A, 0x0B, 0x01, 0, 0),
    (0x0F, 0x0D, 0x01, 0, 0), (0x0D, 0x0F, 0x01, 0, 0), (0x17, 0x10, 0x01, 0, 0),
    (0x16, 0x11, 0x01, 0, 0), (0x19, 0x00, 0x00, 1, 0), (0x1A, 0x01, 0x00, 2, 0),
    (0x02, 0x02, 0x00, 3, 0), (0x03, 0x03, 0x00, 4, 0), (0x05, 0x04, 0x00, 5, 0),
    (0x06, 0x05, 0x00, 6, 0), (0x0B, 0x0C, 0x00, 7, 0),
]

# The eight rekordbox colour labels, in id order.
COLOR_NAMES = ["Pink", "Red", "Orange", "Yellow", "Green", "Aqua", "Blue", "Purple"]


def row_column(column_id, menu_id, label):
    """columns: the two ids, then the label wrapped in U+FFFA / U+FFFB.

    The reference always encodes these as 0x90 UTF-16LE, which dsql() picks
    automatically because of the two non-ASCII delimiters.
    """
    # U+FFFA / U+FFFB are the interlinear annotation marks rekordbox uses as
    # delimiters; written as escapes because they are invisible in an editor.
    return struct.pack("<HH", column_id, menu_id) + dsql("￺" + label + "￻")


def row_menu(column_id, menu_id, a, b, order):
    return struct.pack("<HHBBH", column_id, menu_id, a, b, order)


def column_rows():
    return [row_column(c, m, label) for c, m, label in COLUMN_DEFS]


def menu_rows_17():
    return [row_menu(*r) for r in MENU_ROWS_17]


def menu_rows_18():
    return [row_menu(*r) for r in MENU_ROWS_18]


def color_rows():
    return [row_color(i, name) for i, name in enumerate(COLOR_NAMES, 1)]


TRACK_STRING_COUNT = 21
# Fixed part of a track row, before the 21 string offsets.
_TRACK_FIXED = "<HHIIIIIHHIIIIIIIIIIIIHHHHHHBBHH"


def _u(value, bits, name):
    """Coerce to an unsigned int that fits the field.

    Several Mixxx columns are varchar even when they hold numbers, so a stray
    string here would otherwise surface as a bare struct.error in the middle of
    an export. Clamp rather than truncate: a wrong-but-valid value beats a
    corrupt row, and out-of-range input is a data problem, not a format one.
    """
    try:
        n = int(value)
    except (TypeError, ValueError):
        raise ValueError("track field %r is not a number: %r" % (name, value))
    return max(0, min(n, (1 << bits) - 1))


def row_track(t):
    """Build a track row.

    `t` is a dict with the ids resolved against the other tables plus the
    strings. String offsets are relative to the start of the row.
    """
    fixed = struct.pack(
        _TRACK_FIXED,
        0x24,                      # unknown, matches what rekordbox writes
        0,                         # index_shift, filled in by Page.render()
        _u(t.get("bitmask", 0x000C0700), 32, "bitmask"),
        _u(t["sample_rate"], 32, "sample_rate"),
        _u(t.get("composer_id", 0), 32, "composer_id"),
        _u(t["file_size"], 32, "file_size"),
        # A per-track u4 sits here (observed 0x01188414, 0x09452ed2, 0x02f0ab71,
        # 0x0186e16e). Its derivation is unknown, and a fabricated value is no
        # safer than zero.
        0,
        51096, 60247,              # observed constants; the ksy lists stale ones
        _u(t.get("artwork_id", 0), 32, "artwork_id"),
        _u(t.get("key_id", 0), 32, "key_id"),
        _u(t.get("original_artist_id", 0), 32, "original_artist_id"),
        _u(t.get("label_id", 0), 32, "label_id"),
        _u(t.get("remixer_id", 0), 32, "remixer_id"),
        _u(t.get("bitrate", 0), 32, "bitrate"),
        _u(t.get("track_number", 0), 32, "track_number"),
        _u(t["tempo"], 32, "tempo"),               # bpm * 100
        _u(t.get("genre_id", 0), 32, "genre_id"),
        _u(t.get("album_id", 0), 32, "album_id"),
        _u(t.get("artist_id", 0), 32, "artist_id"),
        _u(t["id"], 32, "id"),
        _u(t.get("disc_number", 0), 16, "disc_number"),
        _u(t.get("play_count", 0), 16, "play_count"),
        _u(t.get("year", 0), 16, "year"),
        _u(t.get("sample_depth", 16), 16, "sample_depth"),
        _u(t["duration"], 16, "duration"),
        41,                        # unknown u2, constant in the reference
        _u(t.get("color_id", 0), 8, "color_id"),
        _u(t.get("rating", 0), 8, "rating"),
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
        # Every page that belongs to a table chain carries a non-zero value
        # here in a real export; zero marks a page that was never written.
        self.sequence = 1

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
        struct.pack_into("<I", buf, 16, self.sequence)
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
            # The word right after the present mask is the mask of slots whose
            # index is >= num_rows_large. We keep num_rows_large at 0 and never
            # emit deletions, so it equals the present mask - which is what
            # every reference page with those properties contains. Leaving it
            # zero made our file contradict its own num_rows_small.
            struct.pack_into("<H", buf, base - 2, present)
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
        # A table with no rows still gets one physically present, all-zero page
        # that its empty_candidate points at - that is how a real export marks
        # "nothing written here yet".
        spare_index = None
        if not data_pages:
            spare_index = next_index
            next_index += 1
        chains[ttype] = (head_index, data_pages, spare_index)

    total_real_pages = next_index

    # Sequence numbers run over the pages of every chain, in page order, and
    # start above the value the leading pages carry.
    seq = 2
    for ttype in ALL_TABLES:
        for page in chains[ttype][1]:
            page.sequence = seq
            seq += 1

    # empty_candidate: for a populated table an index past the end of the file,
    # for an empty one its spare page. Never zero, and next_unused_page sits
    # above all of them.
    candidates, past_eof = {}, total_real_pages
    for ttype in ALL_TABLES:
        _head, data_pages, spare_index = chains[ttype]
        if data_pages:
            candidates[ttype] = past_eof
            past_eof += 1
        else:
            candidates[ttype] = spare_index
    next_unused = max(max(candidates.values()) + 1, total_real_pages)

    out = bytearray()

    # --- file header page ---
    header = bytearray(PAGE_SIZE)
    struct.pack_into("<IIII", header, 0, 0, PAGE_SIZE, len(ALL_TABLES), next_unused)
    # Not a constant: a freshly written export has 1 here, an export that has
    # been updated several times counts up (the reference stick reads 5).
    struct.pack_into("<I", header, 16, 1)
    # One above the highest page sequence, which is what `seq` already holds.
    struct.pack_into("<I", header, 20, seq)
    struct.pack_into("<I", header, 24, 0)          # gap
    pos = 28
    for ttype in ALL_TABLES:
        head_index, data_pages, _spare = chains[ttype]
        last_index = data_pages[-1].index if data_pages else head_index
        struct.pack_into("<IIII", header, pos, ttype, candidates[ttype],
                         head_index, last_index)
        pos += 16
    out += header

    # --- table pages, in index order ---
    rendered = {}
    for ttype in ALL_TABLES:
        head_index, data_pages, spare_index = chains[ttype]
        first_data = data_pages[0].index if data_pages else candidates[ttype]
        rendered[head_index] = _leading_page(head_index, ttype, first_data,
                                             is_terminal=not data_pages)
        for i, page in enumerate(data_pages):
            # The last page of a chain links to the table's empty_candidate.
            nxt = (data_pages[i + 1].index if i + 1 < len(data_pages)
                   else candidates[ttype])
            rendered[page.index] = page.render(nxt)
        if spare_index is not None:
            rendered[spare_index] = bytes(PAGE_SIZE)
    for idx in range(1, total_real_pages):
        out += rendered[idx]
    return bytes(out)
