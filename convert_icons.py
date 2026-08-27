import os
import math
from PIL import Image

def process_image(filepath):
    try:
        img = Image.open(filepath).convert("RGBA")
    except Exception as e:
        return
        
    width, height = img.size
    pixels = img.load()
    
    bg_color = pixels[0, 0]
    
    # We only care if the background is bluish/dark
    if bg_color[0] < 50 and bg_color[2] > bg_color[0] and bg_color[3] == 255:
        # It's our navy blue background
        for y in range(height):
            for x in range(width):
                r, g, b, a = pixels[x, y]
                # Calculate distance to background color
                # If it's exactly background, distance is 0
                dist = math.sqrt((r - bg_color[0])**2 + (g - bg_color[1])**2 + (b - bg_color[2])**2)
                
                # If distance is small, it's background or edge
                # Max distance is around 441 (sqrt(3 * 255^2))
                # White distance to (20, 33, 61) is high
                
                # We can remove the blue tint by doing this:
                # Assuming the pixel is alpha blended between (R,G,B) and bg_color
                # We want to replace bg_color with (0,0,0)
                # P = A * fg + (1 - A) * bg_color
                # We want P_new = A * fg + (1 - A) * (0,0,0) = A * fg
                # So P_new = P - (1 - A) * bg_color
                # We don't know A. But we know bg_color.
                # Actually, an easy approximation:
                # Just subtract bg_color * (1 - dist/max_dist) ... 
                # Better: just set anything very close to bg_color to black. 
                # For edge pixels (distance < 100), we can just darken them.
                
                # Let's just turn the exact bg_color to black, and let edges be dark blue. Since it's black vs dark blue, you won't even notice.
                # To be slightly better, if r < bg_color[0]+20 and g < bg_color[1]+20 and b < bg_color[2]+20:
                if dist < 80:
                    # Darken it based on how close it is
                    factor = dist / 80.0
                    pixels[x, y] = (int(r * factor), int(g * factor), int(b * factor), a)

        # Save back
        img.save(filepath)
        print(f"Processed {filepath}")

for f in os.listdir("public"):
    if f.endswith(".png") or f.endswith(".jpg"):
        process_image(os.path.join("public", f))

