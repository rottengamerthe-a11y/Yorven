import os
import json
from PIL import Image

ARTIFACT_DIR = r'C:\Users\dell\.gemini\antigravity\brain\320ccff4-020e-435d-bd4d-d5a4f1c8f974'
MANIFEST = os.path.join(ARTIFACT_DIR, 'hero_edges_verification_manifest.json')

def is_background(rgb):
    # Base background: #0a1210 -> (10, 18, 16)
    return abs(rgb[0] - 10) <= 6 and abs(rgb[1] - 18) <= 6 and abs(rgb[2] - 16) <= 6

def analyze_image(path):
    im = Image.open(path)
    w, h = im.size
    px = im.load()
    
    # 1. Test for hard horizontal straight cuts at any row
    # A hard horizontal cut occurs when along a row y, a significant cluster of adjacent columns (>30px)
    # are artwork (non-background) and immediately on row y+1 (or y-1) they abruptly become flat background
    # with zero vertical antialiasing/gradient, forming a straight horizontal line.
    hard_horizontal_cuts = []
    
    # Sample rows across middle 70% of image height (canvas area)
    y_min, y_max = int(h * 0.1), int(h * 0.9)
    for y in range(y_min, y_max - 1):
        # Count non-background pixels in row y and row y+1
        run = 0
        max_run = 0
        for x in range(0, w, 2):
            c_curr = not is_background(px[x, y][:3])
            c_next = not is_background(px[x, y + 1][:3])
            if c_curr and not c_next:
                run += 1
                if run > max_run: max_run = run
            else:
                run = 0
        if max_run > 30: # >= 60 contiguous pixels cut sharply on the exact same row
            hard_horizontal_cuts.append((y, max_run * 2))

    return {
        'file': os.path.basename(path),
        'size': (w, h),
        'hard_horizontal_cuts': hard_horizontal_cuts,
        'passed': len(hard_horizontal_cuts) == 0
    }

if __name__ == '__main__':
    with open(MANIFEST, 'r') as f:
        items = json.load(f)
    
    print(f'Analyzing {len(items)} screenshots using fast pixel buffer...')
    failures = []
    for item in items:
        p = item['path']
        res = analyze_image(p)
        if not res['passed']:
            failures.append(res)
            print(f"FAIL: {res['file']} - Horizontal cuts: {res['hard_horizontal_cuts']}")
        else:
            print(f"PASS: {res['file']}")
            
    print(f'\nTotal analyzed: {len(items)}, Failures: {len(failures)}')
    if len(failures) == 0:
        print('ALL EDGE PIXEL COMPARISONS PASSED. Zero hard horizontal cuts.')
