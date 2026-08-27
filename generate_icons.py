from PIL import Image

def generate(src, dest, size, has_bg=True):
    try:
        img = Image.open(src).convert("RGBA")
        img = img.resize(size, Image.Resampling.LANCZOS)
        if has_bg:
            bg = Image.new("RGBA", size, (0, 0, 0, 255))
            bg.paste(img, (0, 0), img)
            bg.convert("RGB").save(dest)
        else:
            img.save(dest)
        print(f"Generated {dest}")
    except Exception as e:
        print(f"Failed {dest}: {e}")

src = "public/logo-mark-dark.png"

# iOS uses apple-touch-icon.png (usually 180x180, we'll just keep the existing size if possible, or 180x180)
# The existing one is probably 180x180
try:
    with Image.open("public/apple-touch-icon.png") as f:
        apple_size = f.size
except:
    apple_size = (180, 180)
    
generate(src, "public/apple-touch-icon.png", apple_size, True)

# favicons
generate(src, "public/favicon-16.png", (16, 16), False)
generate(src, "public/favicon-32.png", (32, 32), False)

# maskables (Android recommends full bleed, logo-mark-dark might be padded. We'll just generate them with black bg)
generate(src, "public/icon-maskable-192.png", (192, 192), True)
generate(src, "public/icon-maskable-512.png", (512, 512), True)

# standard pwa icons
generate(src, "public/icon-192.png", (192, 192), False)
generate(src, "public/icon-512.png", (512, 512), False)

# app/icon.png
try:
    generate(src, "app/icon.png", (512, 512), True)
except:
    pass

