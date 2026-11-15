"""Draws the gantry sign face for the hero poster (same sign as the live hero's first gantry)."""
import sys
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from PIL import Image, ImageDraw, ImageFont

src, out_dir = sys.argv[1], sys.argv[2]


def instance(weight):
    font = TTFont(src)
    font.flavor = None
    instantiateVariableFont(font, {"wght": weight}, inplace=True)
    path = f"{out_dir}/overpass-{weight}.ttf"
    font.save(path)
    return path


bold, black = instance(700), instance(800)

GREEN, WHITE = (0, 100, 60), (243, 241, 231)
W, H = 2650, 1040  # 10.6 m x 4.15 m at 250 px/m
im = Image.new("RGB", (W, H), GREEN)
d = ImageDraw.Draw(im)
d.rounded_rectangle((30, 30, W - 30, H - 30), radius=70, outline=WHITE, width=24)

rows = [("Ontario", "HST 13%"), ("Québec", "GST + QST 14.975%"), ("Alberta", "GST 5%")]
name, rate = ImageFont.truetype(black, 210), ImageFont.truetype(bold, 170)
for i, (place, tax) in enumerate(rows):
    y = 200 + i * 290
    d.text((150, y), place, font=name, fill=WHITE, anchor="ls")
    d.text((W - 150, y), tax, font=rate, fill=WHITE, anchor="rs")
    if i < len(rows) - 1:
        d.line((150, y + 75, W - 150, y + 75), fill=WHITE, width=8)
im.save(f"{out_dir}/gantry-sign.png")

print("sign ok")
