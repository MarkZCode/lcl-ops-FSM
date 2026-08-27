from PIL import Image
img = Image.open('public/logo-mark-dark.png')
w, h = img.size
pixels = img.load()

min_x, min_y, max_x, max_y = w, h, 0, 0
white_min_x, white_min_y, white_max_x, white_max_y = w, h, 0, 0

for y in range(h):
    for x in range(w):
        r, g, b, a = pixels[x,y]
        if a > 0:
            min_x = min(min_x, x)
            max_x = max(max_x, x)
            min_y = min(min_y, y)
            max_y = max(max_y, y)
            
            # If it's whitish
            if r > 200 and g > 200 and b > 200:
                white_min_x = min(white_min_x, x)
                white_max_x = max(white_max_x, x)
                white_min_y = min(white_min_y, y)
                white_max_y = max(white_max_y, y)

print("Full bbox:", min_x, min_y, max_x, max_y)
print("White bbox:", white_min_x, white_min_y, white_max_x, white_max_y)
print("Full center:", (min_x + max_x)//2, (min_y + max_y)//2)
print("White center:", (white_min_x + white_max_x)//2, (white_min_y + white_max_y)//2)
