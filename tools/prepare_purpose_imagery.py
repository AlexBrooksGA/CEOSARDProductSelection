"""Prepare the optical/generated-depth handoff. Requires Pillow and numpy.

Both inputs must have identical dimensions and framing. This script only
resamples, smooths the depth values and applies the same phone crop to both.
Run from any directory; outputs are relative to this repository.
"""

from pathlib import Path
import argparse
import json
import shutil
import numpy as np
from PIL import Image, ImageCms

ROOT = Path(__file__).resolve().parents[1]


def gaussian_smooth(values, sigma=4):
    """Separable float32 Gaussian; preserve precision before 16-bit export."""
    radius = int(4 * sigma)
    axis = np.arange(-radius, radius + 1, dtype=np.float32)
    weights = np.exp(-0.5 * (axis / sigma) ** 2)
    weights /= weights.sum()
    h, w = values.shape
    padded = np.pad(values, ((0, 0), (radius, radius)), mode="reflect")
    horizontal = np.zeros_like(values)
    for i, weight in enumerate(weights):
        horizontal += weight * padded[:, i:i + w]
    padded = np.pad(horizontal, ((radius, radius), (0, 0)), mode="reflect")
    vertical = np.zeros_like(values)
    for i, weight in enumerate(weights):
        vertical += weight * padded[i:i + h, :]
    return vertical


def save_depth(values, path):
    Image.fromarray(np.rint(np.clip(values, 0, 1) * 65535).astype(np.uint16)).save(path)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("optical", type=Path)
    parser.add_argument("depth", type=Path)
    args = parser.parse_args()
    optical_native = Image.open(args.optical).convert("RGB")
    depth_native = Image.open(args.depth).convert("L")
    if optical_native.size != depth_native.size:
        raise ValueError("Optical and depth input dimensions must match.")
    dest = ROOT / "assets/purpose-imagery"
    dest.mkdir(parents=True, exist_ok=True)
    names = ["optical.png", "depth.png", "optical-portrait.png", "depth-portrait.png",
             "optical-native.png", "depth-native.png", "manifest.json"]
    if any((dest / name).exists() for name in names):
        raise FileExistsError("Preserve existing imagery: choose a new output folder first.")

    target = (3840, 2160)
    srgb = ImageCms.ImageCmsProfile(ImageCms.createProfile("sRGB")).tobytes()
    optical = optical_native.resize(target, Image.Resampling.LANCZOS)
    # The generated map is 8-bit; float resampling/smoothing avoids extra
    # quantisation, but 16-bit storage does not imply measured 16-bit accuracy.
    values = np.asarray(depth_native, dtype=np.float32) / 255
    resized = np.asarray(Image.fromarray(values).resize(target, Image.Resampling.BICUBIC))
    smoothed = gaussian_smooth(resized)
    span = float(np.ptp(smoothed))
    if span < 1e-6:
        raise ValueError("Depth input has no usable range.")
    normalized = np.clip((smoothed - smoothed.min()) / span, 0, 1)

    shutil.copy2(args.optical, dest / "optical-native.png")
    shutil.copy2(args.depth, dest / "depth-native.png")
    optical.save(dest / "optical.png", icc_profile=srgb)
    save_depth(normalized, dest / "depth.png")

    crop_width = round(target[1] * 9 / 16)
    left = round(target[0] * 0.65 - crop_width / 2)
    box = (left, 0, left + crop_width, target[1])
    optical.crop(box).resize((1440, 2560), Image.Resampling.LANCZOS).save(
        dest / "optical-portrait.png", icc_profile=srgb
    )
    portrait = np.asarray(Image.fromarray(normalized).crop(box).resize(
        (1440, 2560), Image.Resampling.BICUBIC
    ))
    save_depth(portrait, dest / "depth-portrait.png")
    preview = Image.fromarray(np.rint(normalized * 255).astype(np.uint8))
    preview.thumbnail((1280, 720))
    (ROOT / "tmp").mkdir(exist_ok=True)
    preview.save(ROOT / "tmp/purpose-depth-preview.png")

    metadata = {
        "created": "2026-10-09", "tool": "OpenAI built-in image_gen",
        "native_dimensions": list(optical_native.size),
        "landscape_dimensions": list(target), "upscaled": True,
        "portrait_dimensions": [1440, 2560], "portrait_crop_box": list(box),
        "depth_method": "image-guided generative relative height map; artistic estimate",
        "depth_convention": "white nearer (higher), black farther (lower)",
        "depth_storage_bits": 16, "depth_source_bits": 8,
        "depth_blur_sigma_px": 4, "depth_range": [0, 65535],
        "registration": "same source dimensions/framing and shared resize/crop; local generative deviations possible",
        "real_observations": False,
    }
    (dest / "manifest.json").write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(metadata, indent=2))


if __name__ == "__main__":
    main()
