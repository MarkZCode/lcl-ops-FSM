from PIL import Image
import colorsys

def adjust_color(r, g, b):
    h, s, v = colorsys.rgb_to_hsv(r/255.0, g/255.0, b/255.0)
    if 0.16 < h < 0.5 and s > 0.1:
        # WhatsApp green hue is ~142 degrees
        h = 142 / 360.0
        # Make it a deep, rich whatsapp green rather than a washed out one
        s = 0.85
        # Don't boost brightness too much. v=0.7 is a solid rich green.
        v = min(0.75, v * 1.2)
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

def generate(logo_img, dest, size, has_bg=True, padding_scale=0.55):
    try:
        inner_w = int(size[0] * padding_scale)
        inner_h = int(size[1] * padding_scale)
        
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
        
        # Shift RIGHT to center the house (compensate for checkmark width)
        offset_x += int(size[0] * 0.05)
        # Shift DOWN slightly
        offset_y += int(size[1] * 0.02)
        
        if has_bg:
            bg = Image.new("RGBA", size, (0, 0, 0, 255))
            bg.paste(resized_logo, (offset_x, offset_y), resized_logo)
            bg.convert("RGB").save(dest)
        else:
            bg = Image.new("RGBA", size, (0, 0, 0, 0))
            bg.paste(resized_logo, (offset_x, offset_y), resized_logo)
            bg.save(dest)
        print(f"Generated {dest}")
    except Exception as e:
        print(f"Failed {dest}: {e}")

logo = process_logo("public/logo-mark-dark.png")

try:
    with Image.open("public/apple-touch-icon.png") as f:
        apple_size = f.size
except:
    apple_size = (180, 180)

generate(logo, "public/apple-touch-icon.png", apple_size, True, 0.55)
generate(logo, "public/favicon-16.png", (16, 16), False, 0.8)
generate(logo, "public/favicon-32.png", (32, 32), False, 0.8)
generate(logo, "public/icon-maskable-192.png", (192, 192), True, 0.5)
generate(logo, "public/icon-maskable-512.png", (512, 512), True, 0.5)
generate(logo, "public/icon-192.png", (192, 192), False, 0.6)
generate(logo, "public/icon-512.png", (512, 512), False, 0.6)
try:
    generate(logo, "app/icon.png", (512, 512), True, 0.55)
except:
    pass

