# Hero poster

`public/hero-poster.avif` and `public/hero-poster.jpg` are what the hero shows when the WebGL night drive
can't run (the `hero--flat` state). They're a 2560x1440 still of the same drive, rendered in Blender (Cycles).

To re-render, from the repo root after `npm ci`:

```sh
python3 -m venv .venv && .venv/bin/pip install fonttools brotli pillow numpy
mkdir -p out
.venv/bin/python tools/hero-poster/sign.py node_modules/@fontsource-variable/overpass/files/overpass-latin-wght-normal.woff2 out
/Applications/Blender.app/Contents/MacOS/Blender -b --python tools/hero-poster/render.py -- "$PWD/out" 512
.venv/bin/python tools/hero-poster/post.py out/hero-raw.png public
```

- `sign.py` draws the gantry sign face (the same tax sign as the live hero's first gantry).
- `render.py` builds the scene and renders it. It uses the Metal GPU when there is one, else the CPU.
  A fourth argument scales the resolution, so `... 48 40` gives a quick 40% draft.
- `post.py` adds the lens bloom, vignette and film grain, and writes the AVIF (under 250 kB) and
  JPEG (under 350 kB), lowering quality until each fits.

Delete `out/` and `.venv/` afterwards.
