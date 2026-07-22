#!/usr/bin/env python3
"""Export selected Mixxx crates to a rekordbox collection.xml (incl. hotcues/loops).

Usage: python mixxx2rekordbox.py <mixxxdb.sqlite> <out.xml> <crate_id> [crate_id ...]
"""
import sqlite3
import sys
import os
import shutil
import tempfile
import urllib.parse
import xml.etree.ElementTree as ET

# Mixxx cue types (src/engine/cue.h CueType)
HOTCUE, MAINCUE, LOOP = 1, 2, 4

def seconds(pos, samplerate):
    # Mixxx stores cue position in stereo samples (frames * 2).
    return pos / (2.0 * samplerate)

def rb_location(path):
    # rekordbox wants file://localhost/ + percent-encoded absolute path.
    p = path.replace("\\", "/")
    return "file://localhost/" + urllib.parse.quote(p, safe="/:")

def color_rgb(c):
    if c is None or c < 0:
        return None
    return ((c >> 16) & 255, (c >> 8) & 255, c & 255)

def main():
    db, out, crate_ids = sys.argv[1], sys.argv[2], [int(x) for x in sys.argv[3:]]

    # Optional: copy audio files into this dir and rewrite Location to point
    # there (used for the portable USB fallback bundle).
    copydir = os.environ.get("MIXXX2RB_COPYDIR")
    if copydir:
        os.makedirs(copydir, exist_ok=True)

    # Copy DB so we can read even while Mixxx holds it open.
    tmp = os.path.join(tempfile.gettempdir(), "mixxx_export_copy.sqlite")
    shutil.copy2(db, tmp)
    con = sqlite3.connect(tmp)
    con.row_factory = sqlite3.Row
    cur = con.cursor()

    # Collect track ids from the requested crates (preserve a stable order).
    tids = []
    for cid in crate_ids:
        for r in cur.execute(
                "SELECT track_id FROM crate_tracks WHERE crate_id=? ORDER BY track_id", (cid,)):
            if r[0] not in tids:
                tids.append(r[0])

    root = ET.Element("DJ_PLAYLISTS", Version="1.0.0")
    ET.SubElement(root, "PRODUCT", Name="rekordbox", Version="6.0.0", Company="AlphaTheta")
    collection = ET.SubElement(root, "COLLECTION", Entries=str(len(tids)))

    exported, skipped, n_hot, n_loop, n_mem = [], [], 0, 0, 0

    for tid in tids:
        t = cur.execute("""SELECT l.id,l.artist,l.title,l.album,l.genre,l.duration,
                   l.bitrate,l.samplerate,l.bpm,l.key,l.filetype,l.tracknumber,
                   tl.location
                   FROM library l JOIN track_locations tl ON l.location=tl.id
                   WHERE l.id=?""", (tid,)).fetchone()
        if not t or not t["location"] or not os.path.exists(t["location"]):
            skipped.append((tid, "Datei fehlt"))
            continue
        loc = t["location"]
        if copydir:
            dest = os.path.join(copydir, os.path.basename(loc))
            shutil.copy2(loc, dest)
            loc = dest
        sr = t["samplerate"] or 44100
        attrs = {
            "TrackID": str(tid),
            "Name": t["title"] or os.path.basename(t["location"]),
            "Artist": t["artist"] or "",
            "Album": t["album"] or "",
            "Genre": t["genre"] or "",
            "Kind": (t["filetype"] or "").upper() + " File",
            "TotalTime": str(int(round(t["duration"] or 0))),
            "SampleRate": str(sr),
            "BitRate": str(t["bitrate"] or 0),
            "Location": rb_location(loc),
        }
        if t["bpm"]:
            attrs["AverageBpm"] = "%.2f" % t["bpm"]
        if t["key"]:
            attrs["Tonality"] = t["key"]
        if t["tracknumber"]:
            attrs["TrackNumber"] = str(t["tracknumber"])
        track_el = ET.SubElement(collection, "TRACK", attrs)

        # Read all cues once, split by kind.
        rows = cur.execute("""SELECT type,hotcue,position,length,label,color
                   FROM cues WHERE track_id=? ORDER BY type,hotcue,position""",
                (tid,)).fetchall()
        hotcues = [c for c in rows if c["type"] == HOTCUE and c["position"] is not None and c["position"] >= 0]
        maincues = [c for c in rows if c["type"] == MAINCUE and c["position"] is not None and c["position"] >= 0]
        loops = [c for c in rows if c["type"] == LOOP and c["position"] is not None and c["position"] >= 0 and c["length"]]
        # types 6/7/8 (intro/outro/auto) intentionally skipped

        used_nums = {c["hotcue"] for c in hotcues}

        # Hotcues -> hotcue POSITION_MARK on their pad slot.
        for c in hotcues:
            pm = {"Name": c["label"] or "", "Type": "0",
                  "Start": "%.3f" % seconds(c["position"], sr), "Num": str(c["hotcue"])}
            rgb = color_rgb(c["color"])
            if rgb:
                pm["Red"], pm["Green"], pm["Blue"] = map(str, rgb)
            ET.SubElement(track_el, "POSITION_MARK", pm)
            n_hot += 1

        # Main cue -> memory cue point.
        for c in maincues:
            ET.SubElement(track_el, "POSITION_MARK", {
                "Name": "", "Type": "0",
                "Start": "%.3f" % seconds(c["position"], sr), "Num": "-1"})
            n_mem += 1

        # Loops -> hotcue LOOP on the next free pad slot (rekordbox shows these
        # reliably as active loops; memory loops from XML often import as a point).
        for c in loops:
            free = next((n for n in range(8) if n not in used_nums), None)
            start = "%.3f" % seconds(c["position"], sr)
            end = "%.3f" % seconds(c["position"] + c["length"], sr)
            pm = {"Name": c["label"] or "", "Type": "4", "Start": start, "End": end}
            if free is not None:
                used_nums.add(free)
                pm["Num"] = str(free)
            else:
                pm["Num"] = "-1"  # no free pad -> fall back to memory loop
            rgb = color_rgb(c["color"])
            if rgb:
                pm["Red"], pm["Green"], pm["Blue"] = map(str, rgb)
            ET.SubElement(track_el, "POSITION_MARK", pm)
            n_loop += 1
        exported.append(tid)

    # Playlists node: one playlist per crate.
    playlists = ET.SubElement(root, "PLAYLISTS")
    rootnode = ET.SubElement(playlists, "NODE", Type="0", Name="ROOT", Count=str(len(crate_ids)))
    for cid in crate_ids:
        name = cur.execute("SELECT name FROM crates WHERE id=?", (cid,)).fetchone()[0]
        members = [r[0] for r in cur.execute(
            "SELECT track_id FROM crate_tracks WHERE crate_id=? ORDER BY track_id", (cid,))
            if r[0] in exported]
        node = ET.SubElement(rootnode, "NODE", Name=name, Type="1",
                             KeyType="0", Entries=str(len(members)))
        for tid in members:
            ET.SubElement(node, "TRACK", Key=str(tid))

    collection.set("Entries", str(len(exported)))
    ET.indent(root, space="  ")
    ET.ElementTree(root).write(out, encoding="UTF-8", xml_declaration=True)

    print(f"Exportiert: {len(exported)} Tracks -> {out}")
    print(f"  Hotcues: {n_hot} | Loops: {n_loop} | Memory-Cues: {n_mem}")
    if skipped:
        print("  Übersprungen:")
        for tid, why in skipped:
            print(f"    Track {tid}: {why}")
    con.close()

if __name__ == "__main__":
    main()
