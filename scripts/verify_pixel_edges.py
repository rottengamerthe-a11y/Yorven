import json
import os
from PIL import Image

MANIFEST = r'C:\Users\dell\.gemini\antigravity\brain\320ccff4-020e-435d-bd4d-d5a4f1c8f974\hero_edges_verification_manifest.json'

def is_art(rgb):
    return max(rgb[:3]) > 50 or sum(rgb[:3]) > 100

def is_bg(rgb):
    return max(rgb[:3]) < 35

def main():
    with open(MANIFEST, 'r') as f:
        items = json.load(f)

    print(f'Checking {len(items)} screenshots for hard straight artwork cuts...')
    failures = []

    for item in items:
        im = Image.open(item['path'])
        w, h = im.size
        px = im.load()
        
        # Canvas area is between y = 50 and y = h - 220 (exclude details box buttons below)
        y_top = 50
        y_bot = h - 220
        
        hard_h_cuts = []
        for y in range(y_top, y_bot):
            # Look for a run of columns where row y is artwork and row y+1 is background
            run = 0
            max_run = 0
            for x in range(w):
                if is_art(px[x, y]) and is_bg(px[x, y+1]):
                    run += 1
                    if run > max_run: max_run = run
                else:
                    run = 0
            if max_run > 30: # 30 contiguous horizontal pixels
                hard_h_cuts.append((y, max_run))
                
        if hard_h_cuts:
            failures.append((item['file'], hard_h_cuts))
            print(f"FAIL: {item['file']} hard cuts: {hard_h_cuts}")
        else:
            print(f"PASS: {item['file']}")

    print(f'\nTotal screenshots: {len(items)}, Failures: {len(failures)}')
    if len(failures) == 0:
        print('SUCCESS: Zero hard horizontal artwork cuts across all 72 screenshots!')

if __name__ == '__main__':
    main()
