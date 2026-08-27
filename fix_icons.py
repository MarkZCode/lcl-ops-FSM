from PIL import Image
import colorsys

def adjust_color(r, g, b):
    h, s, v = colorsys.rgb_to_hsv(r/255.0, g/255.0, b/255.0)
    if 0.16 < h < 0.5 and s > 0.1:
        # WhatsApp green hue is ~142 degrees -> 0.394
        h = 142 / 360.0
        # Boost brightness
        v = min(1.0, v * (211/129.0))
        s = min(1.0, s * 1.1)
        nr, ng, nb = colorsys.hsv_to_rgb(h, s, v)
        return int(nr*255), int(ng*255), int(nb*255)
    return r, g, b

def process_logo(src):
    img = Image.open(src).convert("RGBA")
    pixels = img.load()
    w, h = img.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = pixels[x,y]
            if a > 0:
                nr, ng, nb = adjust_color(r, g, b)
                pixels[x,y] = (nr, ng, nb, a)
    return img

def generate(logo_img, dest, size, has_bg=True, padding_scale=0.75):
    try:
        # calculate inner size
        inner_w = int(size[0] * padding_scale)
        inner_h = int(size[1] * padding_scale)
        
        # aspect ratio preserve
        aspect = logo_img.width / logo_img.height
        if aspect > 1:
            final_w = inner_w
            final_h = int(inner_w / aspect)
        else:
            final_h = inner_h
            final_w = int(inner_h * aspect)
            
        resized_logo = logo_img.resize((final_w, final_h), Image.Resampling.LANCZOS)
        
        offset_x = (size[0] - final_w) // 2
        offset_y = (size[1] - final_h) // 2
        
        if has_bg:
            bg = Image.new("RGBA", size, (0, 0, 0, 255))
            bg.paste(resized_logo, (offset_x, offset_y), resized_logo)
            bg.convert("RGB").save(dest)
        else:
            # transparent background
            bg = Image.new("RGBA", size, (0, 0, 0, 0))
            bg.paste(resized_logo, (offset_x, offset_y), resized_logo)
            bg.save(dest)
        print(f"Generated {dest}")
    except Exception as e:
        print(f"Failed {dest}: {e}")

logo = process_logo("public/logo-mark-dark.png")
# Save a copy of the fixed logo just in case
logo.save("public/logo-mark-dark-whatsapp.png")

try:
    with Image.open("public/apple-touch-icon.png") as f:
        apple_size = f.size
except:
    apple_size = (180, 180)

# apple-touch-icon needs background and padding
generate(logo, "public/apple-touch-icon.png", apple_size, True, 0.7)

# favicons (no bg, full bleed or slight pad)
generate(logo, "public/favicon-16.png", (16, 16), False, 0.9)
generate(logo, "public/favicon-32.png", (32, 32), False, 0.9)

# maskables need background and MUST have generous padding (safe zone is 40%)
generate(logo, "public/icon-maskable-192.png", (192, 192), True, 0.6)
generate(logo, "public/icon-maskable-512.png", (512, 512), True, 0.6)

# standard pwa icons (transparent bg, full bleed or slight pad)
generate(logo, "public/icon-192.png", (192, 192), False, 0.85)
generate(logo, "public/icon-512.png", (512, 512), False, 0.85)

try:
    generate(logo, "app/icon.png", (512, 512), True, 0.7)
except:
    pass
