from PIL import Image
import colorsys

def adjust_color(r, g, b):
    # original greenest pixel was roughly (4, 129, 4)
    # new whatsapp green is (37, 211, 102)
    # We use HSV to adjust
    h, s, v = colorsys.rgb_to_hsv(r/255.0, g/255.0, b/255.0)
    
    # If it's a greenish pixel (hue between 60 deg and 180 deg) and has saturation
    if 0.16 < h < 0.5 and s > 0.1:
        # Set hue to WhatsApp green (142 degrees)
        h = 142 / 360.0
        # Set saturation to WhatsApp green saturation
        s = 0.82
        
        # Scale value. Original max value was ~129/255 = 0.5. 
        # We want to scale it to ~211/255 = 0.83 for the brightest pixels.
        v = min(0.83, v * (0.83 / 0.5))
        
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
        
        # Manually shift down and right a tiny bit to visually center the house
        # since the checkmark extends up and right
        offset_x -= int(size[0] * 0.02)
        offset_y += int(size[1] * 0.02)
        
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

# We MUST use the ORIGINAL logo-mark-dark.png as source, NOT the one we already overwrote.
# Wait, I didn't overwrite logo-mark-dark.png in the first script! Let's check.
# Yes I didn't overwrite logo-mark-dark.png.
logo = process_logo("public/logo-mark-dark.png")

try:
    with Image.open("public/apple-touch-icon.png") as f:
        apple_size = f.size
except:
    apple_size = (180, 180)

# apple-touch-icon (iOS usually prefers a nice comfortable margin)
generate(logo, "public/apple-touch-icon.png", apple_size, True, 0.55)

# favicons 
generate(logo, "public/favicon-16.png", (16, 16), False, 0.8)
generate(logo, "public/favicon-32.png", (32, 32), False, 0.8)

# maskables (Android safe zone is 40% of the center, so we use 0.5 to be safe inside it)
generate(logo, "public/icon-maskable-192.png", (192, 192), True, 0.5)
generate(logo, "public/icon-maskable-512.png", (512, 512), True, 0.5)

# standard pwa icons
generate(logo, "public/icon-192.png", (192, 192), False, 0.6)
generate(logo, "public/icon-512.png", (512, 512), False, 0.6)

try:
    generate(logo, "app/icon.png", (512, 512), True, 0.55)
except:
    pass

