import glob, codecs, re, os

css_files = glob.glob('c:/3D_prj/VS_2022_prj/FlowerMoon_web/game*.css')
css_files += ['c:/3D_prj/VS_2022_prj/FlowerMoon_web/difficulty-selector.css',
              'c:/3D_prj/VS_2022_prj/FlowerMoon_web/level-selector.css',
              'c:/3D_prj/VS_2022_prj/FlowerMoon_web/gameMessage.css',
              'c:/3D_prj/VS_2022_prj/FlowerMoon_web/ruleNoteDialog.css']

def replacer(m):
    val = float(m.group(1))
    px_val = val * 20.0
    if px_val.is_integer():
        px_str = str(int(px_val))
    else:
        px_str = f"{px_val:.2f}".rstrip('0').rstrip('.')
    return f"{px_str}px /* {m.group(1)}rem -> {px_str}px */"

for file in css_files:
    if not os.path.exists(file): continue
    try:
        with codecs.open(file, 'r', 'utf-8-sig') as f: text = f.read()
    except:
        with codecs.open(file, 'r', 'utf-8', errors='ignore') as f: text = f.read()
        
    orig = text
    # Match something like: 1.5rem or -0.5rem
    # Only match if preceded by space, colon, minus or start of string
    text = re.sub(r'(?<=[:\s\-])(-?\d+(?:\.\d+)?)\s*rem\b', replacer, text)
    
    if text != orig:
        with codecs.open(file, 'w', 'utf-8') as f: f.write(text)
        print('Converted CSS:', file)
