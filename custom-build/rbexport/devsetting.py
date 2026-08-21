"""Write PIONEER/DEVSETTING.DAT.

A small settings file rekordbox puts at the root of the PIONEER folder. The
layout was recovered from a reference export and reproduces it byte for byte:

    u32          length of the string block, always 0x60 (three 32-byte fields)
    char[32]     brand      "PIONEER DJ"
    char[32]     software   "rekordbox"
    char[32]     version    "6.8.6"
    u32          length of the payload
    u8[32]       payload    the actual device settings
    u16          CRC-16/XMODEM over the payload only
    u16          0

Whether a player needs this file is unverified - it is written because it is
cheap and because a real export always has one, not because it is known to
matter.
"""
import struct

BRAND = "PIONEER DJ"
SOFTWARE = "rekordbox"
VERSION = "6.8.6"

# The payload of the reference export. Only the leading marker is understood;
# the rest are per-setting bytes we deliberately leave at their observed values
# rather than inventing our own.
PAYLOAD = bytes([
    0x78, 0x56, 0x34, 0x12,          # marker 0x12345678, little endian
    0x01, 0x00, 0x00, 0x00,
    0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
])


def crc16_xmodem(buf):
    crc = 0
    for byte in buf:
        crc ^= byte << 8
        for _ in range(8):
            crc = ((crc << 1) ^ 0x1021) & 0xFFFF if crc & 0x8000 else (crc << 1) & 0xFFFF
    return crc


def _pad32(text):
    raw = text.encode("ascii")
    if len(raw) > 32:
        raise ValueError("field too long for a 32-byte slot: %r" % text)
    return raw + b"\x00" * (32 - len(raw))


def build(payload=PAYLOAD, brand=BRAND, software=SOFTWARE, version=VERSION):
    out = struct.pack("<I", 0x60)
    out += _pad32(brand) + _pad32(software) + _pad32(version)
    out += struct.pack("<I", len(payload))
    out += payload
    out += struct.pack("<HH", crc16_xmodem(payload), 0)
    return out
