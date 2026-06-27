from PIL import Image, ImageDraw, ImageFont
import os

FONT_PATH = "/tmp/fonts/GoNoto-Bold.ttf"
OUT_BASE = "android/app/src/main/res"
KANJI = "空"

COLOR_TOP = (74, 29, 150)
COLOR_BOT = (124, 58, 237)


def make_gradient(size):
    img = Image.new("RGBA", (size, size))
    for y in range(size):
        t = y / size
        r = int(COLOR_TOP[0] + (COLOR_BOT[0] - COLOR_TOP[0]) * t)
        g = int(COLOR_TOP[1] + (COLOR_BOT[1] - COLOR_TOP[1]) * t)
        b = int(COLOR_TOP[2] + (COLOR_BOT[2] - COLOR_TOP[2]) * t)
        for x in range(size):
            img.putpixel((x, y), (r, g, b, 255))
    return img


def draw_kanji_centered(draw, size, font_size):
    font = ImageFont.truetype(FONT_PATH, font_size)
    bbox = draw.textbbox((0, 0), KANJI, font=font)
    w = bbox[2] - bbox[0]
    h = bbox[3] - bbox[1]
    x = (size - w) / 2 - bbox[0]
    y = (size - h) / 2 - bbox[1]
    draw.text((x, y), KANJI, font=font, fill=(255, 255, 255, 255))


def make_full_icon(size, out_path, font_size):
    img = make_gradient(size)
    draw = ImageDraw.Draw(img)
    draw_kanji_centered(draw, size, font_size)
    img.convert("RGB").save(out_path, "WEBP", quality=95)


def make_round_icon(size, out_path, font_size):
    img = make_gradient(size)
    mask = Image.new("L", (size, size), 0)
    mask_draw = ImageDraw.Draw(mask)
    mask_draw.ellipse([0, 0, size - 1, size - 1], fill=255)
    img.putalpha(mask)
    draw = ImageDraw.Draw(img)
    font = ImageFont.truetype(FONT_PATH, font_size)
    bbox = draw.textbbox((0, 0), KANJI, font=font)
    w = bbox[2] - bbox[0]
    h = bbox[3] - bbox[1]
    x = (size - w) / 2 - bbox[0]
    y = (size - h) / 2 - bbox[1]
    draw.text((x, y), KANJI, font=font, fill=(255, 255, 255, 255))
    img.save(out_path, "WEBP", quality=95, lossless=False)


def make_foreground(size, out_path, font_size):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    draw_kanji_centered(draw, size, font_size)
    img.save(out_path, "WEBP", quality=95)


def make_background(size, out_path):
    img = make_gradient(size)
    img.convert("RGB").save(out_path, "WEBP", quality=95)


def make_monochrome(size, out_path, font_size):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    draw_kanji_centered(draw, size, font_size)
    img.save(out_path, "PNG")


configs = [
    ("mipmap-mdpi",    48,  108, 29,  58),
    ("mipmap-hdpi",    72,  162, 43,  86),
    ("mipmap-xhdpi",   96,  216, 57, 115),
    ("mipmap-xxhdpi",  144, 324, 86, 172),
    ("mipmap-xxxhdpi", 192, 432, 115, 230),
]

for (density, launcher_size, fg_size, launcher_font, fg_font) in configs:
    d = f"{OUT_BASE}/{density}"
    print(f"Generating {density}...")

    make_full_icon(launcher_size, f"{d}/ic_launcher.webp", launcher_font)
    make_round_icon(launcher_size, f"{d}/ic_launcher_round.webp", launcher_font)
    make_foreground(fg_size, f"{d}/ic_launcher_foreground.webp", fg_font)
    make_background(fg_size, f"{d}/ic_launcher_background.webp")
    make_monochrome(launcher_size, f"{d}/ic_launcher_monochrome.png", launcher_font)
    print(f"  Done!")

# Also regenerate the in-app logo (512x512)
print("Generating assets/logo.png...")
make_full_icon(512, "assets/logo.png", 307)
print("  Done!")

print("\nAll icons generated successfully!")
