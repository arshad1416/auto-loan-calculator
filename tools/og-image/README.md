# Share image

`public/og-image.png` is rendered in Blender (Cycles). To rebuild it:

```sh
python3 -m venv .venv && .venv/bin/pip install bpy fonttools brotli pillow
mkdir -p out
.venv/bin/python tools/og-image/sign.py node_modules/@fontsource-variable/overpass/files/overpass-latin-wght-normal.woff2 out
.venv/bin/python tools/og-image/render.py "$PWD/out" 200
cp out/og.png public/og-image.png
```

`sign.py` draws the sign face; `render.py` builds the night-highway scene around it and renders 1200x630.
