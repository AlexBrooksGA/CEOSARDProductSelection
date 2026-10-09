"""Build the purpose-entry background images from the masters in assets/purpose-imagery/.

Development-time only (Pillow + NumPy):
    python tools/build_purpose_imagery.py [masters_dir] [output_dir]

Inputs (see assets/purpose-imagery/SOURCE.txt and manifest.json):
    optical.png            3840 x 2160 sRGB (AI-generated, upscaled from 1672 x 941)
    depth.png              3840 x 2160 16-bit greyscale relative height, white = near
    optical-portrait.png   1440 x 2560 centre-right crop
    manifest.json          portrait_crop_box on the 3840 x 2160 frame

Outputs (static/images/purpose-journey/):
    {look}-{1280,1920,2560}.webp     landscape, look = optical | radar | thermal
    {look}-portrait-{720,1080}.webp  portrait crop for phones
    {look}-coarse.png                160 x 90, shown pixelated for "broad patterns"
    depth.webp                       1024 x 576, smoothed, for the WebGL displacement

The radar and thermal looks are *illustrative stylisations derived from the optical
image* (no radar or thermal data exists for this fictional scene):
    radar   greyscale; water near black (from the depth map), brightness from surface
            texture, vegetation and slopes, multiplicative speckle
    thermal false colour; water cool, vegetation cooler, bare ground and fields warm,
            spatially smoothed
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
MASTERS = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / 'assets' / 'purpose-imagery'
OUT = Path(sys.argv[2]) if len(sys.argv) > 2 else ROOT / 'static' / 'images' / 'purpose-journey'
WIDTHS = (1280, 1920, 2560)
PORTRAIT_WIDTHS = (720, 1080)
QUALITY = 74
RNG = np.random.default_rng(20261009)  # fixed seed: rebuilds are byte-stable


def _box(array: np.ndarray, r: int, axis: int) -> np.ndarray:
    if r < 1:
        return array
    pad = [(0, 0), (0, 0)]
    pad[axis] = (r + 1, r)
    padded = np.pad(array, pad, mode='edge')
    c = np.cumsum(padded, axis=axis, dtype=np.float64)
    n = array.shape[axis]
    hi = np.take(c, np.arange(2 * r + 1, 2 * r + 1 + n), axis=axis)
    lo = np.take(c, np.arange(0, n), axis=axis)
    return ((hi - lo) / (2 * r + 1)).astype(np.float32)


def blur(array: np.ndarray, sigma: float) -> np.ndarray:
    """Approximate Gaussian blur (three box passes per axis), edge-padded."""
    if sigma <= 0:
        return array.astype(np.float32)
    # Box radius whose three passes match the requested standard deviation.
    r = max(0, int(round((np.sqrt(4 * sigma * sigma + 1) - 1) / 2)))
    if r == 0:
        return array.astype(np.float32)
    out = array.astype(np.float32)
    for _ in range(3):
        out = _box(_box(out, r, 0), r, 1)
    return out


def normalise(array: np.ndarray, lo: float = 1, hi: float = 99) -> np.ndarray:
    a, b = np.percentile(array, [lo, hi])
    return np.clip((array - a) / max(b - a, 1e-6), 0, 1).astype(np.float32)


def smoothstep(edge0: float, edge1: float, x: np.ndarray) -> np.ndarray:
    t = np.clip((x - edge0) / (edge1 - edge0), 0, 1)
    return t * t * (3 - 2 * t)


def to_image(rgb: np.ndarray) -> Image.Image:
    return Image.fromarray(np.clip(rgb * 255 + 0.5, 0, 255).astype(np.uint8))


def radar_look(optical: np.ndarray, depth: np.ndarray) -> np.ndarray:
    r, g, b = optical[..., 0], optical[..., 1], optical[..., 2]
    lum = 0.299 * r + 0.587 * g + 0.114 * b
    patches = normalise(blur(lum, 1.5), 2, 98)  # field and flat tones
    roughness = blur(normalise(np.abs(lum - blur(lum, 2.5)), 2, 98), 1.2)
    canopy = smoothstep(0.5, 0.78, depth) * normalise(g - (r + b) / 2, 5, 99)  # raised vegetation
    gy, gx = np.gradient(blur(depth, 6))
    slope = normalise(np.hypot(gx, gy), 5, 99.5)
    facing = normalise(-gx - gy, 50, 99.5)  # slopes facing the (illustrative) sensor look bright
    water = 1 - smoothstep(0.05, 0.2, depth)
    sigma = 0.1 + 0.22 * patches + 0.3 * roughness + 0.75 * canopy + 0.8 * slope * facing
    sigma = sigma * (1 - 0.93 * water)
    looks = 6.0
    # Speckle at half resolution: still grainy at screen size, and it compresses far better.
    h, w = sigma.shape
    half = RNG.gamma(looks, 1 / looks, size=(h // 2, w // 2)).astype(np.float32)
    speckle = np.asarray(Image.fromarray(half, mode='F').resize((w, h), Image.BILINEAR), dtype=np.float32)
    value = blur(sigma * speckle, 0.7)
    value = np.clip(value, 0, None) ** 0.7
    value = normalise(value, 0.5, 99.7) * 0.92
    return np.repeat(value[..., None], 3, axis=2)


THERMAL_STOPS = [
    (0.00, (0x12, 0x07, 0x2a)),
    (0.25, (0x38, 0x0d, 0x5c)),
    (0.48, (0x7c, 0x1d, 0x68)),
    (0.68, (0xb3, 0x3c, 0x4a)),
    (0.85, (0xd8, 0x76, 0x30)),
    (1.00, (0xec, 0xc6, 0x86)),
]


def thermal_look(optical: np.ndarray, depth: np.ndarray) -> np.ndarray:
    r, g, b = optical[..., 0], optical[..., 1], optical[..., 2]
    lum = 0.299 * r + 0.587 * g + 0.114 * b
    vegetation = normalise(g - (r + b) / 2, 5, 99)
    bare = normalise(lum * 1.25 - 0.55 * vegetation, 2, 99.5)
    water = 1 - smoothstep(0.06, 0.18, depth)
    temp = 0.18 + 0.62 * bare + 0.12 * normalise(depth, 2, 99.5) - 0.18 * vegetation
    temp = blur(temp, 5) * 0.8 + blur(temp, 1.2) * 0.2  # thermal pixels are coarser
    temp = temp * (1 - water) + (0.06 + 0.05 * blur(lum, 4)) * water
    temp = normalise(temp, 0.5, 99.5)
    xs = [s[0] for s in THERMAL_STOPS]
    colours = np.array([s[1] for s in THERMAL_STOPS], dtype=np.float32) / 255
    out = np.stack([np.interp(temp, xs, colours[:, c]) for c in range(3)], axis=2)
    return (out * 0.9).astype(np.float32)  # held back so text over it stays readable


def save_webp(image: Image.Image, path: Path) -> None:
    image.save(path, 'WEBP', quality=QUALITY, method=6)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    manifest = json.loads((MASTERS / 'manifest.json').read_text(encoding='utf-8'))
    optical_img = Image.open(MASTERS / 'optical.png').convert('RGB')
    depth_img = Image.open(MASTERS / 'depth.png')
    if optical_img.size != depth_img.size:
        raise SystemExit('optical.png and depth.png must have the same size')
    # Work at 2560 x 1440: the masters are upscaled from 1672 x 941, so nothing is lost.
    work = (2560, 1440)
    optical = np.asarray(optical_img.resize(work, Image.LANCZOS), dtype=np.float32) / 255
    depth16 = np.asarray(depth_img, dtype=np.float32)
    depth_full = depth16 / (65535 if depth16.max() > 255 else 255)
    depth = np.asarray(Image.fromarray(depth_full, mode='F').resize(work, Image.BILINEAR), dtype=np.float32)
    depth = normalise(blur(depth, 2), 0.5, 99.5)

    looks = {
        'optical': optical,
        'radar': radar_look(optical, depth),
        'thermal': thermal_look(optical, depth),
    }
    x0, y0, x1, y1 = manifest['portrait_crop_box']
    sx, sy = work[0] / optical_img.width, work[1] / optical_img.height
    crop = (round(x0 * sx), round(y0 * sy), round(x1 * sx), round(y1 * sy))
    report = []
    for name, array in looks.items():
        image = to_image(array)
        for width in WIDTHS:
            path = OUT / f'{name}-{width}.webp'
            save_webp(image.resize((width, round(width * 9 / 16)), Image.LANCZOS), path)
            report.append(path)
        portrait = image.crop(crop)
        if name == 'optical':
            portrait = Image.open(MASTERS / 'optical-portrait.png').convert('RGB')
        for width in PORTRAIT_WIDTHS:
            path = OUT / f'{name}-portrait-{width}.webp'
            save_webp(portrait.resize((width, round(width * 16 / 9)), Image.LANCZOS), path)
            report.append(path)
        coarse = OUT / f'{name}-coarse.png'
        image.resize((160, 90), Image.BOX).save(coarse, optimize=True)
        report.append(coarse)

    # Displacement texture: heavily smoothed so parallax bends the scene gently with
    # no tearing at channel edges or shimmer from tree texture.
    small = np.asarray(Image.fromarray(depth, mode='F').resize((1024, 576), Image.BILINEAR), dtype=np.float32)
    small = normalise(blur(small, 5), 0.5, 99.5)
    depth_path = OUT / 'depth.webp'
    Image.fromarray((small * 255 + 0.5).astype(np.uint8), mode='L').convert('RGB').save(depth_path, 'WEBP', quality=88, method=6)
    report.append(depth_path)

    for path in report:
        print(f'{path.relative_to(OUT.parent.parent.parent) if OUT.is_relative_to(ROOT) else path.name}  {path.stat().st_size / 1024:.0f} KB')


if __name__ == '__main__':
    main()
