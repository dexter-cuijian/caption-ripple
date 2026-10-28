"""Render the chosen audio-to-bilingual-subtitles mark at Chrome PNG sizes."""

from pathlib import Path
import struct
import zlib

ROOT = Path(__file__).resolve().parent.parent / "extension" / "icons"
BLUE = (20, 104, 239, 255)
WHITE = (255, 255, 255, 255)
MINT = (85, 230, 174, 255)
TRANSPARENT = (0, 0, 0, 0)


def rounded_rect(x, y, left, top, right, bottom, radius):
    nearest_x = min(max(x, left + radius), right - radius)
    nearest_y = min(max(y, top + radius), bottom - radius)
    return (x - nearest_x) ** 2 + (y - nearest_y) ** 2 <= radius**2


def stroke(x, y, a, b, width):
    vx, vy = b[0] - a[0], b[1] - a[1]
    projection = min(1, max(0, ((x - a[0]) * vx + (y - a[1]) * vy) / (vx * vx + vy * vy)))
    return (x - a[0] - projection * vx) ** 2 + (y - a[1] - projection * vy) ** 2 <= (width / 2) ** 2


def color_at(x, y):
    if not rounded_rect(x, y, 0, 0, 128, 128, 28):
        return TRANSPARENT
    color = BLUE
    waveform_and_arrow = (
        ((18, 59), (18, 69), 7), ((29, 50), (29, 78), 7),
        ((40, 43), (40, 85), 7), ((51, 52), (51, 76), 7),
        ((61, 64), (76, 64), 6), ((70, 57), (77, 64), 6),
        ((77, 64), (70, 71), 6),
    )
    if any(stroke(x, y, a, b, width) for a, b, width in waveform_and_arrow):
        color = WHITE
    if rounded_rect(x, y, 86, 50, 114, 59, 4.5):
        color = WHITE
    if rounded_rect(x, y, 86, 69, 114, 78, 4.5):
        color = MINT
    return color


def render(size):
    samples = 4
    scanlines = []
    for row in range(size):
        line = bytearray([0])
        for col in range(size):
            channels = [0, 0, 0, 0]
            for sy in range(samples):
                for sx in range(samples):
                    x = (col + (sx + 0.5) / samples) * 128 / size
                    y = (row + (sy + 0.5) / samples) * 128 / size
                    rgba = color_at(x, y)
                    for index in range(4):
                        channels[index] += rgba[index]
            line.extend(round(value / (samples * samples)) for value in channels)
        scanlines.append(line)
    data = b"".join(scanlines)

    def chunk(name, content):
        return struct.pack(">I", len(content)) + name + content + struct.pack(">I", zlib.crc32(name + content))

    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(data, 9))
        + chunk(b"IEND", b"")
    )


if __name__ == "__main__":
    for size in (16, 32, 48, 128):
        (ROOT / f"icon-{size}.png").write_bytes(render(size))
