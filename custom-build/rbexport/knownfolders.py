"""Harvest ANLZ folder numbers that a player or rekordbox already assigned.

The firmware derives the ANLZ folder from the track by an unknown function and
ignores the analyze_path we write. Once a player has loaded a track it leaves a
stub at the derived folder, and rekordbox exports of the same file use the very
same folder. Both can be harvested and reused for our own export.

known_folders(roots) -> {device_path: h}
  roots are directories that contain PIONEER/USBANLZ (a stick, or an archive).
  Every ANLZ0000.DAT below is read for its PPTH path; the folder name gives h.
  Only folders that satisfy the firmware's own P == pext(h) rule are accepted,
  which automatically drops folders written by earlier versions of this tool.
"""
import glob
import os
import struct


def _ppth(path):
    raw = open(path, "rb").read()
    i = raw.find(b"PPTH")
    if i < 0:
        return None
    ln = struct.unpack_from(">I", raw, i + 12)[0]
    return raw[i + 16:i + 16 + ln - 2].decode("utf-16-be", "replace")


def known_folders(roots):
    from .export_usb import H_LIMIT, pext
    found = {}
    for root in roots:
        # A stick has PIONEER/USBANLZ; an archived copy may start at USBANLZ.
        patterns = [os.path.join(root, "PIONEER", "USBANLZ", "P???", "????????", "ANLZ0000.DAT"),
                    os.path.join(root, "USBANLZ", "P???", "????????", "ANLZ0000.DAT")]
        for dat in [d for pat in patterns for d in glob.glob(pat)]:
            parts = dat.replace(os.sep, "/").split("/")
            try:
                p, h = int(parts[-3][1:], 16), int(parts[-2], 16)
            except ValueError:
                continue
            if h >= H_LIMIT or p != pext(h):
                continue
            device_path = _ppth(dat)
            if device_path:
                found[device_path] = h
    return found
