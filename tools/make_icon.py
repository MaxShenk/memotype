"""Draw the MemoType app icon."""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


def main() -> None:
    root = Path(__file__).resolve().parents[1]
    out = root / "assets" / "icon.ico"
    out.parent.mkdir(parents=True, exist_ok=True)
    size = 256
    image = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((12, 12, 244, 244), radius=56, fill=(37, 99, 235, 255))
    font = None
    for name in ("segoeuib.ttf", "segoeui.ttf", "arialbd.ttf", "arial.ttf"):
        try:
            font = ImageFont.truetype(name, 148)
            break
        except OSError:
            continue
    if font is None:
        font = ImageFont.load_default()
    draw.text((size / 2, size / 2 - 8), "M", fill="white", font=font, anchor="mm")
    image.save(out, sizes=[(256, 256), (64, 64), (48, 48), (32, 32), (16, 16)])
    print(out)


if __name__ == "__main__":
    main()
