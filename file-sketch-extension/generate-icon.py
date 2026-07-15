import os
import zlib
import struct
import math

def make_png(width, height, pixels):

    png = b'\x89PNG\r\n\x1a\n'
    

    ihdr = struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0)
    png += struct.pack('>I', 13) + b'IHDR' + ihdr + struct.pack('>I', zlib.crc32(b'IHDR' + ihdr))
    

    raw_data = b''
    for y in range(height):
        raw_data += b'\x00'
        for x in range(width):
            raw_data += bytes(pixels[y * width + x])
            
    compressed = zlib.compress(raw_data)
    png += struct.pack('>I', len(compressed)) + b'IDAT' + compressed + struct.pack('>I', zlib.crc32(b'IDAT' + compressed))
    

    png += struct.pack('>I', 0) + b'IEND' + struct.pack('>I', zlib.crc32(b'IEND'))
    return png


W, H = 128, 128
pixels = []

for y in range(H):
    for x in range(W):

        factor = y / (H - 1)
        r = int(30 * (1 - factor) + 15 * factor)
        g = int(30 * (1 - factor) + 15 * factor)
        b = int(46 * (1 - factor) + 22 * factor)
        a = 255
        
   
        file_x1, file_y1, file_x2, file_y2 = 42, 28, 86, 100
        if file_x1 <= x <= file_x2 and file_y1 <= y <= file_y2:
            r, g, b = 36, 41, 46 
     
            if x == file_x1 or x == file_x2 or y == file_y1 or y == file_y2:
                r, g, b = 0, 168, 255
       
            elif 38 <= y <= 40 and x >= 48 and x <= 80:
                r, g, b = 120, 140, 160
            elif 50 <= y <= 52 and x >= 48 and x <= 80:
                r, g, b = 120, 140, 160
            elif 62 <= y <= 64 and x >= 48 and x <= 70:
                r, g, b = 120, 140, 160
            elif 74 <= y <= 76 and x >= 48 and x <= 78:
                r, g, b = 0, 168, 255
                
   
        curve_y = 82 + 8 * math.sin((x - 20) / 12)
        if 20 <= x <= 90:
            dist = abs(y - curve_y)
            if dist < 1.8:
                r, g, b = 255, 94, 87
                
     
        px, py = x, y
        ax, ay = 50, 82 
        bx, by = 90, 42 
        
        ab_x = bx - ax
        ab_y = by - ay
        ap_x = px - ax
        ap_y = py - ay
        ab_len2 = ab_x*ab_x + ab_y*ab_y
        if ab_len2 > 0:
            t = (ap_x*ab_x + ap_y*ab_y) / ab_len2
            if 0 <= t <= 1:
                proj_x = ax + t * ab_x
                proj_y = ay + t * ab_y
                dist_to_pencil = math.sqrt((px - proj_x)**2 + (py - proj_y)**2)
                if dist_to_pencil < 3.5:
                    if t > 0.88:
                        r, g, b = 255, 94, 87    
                    elif 0.08 <= t <= 0.88:
                        r, g, b = 255, 211, 42 
                    else:
                        r, g, b = 255, 255, 255 
                        
     
        dist_to_tip = math.sqrt((px - ax)**2 + (py - ay)**2)
        if dist_to_tip < 1.8:
            r, g, b = 40, 40, 40

        pixels.append((r, g, b, a))


os.makedirs('media', exist_ok=True)
png_data = make_png(W, H, pixels)
with open('media/icon.png', 'wb') as f:
    f.write(png_data)

print("The media folder has been created perfectly, and the 'media/icon.png' logo has been generated!")