#!/usr/bin/env python3
"""Batch-convert a folder or a Mixxx crate into .stem.mp4 files (offline).

Wraps song2stem.convert(): iterates over many tracks, skips already-converted
ones, keeps going on errors, and prints progress. Meant to run unattended
(e.g. overnight) to prepare a whole crate/folder for stem playback in Mixxx.

Examples:
  # all audio in a folder, output next to each original
  python batch2stem.py --folder "C:/Alex/Musik/Scratching"

  # a Mixxx crate by name, into a separate output folder
  python batch2stem.py --crate DNB --outdir "C:/Alex/Musik/Stems"

  # just show what would happen
  python batch2stem.py --crate DNB --dry-run
"""
import argparse
import os
import sqlite3
import sys
import time
import traceback

import song2stem

AUDIO_EXT = {".mp3", ".m4a", ".flac", ".wav", ".aiff", ".aif", ".ogg", ".opus"}
DEFAULT_DB = r"C:\mixxx-build\config-isolated\mixxxdb.sqlite"


def is_audio(path):
    ext = os.path.splitext(path)[1].lower()
    return ext in AUDIO_EXT and not path.lower().endswith(".stem.mp4")


def sources_from_folder(folder, recursive):
    out = []
    if recursive:
        for root, _dirs, files in os.walk(folder):
            for f in files:
                p = os.path.join(root, f)
                if is_audio(p):
                    out.append(p)
    else:
        for f in sorted(os.listdir(folder)):
            p = os.path.join(folder, f)
            if os.path.isfile(p) and is_audio(p):
                out.append(p)
    return out


def sources_from_crate(db_path, crate_name):
    con = sqlite3.connect(db_path)
    cur = con.cursor()
    row = cur.execute("SELECT id FROM crates WHERE name=?", (crate_name,)).fetchone()
    if not row:
        names = [r[0] for r in cur.execute("SELECT name FROM crates ORDER BY name")]
        con.close()
        raise SystemExit(f"Crate '{crate_name}' nicht gefunden. Vorhanden: {names}")
    crate_id = row[0]
    paths = [r[0] for r in cur.execute(
        """SELECT tl.location FROM crate_tracks ct
           JOIN library l ON l.id=ct.track_id
           JOIN track_locations tl ON l.location=tl.id
           WHERE ct.crate_id=? ORDER BY tl.location""", (crate_id,))]
    con.close()
    return [p for p in paths if p and is_audio(p)]


def out_path_for(src, outdir):
    base = os.path.splitext(os.path.basename(src))[0] + ".stem.mp4"
    return os.path.join(outdir, base) if outdir else \
        os.path.splitext(src)[0] + ".stem.mp4"


def fmt(secs):
    m, s = divmod(int(secs), 60)
    return f"{m}m{s:02d}s"


def main():
    ap = argparse.ArgumentParser()
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--folder", help="Ordner mit Audiodateien")
    g.add_argument("--crate", help="Name einer Mixxx-Plattenkiste")
    ap.add_argument("--outdir", help="Zielordner (Default: neben Originaldatei)")
    ap.add_argument("--db", default=DEFAULT_DB, help="Pfad zu mixxxdb.sqlite")
    ap.add_argument("--recursive", action="store_true", help="Unterordner einbeziehen")
    ap.add_argument("--force", action="store_true", help="auch bereits konvertierte neu machen")
    ap.add_argument("--dry-run", action="store_true", help="nur anzeigen, nichts tun")
    args = ap.parse_args()

    if args.outdir:
        os.makedirs(args.outdir, exist_ok=True)

    if args.folder:
        sources = sources_from_folder(args.folder, args.recursive)
        label = f"Ordner {args.folder}"
    else:
        sources = sources_from_crate(args.db, args.crate)
        label = f"Kiste {args.crate}"

    # missing files (crate can reference moved/deleted tracks)
    missing = [s for s in sources if not os.path.exists(s)]
    sources = [s for s in sources if os.path.exists(s)]

    todo, skip = [], []
    for s in sources:
        outp = out_path_for(s, args.outdir)
        if os.path.exists(outp) and not args.force:
            skip.append(s)
        else:
            todo.append((s, outp))

    print(f"=== Batch-Stem-Konvertierung: {label} ===")
    print(f"  gefunden: {len(sources)} | zu konvertieren: {len(todo)} | "
          f"schon vorhanden (skip): {len(skip)} | Datei fehlt: {len(missing)}")
    if missing:
        for m in missing[:10]:
            print(f"    fehlt: {m}")
    if args.dry_run:
        print("\n[DRY-RUN] Wuerde konvertieren:")
        for s, o in todo:
            print(f"  {os.path.basename(s)}  ->  {o}")
        return

    ok, fail = 0, 0
    t0 = time.perf_counter()
    for i, (s, outp) in enumerate(todo, 1):
        print(f"\n----- [{i}/{len(todo)}] {os.path.basename(s)} -----")
        ts = time.perf_counter()
        try:
            song2stem.convert(s, outp)
            ok += 1
            print(f"  OK ({fmt(time.perf_counter() - ts)}) -> {outp}")
        except Exception:
            fail += 1
            print(f"  FEHLER bei {s}:")
            traceback.print_exc()
        done = i
        elapsed = time.perf_counter() - t0
        eta = elapsed / done * (len(todo) - done)
        print(f"  Fortschritt: {done}/{len(todo)} | verstrichen {fmt(elapsed)} "
              f"| ETA ~{fmt(eta)}")

    print(f"\n=== FERTIG === konvertiert: {ok} | Fehler: {fail} | "
          f"uebersprungen: {len(skip)} | Gesamtzeit {fmt(time.perf_counter() - t0)}")


if __name__ == "__main__":
    main()
