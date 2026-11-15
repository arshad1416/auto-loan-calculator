"""Draws the sign face for the Blender social card."""
import sys
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from PIL import Image, ImageDraw, ImageFont

src, out_dir = sys.argv[1], sys.argv[2]
font = TTFont(src)
font.flavor = None
instantiateVariableFont(font, {"wght": 800}, inplace=True)
ttf = f"{out_dir}/overpass-800.ttf"
font.save(ttf)

W, H = 2400, 1000
GREEN, WHITE, YELLOW, INK = (0, 100, 60), (243, 241, 231), (255, 200, 31), (17, 18, 16)
im = Image.new("RGB", (W, H), GREEN)
d = ImageDraw.Draw(im)
d.rounded_rectangle((26, 26, W - 26, H - 26), radius=60, outline=WHITE, width=22)
big = ImageFont.truetype(ttf, 250)
d.text((130, 250), "The real payment,", font=big, fill=WHITE)
d.text((130, 520), "down to the cent.", font=big, fill=WHITE)
small = ImageFont.truetype(ttf, 78)
label = "CANADIAN AUTO LOAN CALCULATOR"
w = d.textlength(label, font=small)
d.rounded_rectangle((130, 90, 130 + w + 80, 210), radius=18, fill=YELLOW)
d.rounded_rectangle((140, 100, 120 + w + 80, 200), radius=12, outline=INK, width=7)
d.text((170, 113), label, font=small, fill=INK)
d.text((W - 130, 880), "SHIFTLOGIC HQ", font=small, fill=WHITE, anchor="rs")
im.save(f"{out_dir}/sign.png")
print("sign ok")
