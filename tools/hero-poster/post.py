"""Finishes the raw Blender render like a photograph: restrained bloom, a soft vignette and
film grain, then writes the web files within their size budgets.

    python tools/hero-poster/post.py <work_dir>/hero-raw.png public
"""
import io
import sys

import numpy as np
from PIL import Image

src, out_dir = sys.argv[1], sys.argv[2]
AVIF_BUDGET, JPG_BUDGET = 250_000, 350_000

arr = np.asarray(Image.open(src))
img = arr[..., :3].astype(np.float32) / (65535.0 if arr.dtype == np.uint16 else 255.0)
h, w, _ = img.shape


def _box(a, r, axis):
    """Running-mean box filter of half-width r along an axis, edges clamped."""
    pad = [(0, 0)] * a.ndim
    pad[axis] = (r + 1, r)
    c = np.cumsum(np.pad(a, pad, mode='edge'), axis=axis, dtype=np.float64)
    n = a.shape[axis]
    hi = np.take(c, np.arange(2 * r + 1, 2 * r + 1 + n), axis=axis)
    lo = np.take(c, np.arange(0, n), axis=axis)
    return ((hi - lo) / (2 * r + 1)).astype(np.float32)


def blur(a, sigma):
    """Three box passes per axis: close to a Gaussian of this sigma."""
    r = max(1, int(round(np.sqrt(4 * sigma * sigma + 1) / 2)))
    for axis in (0, 1):
        for _ in range(3):
            a = _box(a, r, axis)
    return a


# Bloom only from the hot spots (lamps, reflectors, the sign), in two widths.
lum = img @ np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)
hot = img * np.clip((lum[..., None] - 0.55) / 0.45, 0, 1)
img = img + blur(hot, w * 0.004) * 0.35 + blur(hot, w * 0.018) * 0.22

# Vignette: a lens wide open loses a little at the corners.
yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
r = np.hypot((xx - w * 0.55) / (w * 0.62), (yy - h * 0.5) / (h * 0.75))
img *= (1 - 0.28 * np.clip(r - 0.35, 0, 1) ** 1.6)[..., None]

# Grain: monochrome, a little stronger in the mid-tones, slightly soft like film.
rng = np.random.default_rng(1416)
g = rng.normal(0, 1, (h, w)).astype(np.float32)
g = 0.5 * g + 0.125 * (np.roll(g, 1, 0) + np.roll(g, -1, 0) + np.roll(g, 1, 1) + np.roll(g, -1, 1))
g /= g.std()
lum = np.clip(img @ np.array([0.2126, 0.7152, 0.0722], dtype=np.float32), 0, 1)
img += (g * (0.010 + 0.035 * np.sqrt(lum) * (1 - lum)))[..., None]

out = Image.fromarray((np.clip(img, 0, 1) * 255 + 0.5).astype(np.uint8), 'RGB')


def fit(fmt, budget, qualities, **kw):
    for q in qualities:
        buf = io.BytesIO()
        out.save(buf, fmt, quality=q, **kw)
        if buf.tell() <= budget:
            return q, buf.getvalue()
    raise SystemExit(f'{fmt} over budget even at q={qualities[-1]}')


q_jpg, jpg = fit('JPEG', JPG_BUDGET, range(88, 40, -2), optimize=True, progressive=True, subsampling='4:2:0')
q_avif, avif = fit('AVIF', AVIF_BUDGET, range(80, 20, -4), speed=4)
open(f'{out_dir}/hero-poster.jpg', 'wb').write(jpg)
open(f'{out_dir}/hero-poster.avif', 'wb').write(avif)
print(f'hero-poster.jpg q{q_jpg} {len(jpg):,} B; hero-poster.avif q{q_avif} {len(avif):,} B')
